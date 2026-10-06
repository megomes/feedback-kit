/**
 * feedback-kit: a API do feedback de todos os apps.
 *
 * Herdeira das rotas `/api/notes` do DailyFlow e do Worker do markdown-viewer, com as
 * mesmas regras: número sequencial por app que nunca volta, exclusão lógica, editar e
 * excluir só com a nota aberta, confirmar e reabrir só depois de entregue, e cada
 * mudança gravada no histórico com o contexto de onde foi feita.
 *
 * Duas portas:
 * - `/v1/apps/:app/notes[/:n]`: a do widget, com o código de acesso do app.
 * - `/v1/admin/...`: a do Claude (o CLI), com o código de administração.
 *
 * O widget em si (`/v1/widget.js`) é um arquivo estático servido pelos assets do
 * Worker; nada aqui o toca.
 */

/** The slice of D1 this Worker uses, so the tests can stand SQLite behind it. */
export interface Statement {
  bind(...values: unknown[]): Statement
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ meta: { changes: number } }>
}
export interface Database {
  prepare(sql: string): Statement
  batch(statements: Statement[]): Promise<{ results?: unknown[]; meta: { changes: number } }[]>
}

export interface Env {
  DB: Database
  /** SHA-256, in hex, of the administration code the CLI sends as a bearer token. */
  ADMIN_HASH: string
  VERSION?: { id?: string; tag?: string }
}

