/**
 * Remote runs: from the panel, on any device, Matheus sends the open notes to the agent
 * on his computer (agent/), follows what Claude says as it works, and can cancel a run
 * or undo one (a `git revert` of its commits, without Claude).
 *
 * It takes the owner's run code on top of the app's code: the app's code is pasted on
 * every device that writes notes, but only the owner runs code on the computer. The run
 * code is one for every app, so it is kept once per origin.
 */

import { useEffect, useRef, useState } from 'preact/hooks'
import { Ban, ChevronRight, Cpu, GitCommitHorizontal, Play, Undo2 } from 'lucide-preact'
import type { Messages } from './i18n'

export interface Usage {
  status?: string | null
  fiveHour?: { utilization?: number; resetsAt?: number } | null
  sevenDay?: { utilization?: number; resetsAt?: number } | null
  costFiveHours?: number
  costToday?: number
  paused?: boolean
  limitedBy?: string | null
}
interface Agent {
  name: string
  online: boolean
  servesApp: boolean
  lastSeen: string
  usage: Usage
}
interface Run {
  id: number
  kind: 'work' | 'rollback'
  notes: number[]
  instructions: string | null
  targetRun: number | null
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled'
  baseSha: string | null
  headSha: string | null
  commits: string[]
  messages: string[]
  summary: string | null
  error: string | null
  stats: { costUsd?: number | null; turns?: number | null; inputTokens?: number | null; outputTokens?: number | null }
  rolledBackBy: number | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
interface State {
  runs: Run[]
  agent: Agent | null
  open: number[]
}

const RUN_CODE_KEY = 'feedback-kit.run-code'
const STATUS_COLOR: Record<Run['status'], string> = {
  queued: 'yellow',
  running: 'blue',
  done: 'green',
  failed: 'red',
  canceled: 'gray',
}
const active = (r: Run) => r.status === 'queued' || r.status === 'running'

function readRunCode(): string {
  try {
    return localStorage.getItem(RUN_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}
function writeRunCode(code: string | null) {
  try {
    if (code) localStorage.setItem(RUN_CODE_KEY, code)
    else localStorage.removeItem(RUN_CODE_KEY)
  } catch {
    // storage blocked: asked again next time
  }
}

export function Runs({
  m,
  api,
  app,
  accessCode,
  repo,
  locale,
  onLink,
  onNotesChanged,
}: {
  m: Messages
  api: string
  app: string
  accessCode: string
  repo: string | null
  locale: string
  onLink: (url: string) => void
  onNotesChanged: () => void
}) {
  const r = m.runs
  const [runCode, setRunCode] = useState(readRunCode)
  const [state, setState] = useState<State | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [asking, setAsking] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState(0)
  const activeIds = useRef<string>('')

  async function call<T>(path: string, init?: RequestInit) {
    const res = await fetch(`${api}/v1/apps/${app}/runs${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessCode}`, 'x-run-code': runCode },
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (res.status === 403) {
      if (data.error === 'runs disabled') setDisabled(true)
      else {
        writeRunCode(null)
        setRunCode('')
        setWrong(true)
        setAsking(true)
      }
    }
    return { ok: res.ok, status: res.status, data }
  }

  // Polls fast while a run is queued or going, slowly otherwise, and not at all while the
  // page is hidden. When a run ends, the notes are reloaded: Claude changed them.
  useEffect(() => {
    if (!runCode || disabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const res = await call<State>('')
          if (!cancelled && res.ok) {
            setState(res.data)
            const now = res.data.runs.filter(active).map((x) => x.id).join(',')
            if (activeIds.current && now !== activeIds.current) onNotesChanged()
            activeIds.current = now
          }
        } catch {
          // offline: the next tick tries again
        }
      }
      if (cancelled) return
      const fast = activeIds.current !== ''
      timer = setTimeout(() => void tick(), fast ? 4000 : 30_000)
    }
    void tick()
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNonce((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [runCode, disabled, nonce, app, api])

  if (disabled) return null

  if (!runCode) {
    return asking ? (
      <RunCodeForm
        m={m}
        wrong={wrong}
        onCancel={() => setAsking(false)}
        onSave={(code) => {
          writeRunCode(code)
          setRunCode(code)
          setWrong(false)
          setAsking(false)
        }}
      />
    ) : (
      <div class="row runs-enable">
        <button type="button" class="btn sm ghost" part="button" onClick={() => setAsking(true)}>
          <Cpu size={14} />
          {r.enable}
        </button>
      </div>
    )
  }

  async function act(path: string, payload?: unknown) {
    setBusy(true)
    setError('')
    try {
      const res = await call<{ error?: string }>(path, { method: 'POST', body: JSON.stringify(payload ?? {}) })
      if (!res.ok && res.status !== 403) setError(r.errors[res.data.error ?? ''] ?? r.errors.generic ?? '')
    } catch {
      setError(r.errors.generic ?? '')
    }
    setBusy(false)
    setNonce((n) => n + 1)
  }

  const runs = state?.runs ?? []
  const anyActive = runs.some(active)
  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <section class="card runs" part="card runs">
      <AgentLine
        m={m}
        agent={state?.agent ?? null}
        working={runs.find((x) => x.status === 'running')?.id ?? null}
        locale={locale}
        loaded={!!state}
      />
      <Launcher
        m={m}
        open={state?.open ?? []}
        disabled={busy || anyActive || !state}
        onRun={(instructions) => void act('', { instructions })}
      />
      {error && <p class="error flush">{error}</p>}
      {runs.length > 0 && (
        <div class="run-list">
          {runs.slice(0, 6).map((run, i) => (
            <RunItem
              key={run.id}
              m={m}
              run={run}
              repo={repo}
              when={when}
              initiallyOpen={i === 0 && (active(run) || Date.now() - Date.parse(run.finishedAt ?? '') < 3600_000)}
              canUndo={!anyActive && !busy}
              onLink={onLink}
              onCancel={() => void act(`/${run.id}/cancel`)}
              onUndo={() => void act(`/${run.id}/rollback`)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RunCodeForm({
  m,
  wrong,
  onSave,
  onCancel,
}: {
  m: Messages
  wrong: boolean
  onSave: (code: string) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const save = () => code.trim() && onSave(code.trim())
  return (
    <div class="card composer" part="card composer">
      <span class="label">{m.runs.codeTitle}</span>
      <p class="hint flush">{m.runs.codeHint}</p>
      {wrong && <p class="error flush">{m.codeWrong}</p>}
      <div class="row">
        <input
          class="input mono"
          part="input"
          type="password"
          value={code}
          onInput={(e) => setCode(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onCancel()
          }}
          aria-label={m.runs.codeTitle}
        />
        <button type="button" class="btn sm ghost" part="button" onClick={onCancel}>
          {m.cancel}
        </button>
        <button type="button" class="btn sm primary" part="button button-primary" disabled={!code.trim()} onClick={save}>
          {m.codeSave}
        </button>
      </div>
    </div>
  )
}

const pct = (x?: number) => `${Math.round((x ?? 0) * 100)}%`

function AgentLine({
  m,
  agent,
  working,
  locale,
  loaded,
}: {
  m: Messages
  agent: Agent | null
  /** The run the computer is on now: while it works, it does not poll, so "ready" would be stale. */
  working: number | null
  locale: string
  loaded: boolean
}) {
  const r = m.runs
  if (!loaded) return <div class="hint">{r.loading}</div>
  if (!agent) return <div class="agent-line hint">{r.noAgent}</div>
  const u = agent.usage ?? {}
  const state = !agent.online
    ? 'offline'
    : !agent.servesApp
      ? 'noFolder'
      : working != null
        ? 'working'
        : u.paused
        ? 'paused'
        : u.limitedBy
          ? 'limited'
          : 'online'
  const color = { online: 'green', working: 'blue', offline: 'gray', noFolder: 'yellow', paused: 'yellow', limited: 'red' }[state]
  const time = (epoch?: number) =>
    epoch ? new Date(epoch * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''
  const day = (epoch?: number) =>
    epoch ? new Date(epoch * 1000).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div class="agent-line">
      <span class="row">
        <span class="dot" data-color={color} />
        <span class="agent-name">{agent.name}</span>
        <span class="hint">
          {state === 'working' && working != null ? r.working(working) : r.agentState[state]}
          {state === 'offline' ? ` · ${r.lastSeen(new Date(agent.lastSeen).toLocaleString(locale))}` : ''}
          {state === 'limited' && u.limitedBy ? ` · ${u.limitedBy}` : ''}
        </span>
      </span>
      {(u.fiveHour || u.sevenDay) && (
        <span class="usage">
          {u.fiveHour && (
            <Meter label={r.fiveHour} value={u.fiveHour.utilization} hint={r.resets(time(u.fiveHour.resetsAt))} />
          )}
          {u.sevenDay && <Meter label={r.week} value={u.sevenDay.utilization} hint={r.resets(day(u.sevenDay.resetsAt))} />}
          {!!u.costToday && <span class="hint tabular">{r.costToday(u.costToday)}</span>}
        </span>
      )}
    </div>
  )
}

function Meter({ label, value, hint }: { label: string; value?: number; hint: string }) {
  const v = Math.min(1, Math.max(0, value ?? 0))
  const color = v >= 0.9 ? 'red' : v >= 0.7 ? 'yellow' : 'green'
  return (
    <span class="meter" title={hint}>
      <span class="hint">{label}</span>
      <span class="meter-bar" data-color={color}>
        <span style={{ width: `${v * 100}%` }} />
      </span>
      <span class="hint tabular">{pct(v)}</span>
      <span class="hint meter-reset">{hint}</span>
    </span>
  )
}

function Launcher({
  m,
  open,
  disabled,
  onRun,
}: {
  m: Messages
  open: number[]
  disabled: boolean
  onRun: (instructions: string) => void
}) {
  const r = m.runs
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  return (
    <div class="launcher">
      {adding && (
        <textarea
          class="input"
          part="input"
          rows={2}
          placeholder={r.instructionsPlaceholder}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
      )}
      <div class="row wrap">
        <span class="hint">{open.length ? r.openNotes(open) : r.nothingOpen}</span>
        <span class="spacer" />
        {!adding && (
          <button type="button" class="btn sm ghost" part="button" onClick={() => setAdding(true)}>
            {r.addInstructions}
          </button>
        )}
        <button
          type="button"
          class="btn sm primary"
          part="button button-primary"
          disabled={disabled || !open.length}
          onClick={() => {
            onRun(text.trim())
            setText('')
            setAdding(false)
          }}
        >
          <Play size={13} />
          {r.run(open.length)}
        </button>
      </div>
    </div>
  )
}

function RunItem({
  m,
  run,
  repo,
  when,
  initiallyOpen,
  canUndo,
  onLink,
  onCancel,
  onUndo,
}: {
  m: Messages
  run: Run
  repo: string | null
  when: (iso: string) => string
  initiallyOpen: boolean
  canUndo: boolean
  onLink: (url: string) => void
  onCancel: () => void
  onUndo: () => void
}) {
  const r = m.runs
  const [armed, setArmed] = useState(false)
  const logRef = useRef<HTMLOListElement>(null)
  const changed = !!run.baseSha && !!run.headSha && run.baseSha !== run.headSha
  const undoable = run.kind === 'work' && changed && !run.rolledBackBy && !active(run)
  const s = run.stats ?? {}
  const tokens = (s.inputTokens ?? 0) + (s.outputTokens ?? 0)
  const minutes =
    run.startedAt && run.finishedAt
      ? Math.max(1, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60_000))
      : null
  const meta = [
    minutes ? `${minutes} min` : null,
    s.costUsd != null ? r.cost(s.costUsd) : null,
    s.turns ? r.turns(s.turns) : null,
    tokens ? r.tokens(tokens) : null,
  ].filter(Boolean)

  // Keeps the newest message in view while a run is going.
  useEffect(() => {
    if (active(run) && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [run.messages.length])

  return (
    <details class={`run s-${run.status}`} open={initiallyOpen}>
      <summary>
        <ChevronRight size={13} />
        <span class="mono note-id">#{run.id}</span>
        <span class="pill" part="pill" data-color={STATUS_COLOR[run.status]}>
          {r.status[run.status]}
        </span>
        <span class="run-title">
          {run.kind === 'rollback' ? r.rollbackOf(run.targetRun ?? 0) : run.notes.map((n) => `#${n}`).join(' ')}
        </span>
        {run.rolledBackBy && (
          <span class="pill" part="pill" data-color="gray">
            {r.undone(run.rolledBackBy)}
          </span>
        )}
        <span class="hint tabular run-when">{when(run.createdAt)}</span>
      </summary>

      <div class="run-body">
        {run.instructions && <p class="hint flush">“{run.instructions}”</p>}
        {run.messages.length > 0 && (
          <ol class="run-log" ref={logRef}>
            {run.messages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
            {run.status === 'running' && <li class="typing">…</li>}
          </ol>
        )}
        {run.summary && run.status !== 'running' && (
          <div class="res-block">
            <span class="label">{r.report}</span>
            <p class="note-body">{run.summary}</p>
          </div>
        )}
        {run.error && <p class="error flush run-error">{run.error}</p>}
        {(run.commits.length > 0 || meta.length > 0) && (
          <div class="row wrap res-meta">
            {run.commits.map((c) =>
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
                    onLink(e.currentTarget.href)
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
            <span class="spacer" />
            {meta.length > 0 && <span class="hint tabular">{meta.join(' · ')}</span>}
          </div>
        )}
        {(active(run) || undoable) && (
          <div class="row">
            <span class="spacer" />
            {active(run) && (
              <button type="button" class="btn sm ghost danger" part="button" onClick={onCancel}>
                <Ban size={13} />
                {r.cancel}
              </button>
            )}
            {undoable && (
              <button
                type="button"
                class={`btn sm ghost${armed ? ' danger' : ''}`}
                part="button"
                disabled={!canUndo}
                title={r.undoHint}
                onClick={() => {
                  if (!armed) {
                    setArmed(true)
                    setTimeout(() => setArmed(false), 4000)
                    return
                  }
                  setArmed(false)
                  onUndo()
                }}
              >
                <Undo2 size={13} />
                {armed ? r.undoConfirm : r.undo}
              </button>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
