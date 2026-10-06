/**
 * The feedback panel: numbered comments about an app, which Claude works on and
 * resolves, recording exactly what was done.
 *
 * Port of the Notes page of DailyFlow and of markdown-viewer's Feedback screen, kept
 * the same on purpose: same structure, states, rules, shortcuts and texts. What is
 * new is only what one shared panel needs: the app is a parameter, the API is the
 * kit's Worker, and the host passes its own state in through `appContext`.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  Archive,
  ArrowLeft,
  CheckCheck,
  ChevronRight,
  GitCommitHorizontal,
  MonitorSmartphone,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Undo2,
  X,
} from 'lucide-preact'
import { collectContext, deviceId, summarizeContext, type ClientContext } from './context'
import { Runs } from './Runs'
import { MESSAGES, type Filter, type Kind, type Lang, type Messages, type Status } from './i18n'

interface LogEntry {
  ts: string
  actor: 'user' | 'claude'
  action: string
  message: string | null
  detail: Record<string, unknown>
}
interface Resolution {
  summary?: string
  done?: string[]
  ignored?: string[]
  decisions?: string[]
  follow_ups?: string[]
  commits?: string[]
  deployed?: string
}
interface Note {
  id: number
  body: string
  kind: Kind
  status: Status
  stage: string | null
  appVersion: string | null
  screen: string | null
  resolution: Resolution
  context: Partial<ClientContext> & { server?: Record<string, unknown> }
  createdAt: string
  updatedAt: string
  log: LogEntry[]
}
interface Pending {
  clientId: string
  body: string
  kind: Kind
  screen: string
  createdAt: string
  context: ClientContext
}
interface AppInfo {
  id: string
  name: string
  repo: string | null
}

export interface PanelConfig {
  app: string
  api: string
  screen: string
  lang: Lang
  closable: boolean
  kitVersion: string
  /** The host's own state, read when a note is written. */
  appContext: () => Record<string, unknown>
  /** A code the host already has, so the person is never asked for one. */
  accessCode: string | null
  onClose: () => void
  /** Opens a link; the host may take it over (a desktop shell opens the system browser). */
  onLink: (url: string) => void
}

const KINDS: Kind[] = ['bug', 'idea', 'ux', 'question']
const FILTERS: Filter[] = ['all', 'open', 'in_progress', 'done', 'ignored']
const KIND_COLOR: Record<Kind, string> = { bug: 'red', idea: 'yellow', ux: 'purple', question: 'cyan' }
const STATUS_COLOR: Record<Status, string> = {
  open: 'gray',
  discussing: 'purple',
  in_progress: 'blue',
  done: 'green',
  ignored: 'gray',
  archived: 'teal',
}

const inFilter = (s: Status, f: Filter) =>
  s !== 'archived' && (f === 'all' || (f === 'open' ? s === 'open' || s === 'discussing' : s === f))

/* ----------------------------------------------------------- storage and API */

const codeKey = (app: string) => `feedback-kit.${app}.code`
const pendingKey = (app: string) => `feedback-kit.${app}.pending`

function readCode(cfg: PanelConfig): string {
  if (cfg.accessCode) return cfg.accessCode
  try {
    return localStorage.getItem(codeKey(cfg.app)) ?? ''
  } catch {
    return ''
  }
}

function readPending(app: string): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(app)) || '[]') as Pending[]
  } catch {
    return []
  }
}
function writePending(app: string, list: Pending[]) {
  try {
    localStorage.setItem(pendingKey(app), JSON.stringify(list))
  } catch {
    // storage blocked
  }
}