const KINDS = ['bug', 'idea', 'ux', 'question'] as const
type Kind = (typeof KINDS)[number]
const CLAUDE_STATUSES = ['open', 'discussing', 'in_progress', 'done', 'ignored']
const MAX_BODY = 5000
const MAX_CONTEXT = 16_000

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-device-id',
  'access-control-max-age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  })
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Compares in constant time, so the hash cannot be found a byte at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function bearer(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

async function matches(req: Request, hash: string | null | undefined): Promise<boolean> {
  const token = bearer(req)
  if (!token || !hash) return false
  return same(await sha256(token), hash.toLowerCase())
}

interface Cf {
  country?: string
  region?: string
  city?: string
  colo?: string
}

/** Where the request came from. */
export function serverContext(req: Request, env: Env) {
  const cf = (req as Request & { cf?: Cf }).cf ?? {}
  return {
    userAgent: req.headers.get('user-agent') ?? undefined,
    origin: req.headers.get('origin') ?? undefined,
    country: cf.country,
    region: cf.region,
    city: cf.city,
    colo: cf.colo,
    build: env.VERSION?.tag || env.VERSION?.id?.slice(0, 8) || 'local',
    env: env.VERSION?.id ? 'production' : 'development',
    receivedAt: new Date().toISOString(),
  }
}

/** Client context is kept whole unless it is unreasonably large. */
function clampContext(ctx: unknown): Record<string, unknown> {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {}
  return JSON.stringify(ctx).length > MAX_CONTEXT
    ? { truncated: true }
    : (ctx as Record<string, unknown>)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 1 && trimmed.length <= MAX_BODY ? trimmed : null
}

function short(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function isKind(value: unknown): value is Kind {
  return KINDS.includes(value as Kind)
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await req.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

interface AppRow {
  id: string
  name: string
  repo: string | null
  access_hash: string
}

interface Row {
  id: number
  body: string
  kind: Kind
  status: string
  stage: string | null
  appVersion: string | null
  screen: string | null
  resolution: string
  context: string
  createdAt: string
  updatedAt: string
  log: string
}

const SELECT_NOTE = `
  select n.number as id, n.body, n.kind, n.status, n.stage, n.app_version as appVersion,
         n.screen, n.resolution, n.context, n.created_at as createdAt, n.updated_at as updatedAt,
         (select json_group_array(json_object('ts', l.ts, 'actor', l.actor, 'action', l.action,
                                              'message', l.message, 'detail', json(l.detail)))
            from (select * from note_log where note_id = n.id order by ts, id) l) as log
    from notes n`

function parseRow(row: Row) {
  return {
    ...row,
    resolution: JSON.parse(row.resolution) as unknown,
    context: JSON.parse(row.context) as unknown,
    log: JSON.parse(row.log ?? '[]') as unknown,
  }
}

async function findApp(env: Env, id: string): Promise<AppRow | null> {
  return env.DB.prepare(`select id, name, repo, access_hash from apps where id = ?`)
    .bind(id)
    .first<AppRow>()
}

/* ------------------------------------------------------------ the widget's door */

/** Every note of the app with its full history, newest first. */
async function list(env: Env, app: AppRow): Promise<Response> {
  const { results } = await env.DB.prepare(
    `${SELECT_NOTE} where n.app = ? and n.deleted = 0 order by n.number desc`,
  )
    .bind(app.id)
    .all<Row>()
  return json({ app: { id: app.id, name: app.name, repo: app.repo }, notes: results.map(parseRow) })
}

/** Creates a note with the app's next number and logs it. */
async function create(req: Request, env: Env, app: AppRow): Promise<Response> {
  const input = await body(req)
  const note = text(input?.body)
  const kind = input?.kind ?? 'idea'
  if (!input || !note || !isKind(kind)) return json({ error: 'invalid body' }, 400)
  const screen = input.screen === undefined ? null : short(input.screen, 64)
  const clientId = input.clientId === undefined ? null : short(input.clientId, 64)
  const client = clampContext(input.context)
  const context = { ...client, server: serverContext(req, env) }
  const appInfo = (client.app ?? {}) as { version?: unknown; stage?: unknown }
  const device = req.headers.get('x-device-id')?.slice(0, 64) ?? null

  // A note sent twice (the offline queue retrying after a lost answer) is the same note.
  if (clientId) {
    const known = await env.DB.prepare(
      `select n.number from note_log l join notes n on n.id = l.note_id
        where n.app = ? and l.action = 'created' and json_extract(l.detail, '$.client_id') = ?`,
    )
      .bind(app.id, clientId)
      .first<{ number: number }>()
    if (known) return json({ id: known.number })
  }

  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `insert into notes (app, number, body, kind, stage, app_version, screen, device_id, context)
       select ?, coalesce(max(number), 0) + 1, ?, ?, ?, ?, ?, ?, ? from notes where app = ?
       returning number`,
    ).bind(
      app.id,
      note,
      kind,
      typeof appInfo.stage === 'string' ? appInfo.stage.slice(0, 64) : null,
      typeof appInfo.version === 'string' ? appInfo.version.slice(0, 64) : null,
      screen,
      device,
      JSON.stringify(context),
      app.id,
    ),
    env.DB.prepare(
      `insert into note_log (note_id, actor, action, detail)
       select id, 'user', 'created', json_object('kind', kind, 'client_id', ?)
         from notes where id = last_insert_rowid()`,
    ).bind(clientId),
  ])
  const created = inserted?.results?.[0] as { number: number } | undefined
  if (!created) return json({ error: 'not created' }, 500)
  return json({ id: created.number })
}

const TRANSITIONS = {
  confirm: { to: 'archived', log: 'confirmed' },
  reject: { to: 'open', log: 'rejected' },
  reopen: { to: 'open', log: 'reopened' },
} as const

/**
 * Edit text/kind (only while the note is open, previous values are logged) or move a
 * done/ignored note on: 👍 confirm archives it, 👎 reject reopens it with what is still
 * wrong. Returns 409 when the note is not in a state that allows the change.
 */
