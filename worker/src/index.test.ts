import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { handle, sha256, type Database, type Env, type Statement } from './index'

/**
 * D1 is SQLite, so the tests run the real migration and the real queries against
 * Node's own SQLite behind a thin adapter, batch as a transaction like D1's.
 */
function d1(db: DatabaseSync): Database {
  const statement = (sql: string, params: unknown[] = []): Statement & { exec(): unknown } => {
    const args = () => params as never[]
    return {
      bind: (...values: unknown[]) => statement(sql, values),
      all: async <T>() => ({ results: db.prepare(sql).all(...args()) as T[] }),
      first: async <T>() => (db.prepare(sql).get(...args()) as T | undefined) ?? null,
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args()).changes) } }),
      exec: () =>
        /\breturning\b/i.test(sql)
          ? { results: db.prepare(sql).all(...args()), meta: { changes: 1 } }
          : { meta: { changes: Number(db.prepare(sql).run(...args()).changes) } },
    }
  }
  return {
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      db.exec('begin')
      try {
        const out = statements.map((one) => (one as ReturnType<typeof statement>).exec())
        db.exec('commit')
        return out as { results?: unknown[]; meta: { changes: number } }[]
      } catch (error) {
        db.exec('rollback')
        throw error
      }
    },
  }
}

const ADMIN = 'codigo-admin'
const CODES = { dailyflow: 'codigo-dailyflow', 'markdown-viewer': 'codigo-mv' }
let env: Env

beforeEach(async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'))
  env = { DB: d1(sqlite), ADMIN_HASH: await sha256(ADMIN) }
  for (const [id, code] of Object.entries(CODES)) {
    const res = await call('POST', '/v1/admin/apps', ADMIN, {
      id,
      name: id,
      repo: `https://github.com/megomes/${id}`,
      accessHash: await sha256(code),
    })
    expect(res.status).toBe(200)
  }
})