async function api<T>(
  cfg: PanelConfig,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${cfg.api}/v1/apps/${cfg.app}/notes${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${readCode(cfg)}`,
      'x-device-id': deviceId(),
      ...init?.headers,
    },
  })
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T }
}

/** Sends notes written offline; returns the ones still waiting. */
async function flushPending(cfg: PanelConfig): Promise<Pending[]> {
  const left: Pending[] = []
  for (const p of readPending(cfg.app)) {
    try {
      // Written offline if the note waited more than a few seconds before being sent.
      const context = {
        ...p.context,
        writtenAt: p.createdAt,
        sentAt: new Date().toISOString(),
        queuedOffline: Date.now() - Date.parse(p.createdAt) > 10_000,
      }
      const r = await api(cfg, '', {
        method: 'POST',
        body: JSON.stringify({ body: p.body, kind: p.kind, screen: p.screen, clientId: p.clientId, context }),
      })
      if (!r.ok) left.push(p)
    } catch {
      left.push(p)
    }
  }
  writePending(cfg.app, left)
  return left
}

const context = (cfg: PanelConfig) => {
  let own: Record<string, unknown> = {}
  try {
    own = cfg.appContext() ?? {}
  } catch {
    // the host's callback failed; the note still goes
  }
  return collectContext(cfg.screen, own, cfg.kitVersion)
}

/* ------------------------------------------------------------------- panel */

export function Panel({ cfg }: { cfg: PanelConfig }) {
  const m = MESSAGES[cfg.lang]
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [app, setApp] = useState<AppInfo | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState(false)
  const [denied, setDenied] = useState(() => !readCode(cfg))
  const [filter, setFilter] = useState<Filter>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [nonce, setNonce] = useState(0)
  const reload = () => setNonce((n) => n + 1)

  useEffect(() => {
    if (denied) return
    let cancelled = false
    void (async () => {
      const left = await flushPending(cfg)
      try {
        const r = await api<{ app: AppInfo; notes: Note[] }>(cfg, '')
        if (r.status === 401) {
          if (!cancelled) setDenied(true)
          return
        }
        if (!r.ok) throw new Error(String(r.status))
        if (!cancelled) {
          setNotes(r.data.notes)
          setApp(r.data.app)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
      if (!cancelled) setPending(left)
    })()
    return () => {
      cancelled = true
    }
  }, [nonce, denied, cfg.app, cfg.api])

  useEffect(() => {
    const onOnline = () => setNonce((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, open: 0, in_progress: 0, done: 0, ignored: 0 }
    for (const n of notes ?? [])
      FILTERS.forEach((f) => {
        if (inFilter(n.status, f)) c[f]++
      })
    return c
  }, [notes])

  const archivedCount = (notes ?? []).filter((n) => n.status === 'archived').length
  const shown = (notes ?? []).filter((n) => (showArchived ? n.status === 'archived' : inFilter(n.status, filter)))

  async function add(body: string, kind: Kind) {
    const p: Pending = {
      clientId: crypto.randomUUID(),
      body,
      kind,
      screen: cfg.screen,
      createdAt: new Date().toISOString(),
      context: await context(cfg),
    }
    writePending(cfg.app, [...readPending(cfg.app), p])
    setPending(readPending(cfg.app))
    reload()
  }

  return (
    <div class="page" part="page">
      <header class="page-head">
        <div>
          <h1>{m.title}</h1>
          <div class="sub">{m.subtitle}</div>
        </div>
        {cfg.closable && (
          <button
            type="button"
            class="btn sm ghost"
            part="button"
            onClick={cfg.onClose}
            aria-label={m.close}
            title={`${m.close} (Esc)`}
          >
            <X size={14} />
          </button>
        )}
      </header>

      {denied ? (
        <AccessCode
          m={m}
          app={cfg.app}
          wrong={!!readCode(cfg)}
          onSaved={() => {
            setDenied(false)
            reload()
          }}
        />
      ) : (
        <>
          {!showArchived && <Composer m={m} onAdd={add} />}
          {!showArchived && (
            <Runs
              m={m}
              api={cfg.api}
              app={cfg.app}
              accessCode={readCode(cfg)}
              repo={app?.repo ?? null}
              locale={m.locale}
              onLink={cfg.onLink}
              onNotesChanged={reload}
            />
          )}

          <div class="row wrap toolbar">
            {showArchived ? (
              <>
                <button type="button" class="btn sm ghost" part="button" onClick={() => setShowArchived(false)}>
                  <ArrowLeft size={14} />
                  {m.backToActive}
                </button>
                <span class="label">{m.archivedTitle}</span>
              </>
            ) : (
              <>
                <div class="seg" role="group" aria-label={m.filterLabel} part="filters">
                  {FILTERS.map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {m.filters[f]} <span class="muted tabular">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <span class="spacer" />
                <button type="button" class="btn sm ghost" part="button" onClick={() => setShowArchived(true)}>
                  <Archive size={14} />
                  {m.archived(archivedCount)}
                </button>
              </>
            )}
          </div>

          {error && <p class="hint">{navigator.onLine ? m.loadError : m.offline}</p>}

          <div class="notes">
            {!showArchived &&
              pending.map((p) => (
                <article key={p.clientId} class="card note pending" part="card note">
                  <div class="note-head">
                    <span class="note-id mono">#…</span>
                    <span class="pill" part="pill" data-color={KIND_COLOR[p.kind]}>
                      {m.kinds[p.kind]}
                    </span>
                    <span class="pill" part="pill" data-color="yellow">
                      {m.pending}
                    </span>
                  </div>
                  <p class="note-body">{p.body}</p>
                </article>
              ))}
            {notes && !shown.length && (showArchived || !pending.length) && <p class="hint">{m.empty}</p>}
            {shown.map((n) => (
              <NoteCard key={n.id} m={m} cfg={cfg} repo={app?.repo ?? null} note={n} onChanged={reload} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AccessCode({
  m,
  app,
  wrong,
  onSaved,
}: {
  m: Messages
  app: string
  wrong: boolean
  onSaved: () => void
}) {
  const [code, setCode] = useState('')
  const save = () => {
    const c = code.trim()
    if (!c) return
    try {
      localStorage.setItem(codeKey(app), c)
    } catch {
      // storage blocked
    }
    onSaved()
  }
  return (
    <div class="card composer" part="card composer">
      <span class="label">{m.codeTitle}</span>
      <p class="hint flush">{m.codeHint(app)}</p>
      {wrong && <p class="error flush">{m.codeWrong}</p>}
      <div class="row">
        <input
          class="input mono"
          part="input"
          type="password"
          ref={useFocus<HTMLInputElement>()}
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          aria-label={m.codeTitle}
        />
        <button type="button" class="btn sm primary" part="button button-primary" disabled={!code.trim()} onClick={save}>
          {m.codeSave}
        </button>
      </div>
    </div>
  )
}

function KindPicker({ m, value, onChange }: { m: Messages; value: Kind; onChange: (k: Kind) => void }) {
  return (
    <div class="row wrap" role="group" aria-label={m.kindLabel}>
      {KINDS.map((k) => (
        <button
          key={k}
          type="button"
          class="chip"
          part="chip"
          data-color={KIND_COLOR[k]}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
        >
          <span class="dot" />
          {m.kinds[k]}
        </button>
      ))}
    </div>
  )
}

/**
 * Focus on mount. Preact passes `autoFocus` through as the HTML attribute, which the
 * browser only honours on page load, so a box that appears later has to ask for it.
 */
function useFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}

/** ⌘↵ / Ctrl+↵ sends, Escape cancels when there is something to cancel. */
function keys(onSend: () => void, onCancel?: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSend()
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }
}

function Composer({ m, onAdd }: { m: Messages; onAdd: (body: string, kind: Kind) => void }) {
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<Kind>('idea')
  const submit = () => {
    const b = body.trim()
    if (!b) return
    onAdd(b, kind)
    setBody('')
  }
  return (
    <div class="card composer" part="card composer">
      <textarea
        class="input"
        part="input"
        rows={3}
        ref={useFocus<HTMLTextAreaElement>()}
        placeholder={m.placeholder}
        value={body}
        onInput={(e) => setBody(e.currentTarget.value)}
        onKeyDown={keys(submit)}
        aria-label={m.placeholder}
      />
      <div class="row wrap">
        <KindPicker m={m} value={kind} onChange={setKind} />
        <span class="spacer" />
        <span class="hint shortcut">{m.shortcut()}</span>
        <button type="button" class="btn sm primary" part="button button-primary" disabled={!body.trim()} onClick={submit}>
          {m.add}
        </button>
      </div>
    </div>
  )
}

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <div class="res-block">
      <span class="label">{title}</span>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  )
}

function NoteCard({
  m,
  cfg,
  repo,
  note,
  onChanged,
}: {
  m: Messages
  cfg: PanelConfig
  repo: string | null
  note: Note
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [kind, setKind] = useState<Kind>(note.kind)
  const [armed, setArmed] = useState(false)
  const [msg, setMsg] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const rejectRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => editRef.current?.focus(), [editing])
  useEffect(() => rejectRef.current?.focus(), [rejecting])
  const r = note.resolution ?? {}
  const delivered = note.status === 'done' || note.status === 'ignored'
  // The whole conversation stays under the note (DailyFlow's note #35): each 👎 in the
  // person's own words, with a divider saying when, and a divider for every delivery.
  const thread = note.log.filter(
    (l) =>
      l.action === 'rejected' ||
      (l.action === 'status' && (l.detail?.status === 'done' || l.detail?.status === 'ignored')) ||
      // Claude sending a note back to open: a remote run undone or canceled.
      (l.actor === 'claude' && l.action === 'status' && l.detail?.status === 'open'),
  )
  const open = note.status === 'open'
  const hasResolution = !!(
    r.summary ||
    r.done?.length ||
    r.ignored?.length ||
    r.decisions?.length ||
    r.follow_ups?.length ||
    r.commits?.length ||
    r.deployed
  )
  const device = summarizeContext(note.context, cfg.lang)
  const when = (iso: string) =>
    new Date(iso).toLocaleString(m.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  async function save() {
    const res = await api(cfg, `/${note.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body: body.trim(), kind, context: await context(cfg) }),
    })
    if (res.status === 409) {
      setMsg(m.locked)
      return
    }
    setEditing(false)
    onChanged()
  }
  async function del() {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    const res = await api(cfg, `/${note.id}`, { method: 'DELETE' })
    if (res.status === 409) {
      setMsg(m.locked)
      return
    }
    onChanged()
  }
  async function confirm() {
    await api(cfg, `/${note.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'confirm', context: await context(cfg) }),
    })
    onChanged()
  }
  async function reject() {
    const c = comment.trim()
    if (!c) return
    await api(cfg, `/${note.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reject', comment: c, context: await context(cfg) }),
    })
    setRejecting(false)
    setComment('')
    onChanged()
  }

  return (
    <article class={`card note s-${note.status}`} part="card note" id={`note-${note.id}`}>
      <div class="note-head">
        <span class="note-id mono">#{note.id}</span>
        <span class="pill" part="pill" data-color={KIND_COLOR[note.kind]}>
          {m.kinds[note.kind]}
        </span>
        <span class="pill" part="pill" data-color={STATUS_COLOR[note.status]} data-status={note.status}>
          {m.status[note.status]}
        </span>
        <span class="hint tabular">{when(note.createdAt)}</span>
        <span class="spacer" />
        {open && !editing && (
          <>
            <button
              type="button"
              class="btn sm ghost"
              part="button"
              onClick={() => {
                setBody(note.body)
                setKind(note.kind)
                setEditing(true)
                setMsg('')
              }}
            >
              <Pencil size={13} />
              {m.edit}
            </button>
            <button type="button" class={`btn sm ghost${armed ? ' danger' : ''}`} part="button" onClick={() => void del()}>
              <Trash2 size={13} />
              {armed ? m.confirmDelete : m.delete}
            </button>
          </>
        )}
      </div>

      {device && (
        <div class="note-device hint">
          <MonitorSmartphone size={13} />
          {device}
        </div>
      )}

      {editing ? (
        <div class="note-edit">
          <textarea
            class="input"
            part="input"
            rows={3}
            value={body}
            onInput={(e) => setBody(e.currentTarget.value)}
            ref={editRef}
            onKeyDown={keys(() => void save(), () => setEditing(false))}
          />
          <div class="row wrap">
            <KindPicker m={m} value={kind} onChange={setKind} />
            <span class="spacer" />
            <button type="button" class="btn sm ghost" part="button" onClick={() => setEditing(false)}>
              {m.cancel}
            </button>
            <button
              type="button"
              class="btn sm primary"
              part="button button-primary"
              disabled={!body.trim()}
              onClick={() => void save()}
            >
              {m.save}
            </button>
          </div>
        </div>
      ) : (
        <p class="note-body">{note.body}</p>
      )}
      {msg && <p class="error flush">{msg}</p>}

      {thread.length > 0 && (
        <div class="thread">
          {thread.map((l, i) =>
            l.action === 'rejected' ? (
              <div key={i} class="thread-item">
                <div class="thread-divider user">
                  <ThumbsDown size={12} />
                  {m.thread.rejected} · {when(l.ts)}
                </div>
                <p class="note-body">{l.message}</p>
              </div>
            ) : l.detail?.status === 'open' ? (
              <div key={i} class="thread-item">
                <div class="thread-divider user">
                  <Undo2 size={12} />
                  {m.thread.undone} · {when(l.ts)}
                </div>
                {l.message && <p class="note-body hint">{l.message}</p>}
              </div>
            ) : (
              <div key={i} class="thread-divider claude">
                <CheckCheck size={12} />
                {m.thread[l.detail?.status === 'ignored' ? 'ignored' : 'delivered']} · {when(l.ts)}
              </div>
            ),
          )}
        </div>
      )}

      {hasResolution && (
        <div class="resolution" part="resolution">
          {r.summary && (
            <div class="res-block">
              <span class="label">{m.resolution.summary}</span>
              <p>{r.summary}</p>
            </div>
          )}
          <List title={m.resolution.done} items={r.done} />
          <List title={m.resolution.ignored} items={r.ignored} />
          <List title={m.resolution.decisions} items={r.decisions} />
          <List title={m.resolution.follow_ups} items={r.follow_ups} />
          {(r.commits?.length || r.deployed) && (
            <div class="row wrap res-meta">
              {r.commits?.map((c) =>
                repo ? (
                  <a
                    key={c}
                    class="chip mono"
                    part="chip"
                    href={`${repo.replace(/\/+$/, '')}/commit/${c}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault()
                      cfg.onLink(e.currentTarget.href)
                    }}
                  >
                    <GitCommitHorizontal size={13} />
                    {c.slice(0, 7)}
                  </a>
                ) : (
                  <span key={c} class="chip mono" part="chip">
                    <GitCommitHorizontal size={13} />
                    {c.slice(0, 7)}
                  </span>
                ),
              )}
              {r.deployed && (
                <span class="hint">
                  {m.resolution.deployed}: {r.deployed}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {delivered && (
        <div class="verify">
          {!rejecting ? (
            <>
              <span class="label">{m.verify}</span>
              <span class="spacer" />
              <button
                type="button"
                class="btn sm thumb up"
                part="button"
                title={m.worksHint}
                aria-label={`${m.works}: ${m.worksHint}`}
                onClick={() => void confirm()}
              >
                <ThumbsUp size={15} />
                {m.works}
              </button>
              <button
                type="button"
                class="btn sm thumb down"
                part="button"
                title={m.notYetHint}
                aria-label={`${m.notYet}: ${m.notYetHint}`}
                onClick={() => setRejecting(true)}
              >
                <ThumbsDown size={15} />
                {m.notYet}
              </button>
            </>
          ) : (
            <div class="reject">
              <textarea
                class="input"
                part="input"
                rows={3}
                ref={rejectRef}
                placeholder={m.rejectPlaceholder}
                value={comment}
                onInput={(e) => setComment(e.currentTarget.value)}
                onKeyDown={keys(() => void reject(), () => setRejecting(false))}
              />
              <div class="row">
                <span class="spacer" />
                <button
                  type="button"
                  class="btn sm ghost"
                  part="button"
                  onClick={() => {
                    setRejecting(false)
                    setComment('')
                  }}
                >
                  {m.cancel}
                </button>
                <button
                  type="button"
                  class="btn sm primary"
                  part="button button-primary"
                  disabled={!comment.trim()}
                  onClick={() => void reject()}
                >
                  <ThumbsDown size={14} />
                  {m.rejectSend}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <details class="note-log">
        <summary>
          <ChevronRight size={13} />
          {m.history(note.log.length)}
          <span class="hint">
            {[note.stage, note.appVersion].filter(Boolean).join(' · ')}
            {note.screen ? ` · ${m.from} ${note.screen}` : ''}
          </span>
        </summary>
        <ol>
          {note.log.map((l, i) => (
            <li key={i}>
              <span class="mono tabular muted">{when(l.ts)}</span>
              <span class={`actor a-${l.actor}`}>{m.actors[l.actor]}</span>
              <span>
                {m.actions[l.action] ?? l.action}
                {l.detail?.status ? ` → ${m.status[l.detail.status as Status] ?? String(l.detail.status)}` : ''}
                {l.message ? `: ${l.message}` : ''}
              </span>
              {l.action === 'edited' && typeof l.detail?.from === 'string' && (
                <span class="log-prev">“{String(l.detail.from)}”</span>
              )}
            </li>
          ))}
        </ol>
        {note.context && Object.keys(note.context).length > 0 && (
          <details class="debug">
            <summary>{m.debug}</summary>
            <pre class="mono">{JSON.stringify(note.context, null, 2)}</pre>
          </details>
        )}
      </details>
    </article>
  )
}