async function patch(req: Request, env: Env, app: AppRow, n: number): Promise<Response> {
  const input = await body(req)
  if (!input) return json({ error: 'invalid' }, 400)
  const where = JSON.stringify({
    ...clampContext(input.context),
    server: serverContext(req, env),
  })

  let statements: Statement[]
  if ('action' in input) {
    const action = input.action
    if (action !== 'confirm' && action !== 'reject' && action !== 'reopen') {
      return json({ error: 'invalid' }, 400)
    }
    const comment = action === 'reject' ? text(input.comment) : null
    if (action === 'reject' && !comment) return json({ error: 'invalid' }, 400)
    const transition = TRANSITIONS[action]
    const delivered = `app = ? and number = ? and deleted = 0 and status in ('done', 'ignored')`
    statements = [
      env.DB.prepare(
        `insert into note_log (note_id, actor, action, message, detail)
         select id, 'user', ?, ?, json_object('from', status, 'context', json(?))
           from notes where ${delivered}`,
      ).bind(transition.log, comment, where, app.id, n),
      env.DB.prepare(
        `update notes set status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          where ${delivered}`,
      ).bind(transition.to, app.id, n),
    ]
  } else {
    const note = text(input.body)
    if (!note || !isKind(input.kind)) return json({ error: 'invalid' }, 400)
    const open = `app = ? and number = ? and deleted = 0 and status = 'open'`
    statements = [
      env.DB.prepare(
        `insert into note_log (note_id, actor, action, detail)
         select id, 'user', 'edited',
                json_object('from', body, 'to', ?, 'kind_from', kind, 'kind_to', ?, 'context', json(?))
           from notes where ${open}`,
      ).bind(note, input.kind, where, app.id, n),
      env.DB.prepare(
        `update notes set body = ?, kind = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          where ${open}`,
      ).bind(note, input.kind, app.id, n),
    ]
  }
  const results = await env.DB.batch(statements)
  if (!results[1]?.meta.changes) return json({ error: 'locked' }, 409)
  return json({ ok: true })
}

/** Soft-deletes an open note (the number is never reused). */
async function remove(req: Request, env: Env, app: AppRow, n: number): Promise<Response> {
  const open = `app = ? and number = ? and deleted = 0 and status = 'open'`
  const results = await env.DB.batch([
    env.DB.prepare(
      `insert into note_log (note_id, actor, action, detail)
       select id, 'user', 'deleted', json_object('body', body, 'context', json(?))
         from notes where ${open}`,
    ).bind(JSON.stringify({ server: serverContext(req, env) }), app.id, n),
    env.DB.prepare(
      `update notes set deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        where ${open}`,
    ).bind(app.id, n),
  ])
  if (!results[1]?.meta.changes) return json({ error: 'locked' }, 409)
  return json({ ok: true })
}

async function appRoute(
  req: Request,
  env: Env,
  appId: string,
  n: number | null,
): Promise<Response> {
  const app = await findApp(env, appId)
  // An unknown app answers like a wrong code, so app names cannot be probed.
  if (!app || !(await matches(req, app.access_hash))) return json({ error: 'unauthorized' }, 401)
  if (n === null) {
    if (req.method === 'GET') return list(env, app)
    if (req.method === 'POST') return create(req, env, app)
    return json({ error: 'method not allowed' }, 405)
  }
  if (req.method === 'PATCH') return patch(req, env, app, n)
  if (req.method === 'DELETE') return remove(req, env, app, n)
  return json({ error: 'method not allowed' }, 405)
}

/* ------------------------------------------------------------- Claude's door */