async function call(method: string, path: string, token: string, payload?: unknown) {
  const res = await handle(
    new Request('https://kit.test' + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'x-device-id': 'mac-1' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
    env,
  )
  return { status: res.status, data: (await res.json()) as Record<string, any> }
}

const app = (id: keyof typeof CODES) => ({
  get: () => call('GET', `/v1/apps/${id}/notes`, CODES[id]),
  post: (payload: unknown) => call('POST', `/v1/apps/${id}/notes`, CODES[id], payload),
  patch: (n: number, payload: unknown) => call('PATCH', `/v1/apps/${id}/notes/${n}`, CODES[id], payload),
  del: (n: number) => call('DELETE', `/v1/apps/${id}/notes/${n}`, CODES[id]),
  claude: (n: number, payload: unknown) =>
    call('POST', `/v1/admin/apps/${id}/notes/${n}/claude`, ADMIN, payload),
})

describe('access', () => {
  it('needs the app own code', async () => {
    expect((await call('GET', '/v1/apps/dailyflow/notes', CODES['markdown-viewer'])).status).toBe(401)
    expect((await call('GET', '/v1/apps/dailyflow/notes', 'nada')).status).toBe(401)
    expect((await app('dailyflow').get()).status).toBe(200)
  })

  it('answers an unknown app like a wrong code', async () => {
    expect((await call('GET', '/v1/apps/nope/notes', CODES.dailyflow)).status).toBe(401)
  })

  it('keeps the admin door for the admin code', async () => {
    expect((await call('GET', '/v1/admin/apps', CODES.dailyflow)).status).toBe(401)
    const res = await call('GET', '/v1/admin/apps', ADMIN)
    expect(res.data.apps.map((a: { id: string }) => a.id)).toEqual(['dailyflow', 'markdown-viewer'])
  })
})

describe('notes', () => {
  it('numbers each app on its own', async () => {
    expect((await app('dailyflow').post({ body: 'um', kind: 'bug' })).data.id).toBe(1)
    expect((await app('dailyflow').post({ body: 'dois' })).data.id).toBe(2)
    expect((await app('markdown-viewer').post({ body: 'outro app' })).data.id).toBe(1)
    const { data } = await app('dailyflow').get()
    expect(data.app.repo).toBe('https://github.com/megomes/dailyflow')
    expect(data.notes.map((n: { id: number }) => n.id)).toEqual([2, 1])
  })

  it('never reuses a deleted number', async () => {
    await app('dailyflow').post({ body: 'um' })
    expect((await app('dailyflow').del(1)).status).toBe(200)
    expect((await app('dailyflow').post({ body: 'dois' })).data.id).toBe(2)
  })

  it('takes a retried note once', async () => {
    const note = { body: 'offline', clientId: 'abc' }
    expect((await app('dailyflow').post(note)).data.id).toBe(1)
    expect((await app('dailyflow').post(note)).data.id).toBe(1)
    expect((await app('dailyflow').get()).data.notes).toHaveLength(1)
  })

  it('edits only an open note, and logs the old text', async () => {
    await app('dailyflow').post({ body: 'antes' })
    expect((await app('dailyflow').patch(1, { body: 'depois', kind: 'ux' })).status).toBe(200)
    await app('dailyflow').claude(1, { status: 'in_progress', message: 'Começando' })
    expect((await app('dailyflow').patch(1, { body: 'de novo', kind: 'ux' })).status).toBe(409)
    const [note] = (await app('dailyflow').get()).data.notes
    expect(note.body).toBe('depois')
    expect(note.log.find((l: { action: string }) => l.action === 'edited').detail.from).toBe('antes')
  })
})

describe("Claude's work and the 👍/👎", () => {
  it('merges the resolution and keeps the conversation in the log', async () => {
    await app('dailyflow').post({ body: 'faz X' })
    await app('dailyflow').claude(1, {
      status: 'done',
      message: 'Feito',
      resolution: { summary: 'X', done: ['a'], commits: ['abc1234'] },
    })
    expect((await app('dailyflow').patch(1, { action: 'reject', comment: 'falta b' })).status).toBe(200)
    await app('dailyflow').claude(1, {
      status: 'done',
      message: 'Corrigido',
      resolution: { done: ['a', 'b'] },
    })
    expect((await app('dailyflow').patch(1, { action: 'confirm' })).status).toBe(200)

    const [note] = (await app('dailyflow').get()).data.notes
    expect(note.status).toBe('archived')
    expect(note.resolution).toEqual({ summary: 'X', done: ['a', 'b'], commits: ['abc1234'] })
    expect(note.log.map((l: { action: string }) => l.action)).toEqual([
      'created',
      'status',
      'rejected',
      'status',
      'confirmed',
    ])
    expect(note.log[2].message).toBe('falta b')
  })

  it('only confirms a delivered note', async () => {
    await app('dailyflow').post({ body: 'faz X' })
    expect((await app('dailyflow').patch(1, { action: 'confirm' })).status).toBe(409)
  })

  it('refuses a status only Matheus may set', async () => {
    await app('dailyflow').post({ body: 'faz X' })
    expect((await app('dailyflow').claude(1, { status: 'archived', message: 'x' })).status).toBe(400)
    expect((await app('dailyflow').claude(9, { status: 'done', message: 'x' })).data.error).toBe(
      'note not found',
    )
  })

  it('lists for the CLI without the archived, or by number', async () => {
    await app('dailyflow').post({ body: 'um' })
    await app('dailyflow').post({ body: 'dois' })
    await app('dailyflow').claude(1, { status: 'done', message: 'ok' })
    await app('dailyflow').patch(1, { action: 'confirm' })
    const active = await call('GET', '/v1/admin/apps/dailyflow/notes', ADMIN)
    expect(active.data.notes.map((n: { id: number }) => n.id)).toEqual([2])
    const picked = await call('GET', '/v1/admin/apps/dailyflow/notes?ids=1,2', ADMIN)
    expect(picked.data.notes.map((n: { id: number }) => n.id)).toEqual([1, 2])
    const one = await call('GET', '/v1/admin/apps/dailyflow/notes/2', ADMIN)
    expect(one.data.note.body).toBe('dois')
  })
})
