/**
 * feedback-kit: a API do feedback de todos os apps.
 *
 * Herdeira das rotas `/api/notes` do DailyFlow e do Worker do markdown-viewer, com as
 * mesmas regras: número sequencial por app que nunca volta, exclusão lógica, editar e
 * excluir só com a nota aberta, confirmar e reabrir só depois de entregue, e cada
 * mudança gravada no histórico com o contexto de onde foi feita.
 *
 * Três portas:
 * - `/v1/apps/:app/notes[/:n]`: a do widget, com o código de acesso do app.
 * - `/v1/apps/:app/runs[/:id/...]`: as execuções remotas, do widget também, com o código
 *   do app e mais o código de execução (`x-run-code`), que só o Matheus tem.
 * - `/v1/admin/...`: a do Claude (o CLI) e a do agente do PC, com o código de administração.
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
  /**
   * SHA-256, in hex, of the code that may start, cancel and undo runs on the agent's
   * computer. Unset: remote runs are off.
   */
  RUN_HASH?: string
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
  'access-control-allow-headers': 'authorization, content-type, x-device-id, x-run-code',
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

  // The agent on the computer: POST /v1/admin/agent/poll · POST /v1/admin/runs/:id
  if (parts.join('/') === 'agent/poll' && req.method === 'POST') return agentPoll(req, env)
  if (parts[0] === 'runs' && parts.length === 2 && req.method === 'POST') {
    const id = Number(parts[1])
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid' }, 400)
    return agentReport(req, env, id)
  }

  // The agent's own panel on the computer: every app's runs, and the widget's actions.
  // GET /v1/admin/runs?limit=200 · POST /v1/admin/runs/:id/cancel|rollback · POST /v1/admin/apps/:app/runs
  if (parts.length === 1 && parts[0] === 'runs' && req.method === 'GET') return allRuns(req, env)
  if (parts[0] === 'runs' && parts.length === 3 && req.method === 'POST') {
    const id = Number(parts[1])
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid' }, 400)
    const row = await env.DB.prepare(`select app from runs where id = ?`).bind(id).first<{ app: string }>()
    const app = row ? await findApp(env, row.app) : null
    if (!app) return json({ error: 'run not found' }, 404)
    if (parts[2] === 'cancel') return cancelRun(env, app, id)
    if (parts[2] === 'rollback') return rollbackRun(env, app, id)
    return json({ error: 'not found' }, 404)
  }
  if (parts[0] === 'apps' && parts.length === 3 && parts[2] === 'runs' && req.method === 'POST') {
    const app = await findApp(env, parts[1] ?? '')
    if (!app) return json({ error: 'app not found' }, 404)
    return queueRun(req, env, app)
  }

  // GET /v1/admin/apps · POST /v1/admin/apps
  if (parts.length === 1 && parts[0] === 'apps') {
    if (req.method === 'GET') {
      const { results } = await env.DB.prepare(
        `select a.id, a.name, a.repo, a.created_at as createdAt,
                (select count(*) from notes n where n.app = a.id and n.deleted = 0
                    and n.status <> 'archived') as active,
                (select count(*) from notes n where n.app = a.id and n.deleted = 0
                    and n.status = 'open') as open
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

/* ------------------------------------------------------------- remote runs */

/** An agent that asked for work this recently is online (it asks every ~20 s). */
const ONLINE_MS = 120_000
const MAX_INSTRUCTIONS = 2000
const MAX_MESSAGES = 200

interface RunRow {
  id: number
  app: string
  kind: 'work' | 'rollback'
  notes: string
  instructions: string | null
  target_run: number | null
  status: string
  agent: string | null
  base_sha: string | null
  head_sha: string | null
  commits: string
  messages: string
  summary: string | null
  error: string | null
  stats: string
  rolled_back_by: number | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

interface AgentRow {
  id: string
  name: string
  apps: string
  usage: string
  version: string | null
  last_seen: string
}

function parseRun(row: RunRow) {
  return {
    id: row.id,
    app: row.app,
    kind: row.kind,
    notes: JSON.parse(row.notes) as number[],
    instructions: row.instructions,
    targetRun: row.target_run,
    status: row.status,
    agent: row.agent,
    baseSha: row.base_sha,
    headSha: row.head_sha,
    commits: JSON.parse(row.commits) as string[],
    messages: JSON.parse(row.messages) as string[],
    summary: row.summary,
    error: row.error,
    stats: JSON.parse(row.stats) as Record<string, unknown>,
    rolledBackBy: row.rolled_back_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  }
}

function parseAgent(row: AgentRow, now = Date.now()) {
  return {
    id: row.id,
    name: row.name,
    apps: JSON.parse(row.apps) as string[],
    usage: JSON.parse(row.usage) as Record<string, unknown>,
    version: row.version,
    lastSeen: row.last_seen,
    online: now - Date.parse(row.last_seen) < ONLINE_MS,
  }
}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
const ACTIVE = `status in ('queued', 'running')`

async function getRun(env: Env, app: string, id: number): Promise<RunRow | null> {
  return env.DB.prepare(`select * from runs where app = ? and id = ?`).bind(app, id).first<RunRow>()
}

/** The run history of an app and the computer that would take a new one. */
async function listRuns(env: Env, app: AppRow): Promise<Response> {
  const [runs, agents, open] = await Promise.all([
    env.DB.prepare(`select * from runs where app = ? order by id desc limit 20`).bind(app.id).all<RunRow>(),
    // The computer serving this app; or, if none does, the last one seen, so the panel
    // can say it is on but has no folder for this app.
    env.DB.prepare(
      `select a.* from agents a
        order by exists (select 1 from json_each(a.apps) where value = ?) desc, a.last_seen desc limit 1`,
    )
      .bind(app.id)
      .all<AgentRow>(),
    env.DB.prepare(`select number from notes where app = ? and deleted = 0 and status = 'open' order by number`)
      .bind(app.id)
      .all<{ number: number }>(),
  ])
  const agent = agents.results[0]
  return json({
    runs: runs.results.map(parseRun),
    agent: agent ? { ...parseAgent(agent), servesApp: (JSON.parse(agent.apps) as string[]).includes(app.id) } : null,
    open: open.results.map((r) => r.number),
  })
}

/** Every app's latest runs and every agent, for the panel on the computer. */
async function allRuns(req: Request, env: Env): Promise<Response> {
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 200))
  const [runs, agents] = await Promise.all([
    env.DB.prepare(`select * from runs order by id desc limit ?`).bind(limit).all<RunRow>(),
    env.DB.prepare(`select * from agents order by last_seen desc`).all<AgentRow>(),
  ])
  return json({ runs: runs.results.map(parseRun), agents: agents.results.map((a) => parseAgent(a)) })
}

/** Queues the open notes (or the ones picked) for the agent. One active run per app. */
async function queueRun(req: Request, env: Env, app: AppRow): Promise<Response> {
  const input = (await body(req)) ?? {}
  const picked = Array.isArray(input.notes)
    ? input.notes.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : []
  const instructions =
    input.instructions == null || input.instructions === ''
      ? null
      : typeof input.instructions === 'string' && input.instructions.length <= MAX_INSTRUCTIONS
        ? input.instructions.trim()
        : undefined
  if (instructions === undefined) return json({ error: 'invalid' }, 400)

  // Only open notes go (a 👎 reopens one): the rest is in someone's hands already.
  const { results } = await env.DB.prepare(
    `select number from notes where app = ? and deleted = 0 and status = 'open' order by number`,
  )
    .bind(app.id)
    .all<{ number: number }>()
  const open = results.map((r) => r.number)
  const notes = picked.length ? picked.filter((n) => open.includes(n)) : open
  if (!notes.length) return json({ error: 'nothing to run' }, 400)

  const inserted = await env.DB.prepare(
    `insert into runs (app, kind, notes, instructions)
     select ?, 'work', ?, ? where not exists (select 1 from runs where app = ? and ${ACTIVE})
     returning *`,
  )
    .bind(app.id, JSON.stringify(notes), instructions, app.id)
    .first<RunRow>()
  if (!inserted) return json({ error: 'busy' }, 409)
  return json({ run: parseRun(inserted) })
}

/** Stops a run: a queued one never starts, a running one is killed at the next report. */
async function cancelRun(env: Env, app: AppRow, id: number): Promise<Response> {
  const { meta } = await env.DB.prepare(
    `update runs set status = 'canceled', finished_at = coalesce(finished_at, ${NOW}), updated_at = ${NOW}
      where app = ? and id = ? and ${ACTIVE}`,
  )
    .bind(app.id, id)
    .run()
  return meta.changes ? json({ ok: true }) : json({ error: 'not active' }, 409)
}

/** Queues the undoing of a run that changed the repository: `git revert` of its commits. */
async function rollbackRun(env: Env, app: AppRow, id: number): Promise<Response> {
  const target = await getRun(env, app.id, id)
  if (!target) return json({ error: 'run not found' }, 404)
  const changed = target.base_sha && target.head_sha && target.base_sha !== target.head_sha
  if (target.kind !== 'work' || !changed || target.rolled_back_by || ['queued', 'running'].includes(target.status)) {
    return json({ error: 'cannot roll back' }, 409)
  }
  const inserted = await env.DB.prepare(
    `insert into runs (app, kind, notes, target_run)
     select ?, 'rollback', ?, ?
      where not exists (select 1 from runs where app = ? and ${ACTIVE})
        and not exists (select 1 from runs where kind = 'rollback' and target_run = ? and status in ('queued', 'running', 'done'))
     returning *`,
  )
    .bind(app.id, target.notes, target.id, app.id, target.id)
    .first<RunRow>()
  if (!inserted) return json({ error: 'busy' }, 409)
  return json({ run: parseRun(inserted) })
}

async function runRoute(req: Request, env: Env, appId: string, rest: string[]): Promise<Response> {
  const app = await findApp(env, appId)
  if (!app || !(await matches(req, app.access_hash))) return json({ error: 'unauthorized' }, 401)
  // The app's code lets anyone with the app write notes; running code on the computer
  // takes the owner's own code on top of it.
  const runCode = req.headers.get('x-run-code')?.trim() ?? ''
  if (!env.RUN_HASH) return json({ error: 'runs disabled' }, 403)
  if (!runCode || !same(await sha256(runCode), env.RUN_HASH.toLowerCase())) {
    return json({ error: 'run code' }, 403)
  }

  if (rest.length === 0) {
    if (req.method === 'GET') return listRuns(env, app)
    if (req.method === 'POST') return queueRun(req, env, app)
    return json({ error: 'method not allowed' }, 405)
  }
  const id = Number(rest[0])
  if (!Number.isInteger(id) || id <= 0 || rest.length !== 2 || req.method !== 'POST') {
    return json({ error: 'not found' }, 404)
  }
  if (rest[1] === 'cancel') return cancelRun(env, app, id)
  if (rest[1] === 'rollback') return rollbackRun(env, app, id)
  return json({ error: 'not found' }, 404)
}

/**
 * POST /v1/admin/agent/poll { id, name, apps[], usage?, version?, paused?, current? }
 *
 * The agent's one call while idle: says it is alive (and how the Claude limits look),
 * gives up any run it lost by restarting, and takes the oldest queued run of its apps.
 */
async function agentPoll(req: Request, env: Env): Promise<Response> {
  const input = await body(req)
  const id = short(input?.id, 64)
  const name = short(input?.name, 100)
  const apps = Array.isArray(input?.apps) ? input.apps.filter((a): a is string => typeof a === 'string') : null
  if (!input || !id || !name || !apps) return json({ error: 'invalid' }, 400)
  const usage = input.usage && typeof input.usage === 'object' ? clampContext(input.usage) : {}
  const current = input.current == null ? null : Number(input.current)

  await env.DB.batch([
    env.DB.prepare(
      `insert into agents (id, name, apps, usage, version, last_seen) values (?, ?, ?, ?, ?, ${NOW})
       on conflict (id) do update set name = excluded.name, apps = excluded.apps, usage = excluded.usage,
                                      version = excluded.version, last_seen = excluded.last_seen`,
    ).bind(id, name, JSON.stringify(apps), JSON.stringify(usage), short(input.version, 32)),
    // A run this agent holds but no longer works on died with the previous process.
    env.DB.prepare(
      `update runs set status = 'failed', error = 'O agente reiniciou no meio da execução.',
                       finished_at = ${NOW}, updated_at = ${NOW}
        where agent = ? and status = 'running' and id is not ?`,
    ).bind(id, current),
  ])

  if (input.paused || current != null || !apps.length) return json({ run: null })
  const claimed = await env.DB.prepare(
    `update runs set status = 'running', agent = ?, started_at = ${NOW}, updated_at = ${NOW}
      where id = (select id from runs where status = 'queued'
                     and app in (select value from json_each(?)) order by id limit 1)
        and status = 'queued'
      returning *`,
  )
    .bind(id, JSON.stringify(apps))
    .first<RunRow>()
  if (!claimed) return json({ run: null })

  const run = parseRun(claimed)
  const target = claimed.target_run ? await getRun(env, claimed.app, claimed.target_run) : null
  return json({ run, target: target ? parseRun(target) : null })
}

/**
 * POST /v1/admin/runs/:id { status?, baseSha?, headSha?, commits?, messages?, summary?, error?, stats? }
 *
 * The agent's report, as the run goes and at its end. Answers the run's status, so the
 * agent learns of a cancel and stops.
 */
async function agentReport(req: Request, env: Env, id: number): Promise<Response> {
  const input = await body(req)
  if (!input) return json({ error: 'invalid' }, 400)
  const status = input.status == null ? null : String(input.status)
  if (status !== null && !['running', 'done', 'failed'].includes(status)) return json({ error: 'invalid status' }, 400)
  const strings = (value: unknown, max: number) =>
    Array.isArray(value) ? JSON.stringify(value.filter((v) => typeof v === 'string').slice(-max)) : null
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : null)
  const stats = input.stats && typeof input.stats === 'object' ? JSON.stringify(clampContext(input.stats)) : null
  const finishing = status === 'done' || status === 'failed'

  const row = await env.DB.prepare(
    `update runs set
        status = case when status = 'running' and ? is not null then ? else status end,
        base_sha = coalesce(?, base_sha), head_sha = coalesce(?, head_sha),
        commits = coalesce(?, commits), messages = coalesce(?, messages),
        summary = coalesce(?, summary), error = coalesce(?, error), stats = coalesce(?, stats),
        finished_at = case when ? then coalesce(finished_at, ${NOW}) else finished_at end,
        updated_at = ${NOW}
      where id = ? returning *`,
  )
    .bind(
      status,
      status,
      short(input.baseSha, 64),
      short(input.headSha, 64),
      strings(input.commits, 100),
      strings(input.messages, MAX_MESSAGES),
      text(input.summary, 20_000),
      text(input.error, 5000),
      stats,
      finishing ? 1 : 0,
      id,
    )
    .first<RunRow>()
  if (!row) return json({ error: 'run not found' }, 404)
  if (row.agent) {
    await env.DB.prepare(`update agents set last_seen = ${NOW} where id = ?`).bind(row.agent).run()
  }
  // A rollback that went through marks the run it undid.
  if (row.kind === 'rollback' && row.status === 'done' && row.target_run) {
    await env.DB.prepare(`update runs set rolled_back_by = ?, updated_at = ${NOW} where id = ?`)
      .bind(row.id, row.target_run)
      .run()
  }
  return json({ status: row.status })
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'v1') return json({ error: 'not found' }, 404)

  if (parts[1] === 'admin') return adminRoute(req, env, parts.slice(2))

  // /v1/apps/:app/runs[/:id/cancel|rollback]
  if (parts[1] === 'apps' && parts[2] && parts[3] === 'runs') return runRoute(req, env, parts[2], parts.slice(4))

  // /v1/apps/:app/notes[/:n]
  if (parts[1] === 'apps' && parts[2] && parts[3] === 'notes' && parts.length <= 5) {
    const n = parts[4] === undefined ? null : Number(parts[4])
    if (n !== null && (!Number.isInteger(n) || n <= 0)) return json({ error: 'invalid' }, 400)
    return appRoute(req, env, parts[2], n)
  }
  return json({ error: 'not found' }, 404)
}

export default { fetch: handle }