async function adminRoute(req: Request, env: Env, parts: string[]): Promise<Response> {
  if (!(await matches(req, env.ADMIN_HASH))) return json({ error: 'unauthorized' }, 401)

  // GET /v1/admin/apps · POST /v1/admin/apps
  if (parts.length === 1 && parts[0] === 'apps') {
    if (req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `select a.id, a.name, a.repo, a.created_at as createdAt,
                (select count(*) from notes n where n.app = a.id and n.deleted = 0
                    and n.status <> 'archived') as active
           from apps a order by a.id`,
      ).all()
      return json({ apps: results })
    }
    if (req.method === 'POST') {
      const input = await body(req)
      const id = short(input?.id, 40)
      const name = text(input?.name)
      const hash = short(input?.accessHash, 64)
      const repo = input?.repo == null ? null : short(input.repo, 200)
      if (!id || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || !name || !hash || !/^[0-9a-f]{64}$/.test(hash)) {
        return json({ error: 'invalid' }, 400)
      }
      await env.DB.prepare(
        `insert into apps (id, name, repo, access_hash) values (?, ?, ?, ?)
         on conflict (id) do update set name = excluded.name, repo = excluded.repo,
                                        access_hash = excluded.access_hash`,
      )
        .bind(id, name, repo, hash)
        .run()
      return json({ ok: true })
    }
    return json({ error: 'method not allowed' }, 405)
  }

  if (parts[0] !== 'apps' || !parts[1] || parts[2] !== 'notes') return json({ error: 'not found' }, 404)
  const app = await findApp(env, parts[1])
  if (!app) return json({ error: 'app not found' }, 404)

  // GET /v1/admin/apps/:app/notes?ids=2,3&archived=1
  if (parts.length === 3 && req.method === 'GET') {
    const url = new URL(req.url)
    const ids = (url.searchParams.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter((x) => Number.isInteger(x) && x > 0)
    const filter = ids.length
      ? `and n.number in (${ids.join(', ')})`
      : url.searchParams.get('archived')
        ? ''
        : `and n.status <> 'archived'`
    const { results } = await env.DB.prepare(
      `${SELECT_NOTE} where n.app = ? and n.deleted = 0 ${filter} order by n.number`,
    )
      .bind(app.id)
      .all<Row>()
    return json({ app: { id: app.id, name: app.name, repo: app.repo }, notes: results.map(parseRow) })
  }

  const n = Number(parts[3])
  if (!Number.isInteger(n) || n <= 0) return json({ error: 'invalid' }, 400)

  // GET /v1/admin/apps/:app/notes/:n
  if (parts.length === 4 && req.method === 'GET') {
    const row = await env.DB.prepare(`${SELECT_NOTE} where n.app = ? and n.number = ? and n.deleted = 0`)
      .bind(app.id, n)
      .first<Row>()
    return row ? json({ note: parseRow(row) }) : json({ error: 'note not found' }, 404)
  }

  // POST /v1/admin/apps/:app/notes/:n/claude  { status?, message, resolution? }
  if (parts.length === 5 && parts[4] === 'claude' && req.method === 'POST') {
    const input = await body(req)
    if (!input) return json({ error: 'invalid' }, 400)
    const status = input.status == null ? null : String(input.status)
    if (status !== null && !CLAUDE_STATUSES.includes(status)) return json({ error: 'invalid status' }, 400)
    const message = typeof input.message === 'string' ? input.message.slice(0, MAX_BODY) : null
    const resolution = input.resolution ?? {}
    if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
      return json({ error: 'resolution must be a JSON object' }, 400)
    }
    try {
      await env.DB.prepare(
        `insert into note_claude (app, number, status, message, resolution) values (?, ?, ?, ?, ?)`,
      )
        .bind(app.id, n, status, message, JSON.stringify(resolution))
        .run()
    } catch (error) {
      const reason = String(error)
      return json({ error: /note not found/.test(reason) ? 'note not found' : reason }, 400)
    }
    const row = await env.DB.prepare(`select number as id, status from notes where app = ? and number = ?`)
      .bind(app.id, n)
      .first()
    return json({ note: row })
  }

  return json({ error: 'not found' }, 404)
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'v1') return json({ error: 'not found' }, 404)

  if (parts[1] === 'admin') return adminRoute(req, env, parts.slice(2))

  // /v1/apps/:app/notes[/:n]
  if (parts[1] === 'apps' && parts[2] && parts[3] === 'notes' && parts.length <= 5) {
    const n = parts[4] === undefined ? null : Number(parts[4])
    if (n !== null && (!Number.isInteger(n) || n <= 0)) return json({ error: 'invalid' }, 400)
    return appRoute(req, env, parts[2], n)
  }
  return json({ error: 'not found' }, 404)
}

export default { fetch: handle }
