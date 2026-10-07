/**
 * O painel do agente no PC. Sem build e sem dependências: lê /api/state (o agente agora)
 * e /api/runs (as execuções de todos os apps, vindas do Worker) e desenha tudo em SVG.
 */

/* ------------------------------------------------------------------ icons */
const P = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  play: '<path d="M6 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5Z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-.8-1.5-1.2-2.8-1.2-1.7 0-2.8.8-2.8 2 0 2.7 5.8 1.4 5.8 4 0 1.2-1.2 2-3 2-1.4 0-2.5-.5-3-1.4M12 6v2M12 16v2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5M8 13h8M8 17h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  spark: '<path d="M12 3c.4 4.6 1.9 6.9 6 8-4.1 1.1-5.6 3.4-6 9-.4-5.6-1.9-7.9-6-9 4.1-1.1 5.6-3.4 6-8Z"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  open: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
}
const icon = (name, size = 16, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`

/* --------------------------------------------------------------- helpers */
const $ = (s, el = document) => el.querySelector(s)
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const DAY = 86_400_000
const KIND = { bug: 'Bug', idea: 'Ideia', ux: 'UX', question: 'Pergunta' }
const STATUS = {
  queued: ['Na fila', 'yellow'],
  running: ['Rodando', 'purple live'],
  done: ['Concluída', 'green'],
  failed: ['Falhou', 'orange'],
  canceled: ['Cancelada', 'gray'],
}
const TILE = ['#3b6cf0', '#14a89a', '#e8603c', '#2fa866', '#d99a00', '#c0459b', '#7c5ce0']

function money(v, big = false) {
  const n = Number(v ?? 0)
  const [int, frac] = nf(2).format(n).split(',')
  return big ? `US$ ${int}<span class="lite">,${frac}</span>` : `US$ ${int},${frac}`
}
function tokens(n) {
  n = Number(n ?? 0)
  if (n >= 1e6) return `${nf(1).format(n / 1e6)} M`
  if (n >= 1e3) return `${nf(n >= 1e5 ? 0 : 1).format(n / 1e3)} mil`
  return nf().format(n)
}
function dur(ms) {
  if (ms == null || !isFinite(ms)) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
function ago(iso) {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 45) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  if (s < 86400 * 30) return `há ${Math.round(s / 86400)} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}
const when = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`
}
const startOfDay = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function tile(app, size) {
  let h = 0
  for (const c of app) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const color = TILE[h % TILE.length]
  return `<span class="tile" style="background:${color}1f;color:${color};${size ? `width:${size}px;height:${size}px` : ''}">${esc(app[0]?.toUpperCase() ?? '?')}</span>`
}
const badge = (status) => {
  const [label, cls] = STATUS[status] ?? [status, 'gray']
  return `<span class="badge ${cls}">${label}</span>`
}
const modelName = (key) =>
  String(key || 'padrão')
    .split('/')
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' · ')
const runCost = (r) => Number(r.stats?.costUsd ?? 0)
const runTokens = (r) => {
  const s = r.stats ?? {}
  return (s.inputTokens ?? 0) + (s.outputTokens ?? 0) + (s.cacheReadTokens ?? 0) + (s.cacheWriteTokens ?? 0)
}
const runDur = (r) =>
  r.stats?.durationMs ?? (r.startedAt && r.finishedAt ? Date.parse(r.finishedAt) - Date.parse(r.startedAt) : null)
const active = (r) => r.status === 'queued' || r.status === 'running'
const undoable = (r) => r.kind === 'work' && r.baseSha && r.headSha && r.baseSha !== r.headSha && !r.rolledBackBy && !active(r)
function niceMax(v) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * p) return m * p
  return 10 * p
}

/* ----------------------------------------------------------------- theme */
const theme = () => document.documentElement.dataset.theme || 'light'
/** Applies a theme and keeps it: in this browser, and in the agent's file on the PC. */
function setTheme(next, save = true) {
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('fk.theme', next)
  } catch {
    // the agent's copy still holds it
  }
  $('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0f1523' : '#f6f6f7')
  window.desktop?.setTheme(next) // the Windows buttons over the top bar
  if (save) api('/api/prefs', { theme: next }).catch(() => {})
  drawCharts()
}

/* ----------------------------------------------------------------- state */
const params = new URLSearchParams(location.search)
const S = {
  agent: null,
  data: { runs: [], agents: [], apps: [], stale: true },
  view: params.get('view') || localStorage.getItem('fk.view') || 'painel',
  period: Number(localStorage.getItem('fk.period')) || 14,
  filter: 'all',
  app: '',
  search: '',
  drawer: Number(params.get('run')) || null,
  loaded: false,
}

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-feedback-kit': '1' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function toast(text, err) {
  const el = document.createElement('div')
  el.className = `toast${err ? ' err' : ''}`
  el.textContent = text
  $('#toasts').append(el)
  setTimeout(() => el.remove(), 3800)
}

/* --------------------------------------------------------------- derived */
function derive() {
  const now = Date.now()
  const P = S.period
  const today = startOfDay(now)
  const from = P ? today - (P - 1) * DAY : 0
  const prevFrom = P ? from - P * DAY : 0
  const all = S.data.runs
  const work = all.filter((r) => r.kind === 'work')
  const inP = work.filter((r) => Date.parse(r.createdAt) >= from)
  const inPrev = P ? work.filter((r) => Date.parse(r.createdAt) >= prevFrom && Date.parse(r.createdAt) < from) : []
  const done = inP.filter((r) => r.status === 'done')
  const ended = inP.filter((r) => ['done', 'failed', 'canceled'].includes(r.status))
  const sum = (list, f) => list.reduce((s, r) => s + f(r), 0)
  const durs = inP.map(runDur).filter((x) => x != null && x > 0)

  // the days on the charts: the period (or the last 14 when "Tudo")
  const nDays = P || 14
  const days = Array.from({ length: nDays }, (_, i) => {
    const start = today - (nDays - 1 - i) * DAY
    const runs = work.filter((r) => Date.parse(r.createdAt) >= start && Date.parse(r.createdAt) < start + DAY)
    const prevRuns = work.filter(
      (r) => Date.parse(r.createdAt) >= start - nDays * DAY && Date.parse(r.createdAt) < start - nDays * DAY + DAY,
    )
    return {
      start,
      runs: runs.length,
      notes: sum(runs.filter((r) => r.status === 'done'), (r) => r.notes.length),
      cost: sum(runs, runCost),
      prevCost: sum(prevRuns, runCost),
      failed: runs.filter((r) => r.status === 'failed').length,
    }
  })

  // cost by model
  const byModel = {}
  for (const r of inP) {
    const parts = r.stats?.byModel ?? (r.stats?.model ? { [String(r.stats.model)]: runCost(r) } : null)
    if (!parts) continue
    for (const [k, v] of Object.entries(parts)) byModel[k] = (byModel[k] ?? 0) + Number(v || 0)
  }
  const kinds = {}
  for (const r of inP) for (const [k, v] of Object.entries(r.stats?.kinds ?? {})) kinds[k] = (kinds[k] ?? 0) + v

  // projects: the folders here, and the apps the Worker knows
  const local = S.agent?.projects ?? {}
  const appsInfo = Object.fromEntries((S.data.apps ?? []).map((a) => [a.id, a]))
  const names = [...new Set([...Object.keys(local), ...work.map((r) => r.app)])].sort()
  const totalRuns = inP.length || 1
  const projects = names.map((app) => {
    const runs = inP.filter((r) => r.app === app)
    const fin = runs.filter((r) => ['done', 'failed', 'canceled'].includes(r.status))
    const last = work.find((r) => r.app === app)
    return {
      app,
      name: appsInfo[app]?.name ?? app,
      dir: local[app]?.dir ?? null,
      deploy: local[app]?.deploy ?? null,
      open: appsInfo[app]?.open ?? null,
      active: appsInfo[app]?.active ?? null,
      runs: runs.length,
      share: runs.length / totalRuns,
      success: fin.length ? fin.filter((r) => r.status === 'done').length / fin.length : null,
      cost: sum(runs, runCost),
      last,
    }
  })

  const pct = (a, b) => (b ? ((a - b) / b) * 100 : a ? 100 : 0)
  return {
    inP,
    days,
    byModel,
    kinds,
    projects,
    queued: all.filter((r) => r.status === 'queued'),
    stats: {
      runs: inP.length,
      runsTrend: P ? pct(inP.length, inPrev.length) : null,
      notes: sum(done, (r) => r.notes.length),
      success: ended.length ? done.length / ended.length : null,
      cost: sum(inP, runCost),
      costTrend: P ? pct(sum(inP, runCost), sum(inPrev, runCost)) : null,
      tokens: sum(inP, runTokens),
      out: sum(inP, (r) => r.stats?.outputTokens ?? 0),
      avgDur: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null,
      commits: sum(inP, (r) => r.commits.length),
    },
  }
}

function alerts(d) {
  const list = []
  const a = S.agent
  if (a && a.online === false) list.push({ tone: 'orange', icon: 'alert', title: 'Sem conexão com o Worker', text: a.status?.error ?? 'O agente tenta de novo sozinho.' })
  if (a?.paused) list.push({ tone: 'yellow', icon: 'pause', title: 'Agente pausado', text: 'Nada novo começa até retomar.', action: ['resume', 'Retomar'] })
  const five = a?.usage?.fiveHour
  if (five && five.utilization >= 0.7)
    list.push({ tone: five.utilization >= 0.9 ? 'orange' : 'yellow', icon: 'gauge', title: `Janela de 5 h em ${Math.round(five.utilization * 100)}%`, text: five.resetsAt ? `Volta às ${new Date(five.resetsAt * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Perto do limite do plano' })
  for (const r of S.data.runs.filter((r) => r.status === 'failed').slice(0, 3))
    list.push({ tone: 'orange', icon: 'alert', title: `#${r.id} falhou · ${r.app}`, text: (r.error ?? '').split('\n')[0] || 'Veja os detalhes', run: r.id })
  for (const r of S.data.runs.filter((r) => r.status === 'canceled' && r.messages.some((m) => m.includes('feedback-kit/parada-'))).slice(0, 2))
    list.push({ tone: 'yellow', icon: 'commit', title: `Commits guardados da #${r.id}`, text: `branch feedback-kit/parada-${r.id} em ${r.app}`, run: r.id })
  for (const p of d.projects.filter((p) => !p.dir && p.open))
    list.push({ tone: 'yellow', icon: 'folder', title: `${p.name}: sem pasta aqui`, text: `${p.open} nota(s) aberta(s) sem quem rode` })
  for (const p of d.projects.filter((p) => p.dir && p.open && !d.queued.some((q) => q.app === p.app)).slice(0, 2))
    list.push({ tone: 'purple', icon: 'play', title: `${p.name}: ${p.open} aberta(s)`, text: 'Prontas para rodar', action: ['run', 'Rodar', p.app] })
  const lastDone = S.data.runs.find((r) => r.status === 'done' && r.kind === 'work')
  if (lastDone) list.push({ tone: 'green', icon: 'check', title: `#${lastDone.id} concluída · ${lastDone.app}`, text: `${lastDone.notes.length} nota(s), ${ago(lastDone.finishedAt)}`, run: lastDone.id })
  return list
}

/* ----------------------------------------------------------------- charts */
const charts = new Map()

function barChart(id, days) {
  charts.set(id, (el) => {
    const W = el.clientWidth
    const H = 248
    const L = 34
    const T = 8
    const B = 44
    const ph = H - T - B
    const max = niceMax(Math.max(1, ...days.map((d) => d.runs)))
    const n = days.length
    const slot = (W - L) / n
    const bw = Math.min(70, slot * (n > 20 ? 0.62 : 0.72))
    const rx = Math.min(bw / 2, 20)
    const today = dayKey(Date.now())
    const top = Math.max(...days.map((d) => d.runs))
    const avg = days.reduce((s, d) => s + d.runs, 0) / n
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
    // two lines under each bar: the weekday, and the day (every few days when there are many)
    const label = (d, i) => {
      const date = new Date(d.start)
      const wd = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
      const show = n <= 14 || i % 3 === (n - 1) % 3
      return show ? [wd.charAt(0).toUpperCase() + wd.slice(1, 3), String(date.getDate())] : ['', '']
    }
    let svg = `<svg height="${H}" viewBox="0 0 ${W} ${H}"><defs><pattern id="hatch-${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="7" fill="var(--bar-hatch)"/></pattern></defs>`
    for (const t of ticks) {
      const y = T + ph - (t / max) * ph
      svg += `<text class="axis" x="0" y="${y + 4}">${nf(Number.isInteger(t) ? 0 : 1).format(t)}</text>`
    }
    days.forEach((d, i) => {
      const x = L + slot * i + (slot - bw) / 2
      const h = d.runs ? Math.max(rx * 1.1, (d.runs / max) * ph) : 0
      const isToday = dayKey(d.start) === today
      const fill = isToday ? 'var(--primary)' : d.runs === top && top > 0 ? 'var(--primary-2)' : 'var(--primary-3)'
      svg += `<rect x="${x}" y="${T}" width="${bw}" height="${ph}" rx="${rx}" fill="var(--bar-bg)"/><rect x="${x}" y="${T}" width="${bw}" height="${ph}" rx="${rx}" fill="url(#hatch-${id})"/>`
      if (h) svg += `<rect class="bar" data-i="${i}" x="${x}" y="${T + ph - h}" width="${bw}" height="${h}" rx="${rx}" fill="${fill}" data-fill="${fill}"/>`
      const [wd, day] = label(d, i)
      svg += `<text class="axis x${isToday ? ' on' : ''}" x="${x + bw / 2}" y="${H - 24}" text-anchor="middle">${esc(wd)}</text><text class="axis x${isToday ? ' on' : ''}" x="${x + bw / 2}" y="${H - 7}" text-anchor="middle" style="font-size:11px">${esc(day)}</text>`
      svg += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="0" width="${slot}" height="${H - B}"/>`
    })
    if (avg > 0) svg += `<line class="avg" x1="${L}" x2="${W}" y1="${T + ph - (avg / max) * ph}" y2="${T + ph - (avg / max) * ph}"/>`
    svg += '</svg>'
    el.innerHTML = svg + '<div class="tip"></div>'
    const tip = $('.tip', el)
    el.querySelectorAll('.hit').forEach((hit) => {
      const i = Number(hit.dataset.i)
      const d = days[i]
      hit.addEventListener('mouseenter', () => {
        el.querySelectorAll('.bar').forEach((b) => b.setAttribute('fill', b.dataset.i == i ? 'var(--primary)' : b.dataset.fill))
        const date = new Date(d.start)
        tip.innerHTML = `<div class="t-head">${esc(date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))}<span>${esc(date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }))}</span></div>
          <div class="t-row">Execuções <b>${d.runs}</b></div><div class="t-row">Notas entregues <b>${d.notes}</b></div><div class="t-row">Custo <b>${money(d.cost)}</b></div>${d.failed ? `<div class="t-row">Falhas <b>${d.failed}</b></div>` : ''}`
        const x = L + slot * i + slot / 2
        const left = Math.min(Math.max(x + bw / 2 - 10, 0), W - 190)
        tip.style.left = `${left}px`
        tip.style.top = `${8}px`
        tip.classList.add('show')
      })
    })
    el.querySelector('svg').addEventListener('mouseleave', () => {
      tip.classList.remove('show')
      el.querySelectorAll('.bar').forEach((b) => b.setAttribute('fill', b.dataset.fill))
    })
  })
  return `<div class="chart" data-chart="${id}" style="height:248px"></div>`
}

/** A smooth path through points that never overshoots them (monotone cubic, Fritsch–Carlson). */
function smooth(pts) {
  const n = pts.length
  if (n < 2) return ''
  const dx = [], m = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const h = a * a + b * b
    if (h > 9) {
      const k = 3 / Math.sqrt(h)
      t[i] = k * a * m[i]
      t[i + 1] = k * b * m[i]
    }
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C ${pts[i][0] + h} ${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h} ${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]} ${pts[i + 1][1]}`
  }
  return d
}

function lineChart(id, days) {
  charts.set(id, (el) => {
    const W = el.clientWidth
    const H = 220
    const L = 52
    const R = 8
    const T = 12
    const B = 30
    const ph = H - T - B
    const max = niceMax(Math.max(0.01, ...days.flatMap((d) => [d.cost, d.prevCost])))
    const n = days.length
    const x = (i) => L + ((W - L - R) * (i + 0.5)) / n
    const y = (v) => T + ph - (v / max) * ph
    const cur = days.map((d, i) => [x(i), y(d.cost)])
    const prev = days.map((d, i) => [x(i), y(d.prevCost)])
    const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => f * max)
    let svg = `<svg height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="fill-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--line)" stop-opacity="0.18"/><stop offset="1" stop-color="var(--line)" stop-opacity="0"/></linearGradient></defs>`
    for (const t of ticks) {
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="0" y="${y(t) + 4}">${t ? `$${nf(t < 10 ? 1 : 0).format(t)}` : '0'}</text>`
    }
    svg += `<path d="${smooth(cur)} L ${cur.at(-1)[0]} ${T + ph} L ${cur[0][0]} ${T + ph} Z" fill="url(#fill-${id})"/>`
    svg += `<path d="${smooth(prev)}" fill="none" stroke="var(--line-prev)" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round"/>`
    svg += `<path d="${smooth(cur)}" fill="none" stroke="var(--line)" stroke-width="2.2" stroke-linecap="round"/>`
    days.forEach((d, i) => {
      const date = new Date(d.start)
      const lab =
        n <= 7
          ? date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
          : n <= 14
            ? `${date.getDate()}/${date.getMonth() + 1}`
            : i % 3 === 0
              ? `${date.getDate()}/${date.getMonth() + 1}`
              : ''
      svg += `<text class="axis x" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`
    })
    svg += `<line class="cursor" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--cursor)" stroke-dasharray="3 3" opacity="0"/><circle class="pt" r="6" fill="var(--pt)" stroke="var(--pt-ring)" stroke-width="2.5" opacity="0"/>`
    svg += `<rect class="hit" x="${L}" y="0" width="${W - L - R}" height="${T + ph}"/></svg>`
    el.innerHTML = svg + '<div class="tip"></div>'
    const tip = $('.tip', el)
    const cursor = $('.cursor', el)
    const pt = $('.pt', el)
    const hit = $('.hit', el)
    hit.addEventListener('mousemove', (e) => {
      const box = el.getBoundingClientRect()
      const mx = e.clientX - box.left
      const i = Math.max(0, Math.min(n - 1, Math.round(((mx - L) / (W - L - R)) * n - 0.5)))
      const d = days[i]
      cursor.setAttribute('x1', x(i))
      cursor.setAttribute('x2', x(i))
      cursor.setAttribute('opacity', 1)
      pt.setAttribute('cx', x(i))
      pt.setAttribute('cy', y(d.cost))
      pt.setAttribute('opacity', 1)
      const date = new Date(d.start)
      tip.innerHTML = `<div class="t-line"><i></i>${money(d.cost)}</div><div class="t-line"><i class="dash"></i>${money(d.prevCost)}</div>
        <div class="t-foot"><b>${esc(date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))}</b>${esc(date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }))}</div>`
      const left = x(i) + 16 + 190 > W ? x(i) - 206 : x(i) + 16
      tip.style.left = `${left}px`
      tip.style.top = `${Math.max(0, y(d.cost) - 50)}px`
      tip.classList.add('show')
    })
    hit.addEventListener('mouseleave', () => {
      tip.classList.remove('show')
      cursor.setAttribute('opacity', 0)
      pt.setAttribute('opacity', 0)
    })
  })
  return `<div class="chart" data-chart="${id}" style="height:220px"></div>`
}

function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach((el) => charts.get(el.dataset.chart)?.(el))
}
let resizeTimer
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(drawCharts, 120)
})

/** Segmented bars with the amounts above, like "Financial structure". */
function structure(items, fmt, classes) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return `<div class="empty">Ainda sem dados neste período.</div>`
  const cols = items.map((i) => `${Math.max(0.6, i.value / total)}fr`).join(' ')
  const grid = (inner) => `<div style="display:grid;grid-template-columns:${cols};gap:4px">${inner}</div>`
  return `<div class="structure">
    ${grid(items.map((i) => `<div class="labels"><div><small title="${esc(i.label)}">${esc(i.label)}</small><b>${fmt(i.value)}</b></div></div>`).join(''))}
    ${grid(items.map(() => `<div class="stems"><div></div></div>`).join(''))}
    ${grid(items.map((i, n) => `<div class="bars"><div class="${classes(i, n)}" title="${esc(i.label)}"></div></div>`).join(''))}
    ${grid(items.map((i) => `<div class="pcts">${Math.round((i.value / total) * 100)}%</div>`).join(''))}
  </div>`
}

function ticks(fraction, count = 40, cls = '') {
  const on = Math.round(Math.max(0, Math.min(1, fraction)) * count)
  return `<div class="ticks ${cls}">${Array.from({ length: count }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`
}

/* ------------------------------------------------------------------- views */
function agentStatus() {
  const a = S.agent
  if (!a) return { label: 'Ligando…', dot: '', tone: 'gray' }
  if (a.current) return { label: `rodando a #${a.current.id}`, dot: 'purple', tone: 'purple' }
  if (a.online === false) return { label: 'sem conexão', dot: 'orange', tone: 'orange' }
  if (a.paused) return { label: 'pausado', dot: 'yellow', tone: 'yellow' }
  if (a.status?.state === 'limited') return { label: 'esperando o limite', dot: 'yellow', tone: 'yellow' }
  if (a.online) return { label: 'pronto', dot: 'green', tone: 'green' }
  return { label: 'ligando…', dot: '', tone: 'gray' }
}

function renderChrome(d) {
  const st = agentStatus()
  $('#machine').innerHTML = `<span class="dot ${st.dot}"></span><span>${esc(S.agent?.name ?? 'Este PC')}</span><span class="hint">· ${esc(st.label)}</span>`
  $('#run-top').innerHTML = `${icon('plus', 15)} Rodar notas`
  $('#btn-search').innerHTML = icon('search', 17)
  const dark = theme() === 'dark'
  $('#btn-theme').innerHTML = icon(dark ? 'sun' : 'moon', 17)
  $('#btn-theme').title = dark ? 'Tema claro' : 'Tema escuro'
  const n = alerts(d).filter((a) => a.tone !== 'green').length
  $('#btn-bell').innerHTML = icon('bell', 17) + (n ? `<span class="badge-count">${n}</span>` : '')
  const tabs = [
    ['painel', 'grid', 'Painel'],
    ['execucoes', 'list', 'Execuções'],
    ['projetos', 'folder', 'Projetos'],
    ['log', 'terminal', 'Log e configuração'],
  ]
  $('#nav').innerHTML = tabs
    .map(([id, ic, label]) => `<button class="${S.view === id ? 'active' : ''}" data-view="${id}">${icon(ic, 16)}${label}</button>`)
    .join('')
}

function head(title, actions, sub = '') {
  return `<div class="head"><h1>${title}</h1><div class="actions">${actions}</div></div>${sub}`
}
const periodTabs = () =>
  `<div class="subtabs">${[
    [7, '7 dias'],
    [14, '14 dias'],
    [30, '30 dias'],
    [0, 'Tudo'],
  ]
    .map(([p, l]) => `<button class="${S.period === p ? 'active' : ''}" data-period="${p}">${l}</button>`)
    .join('')}</div>`
const headActions = () => {
  const paused = S.agent?.paused
  return `${S.data.stale && S.data.at ? `<span class="stale">${icon('alert', 14)} cópia de ${ago(S.data.at)}</span>` : ''}
    <button class="btn" data-action="${paused ? 'resume' : 'pause'}">${icon(paused ? 'play' : 'pause', 15)}${paused ? 'Retomar' : 'Pausar'}</button>
    <button class="btn dark" data-action="run-modal">${icon('plus', 15)}Rodar notas</button>
    <button class="icon-btn" data-action="open" data-what="config" title="Abrir a configuração">${icon('settings', 17)}</button>`
}

function trend(v) {
  if (v == null) return ''
  const r = Math.round(v * 10) / 10
  const cls = r > 0 ? '' : r < 0 ? 'down' : 'flat'
  return `<span class="trend ${cls}">${icon(r >= 0 ? 'trendUp' : 'trendDown', 14)}${r > 0 ? '+' : ''}${nf(Math.abs(r) < 10 ? 1 : 0).format(r)}%</span>`
}

function statsStrip(st) {
  const period = S.period ? `nos últimos ${S.period} dias` : 'desde o começo'
  return `<div class="stats">
    <div class="stat"><div class="label">Execuções</div><div class="value tabular">${nf().format(st.runs)}</div><div class="sub">${period} ${trend(st.runsTrend)}</div></div>
    <div class="stat"><div class="label">Notas entregues</div><div class="value tabular">${nf().format(st.notes)}</div><div class="sub">${st.success == null ? 'sem execuções terminadas' : `sucesso em ${Math.round(st.success * 100)}% das execuções`}</div></div>
    <div class="stat"><div class="label">Custo equivalente</div><div class="value tabular">${money(st.cost, true)}</div><div class="sub">${st.runs ? `≈ ${money(st.cost / st.runs)} por execução` : 'na API, para comparar'} ${trend(st.costTrend)}</div></div>
    <div class="stat"><div class="label">Tokens</div><div class="value tabular">${tokens(st.tokens).replace(/ (M|mil)$/, '<span class="unit">$1</span>')}</div><div class="sub">${tokens(st.out)} de saída</div></div>
    <div class="stat"><div class="label">Tempo médio</div><div class="value tabular">${st.avgDur == null ? '—' : dur(st.avgDur).replace(/ (min|s|h)\b/g, '<span class="unit">$1</span>')}</div><div class="sub">${nf().format(st.commits)} commits no período</div></div>
  </div>`
}

function nowBlock(d) {
  const a = S.agent
  const c = a?.current
  if (c) {
    const msgs = c.messages ?? []
    const lastMsg = msgs.at(-1) ?? 'Preparando a pasta e lendo as notas…'
    const plan = c.plan ?? []
    const kinds = c.kinds ?? {}
    const model = plan[c.group ?? 0]
    return `<div class="now">
      <div>
        <div class="now-title">${tile(c.app)}<h3>${c.kind === 'rollback' ? `Desfazendo a #${c.target}` : `Execução #${c.id}`}</h3>${badge('running')}<span class="hint">${esc(c.app)}</span></div>
        <div class="now-meta">${c.notes.map((n) => `<span class="chip">${kinds[n] ? `<i class="k ${kinds[n]}"></i>` : ''}#${n}${kinds[n] ? ` · ${KIND[kinds[n]] ?? kinds[n]}` : ''}</span>`).join('')}</div>
        ${plan.length ? `<div class="plan">${plan.map((g, i) => `<div class="step ${i === c.group ? 'on' : i < (c.group ?? 0) ? 'done' : ''}"><span class="num">${i < (c.group ?? 0) ? '✓' : i + 1}</span><b>${esc(modelName(`${g.model}/${g.effort ?? ''}`.replace(/\/$/, '')))}</b><span>${g.notes.map((n) => `#${n}`).join(' ')}</span></div>`).join('')}</div>` : ''}
        <div class="speech"><div class="who-says"><i></i>Claude${model ? ` · ${esc(modelName(model.model))}` : ''}</div><p>${esc(lastMsg)}</p><div class="typing"><span></span><span></span><span></span></div></div>
        ${msgs.length > 1 ? `<ul class="feed">${msgs.slice(-5, -1).reverse().map((m) => `<li><span>${esc(m.split('\n')[0])}</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="clock">
        <div>
          <div class="hint">Tempo rodando</div>
          <div class="big tabular" id="elapsed" data-since="${esc(c.startedAt)}">${dur(Date.now() - Date.parse(c.startedAt))}</div>
          <div class="budget"><span id="elapsed-bar" data-limit="${(a.config?.timeoutMinutes ?? 45) * 60000}" style="width:${Math.min(100, ((Date.now() - Date.parse(c.startedAt)) / ((a.config?.timeoutMinutes ?? 45) * 60000)) * 100)}%"></span></div>
          <div class="budget-label"><span>0</span><span>limite de ${a.config?.timeoutMinutes ?? 45} min</span></div>
        </div>
        <div class="rows">
          <div>Custo até aqui <b class="tabular">${money(c.spent ?? 0)}</b></div>
          <div>Mensagens <b class="tabular">${msgs.length}</b></div>
          <div>Teto da execução <b class="tabular">${a.config?.maxBudgetUsd ? money(a.config.maxBudgetUsd) : '—'}</b></div>
          <div>Tempo máximo <b class="tabular">${a.config?.timeoutMinutes ?? '—'} min</b></div>
        </div>
        <button class="btn danger" data-action="cancel" data-id="${c.id}">${icon('ban', 15)}Cancelar execução</button>
      </div>
    </div>`
  }
  const st = agentStatus()
  const last = S.data.runs.find((r) => !active(r))
  const title =
    st.tone === 'green' ? 'Pronto, esperando pedidos' : st.tone === 'yellow' ? (a?.paused ? 'Pausado' : 'Esperando o limite do Claude') : st.tone === 'orange' ? 'Sem conexão com o Worker' : 'Ligando o agente…'
  const sub = a?.lastPoll ? `Última consulta ${ago(a.lastPoll)} · a cada ${a.config?.pollSeconds ?? 20} s · parado, não gasta nada do Claude` : 'Esperando a primeira consulta ao Worker.'
  return `<div class="idle">
    <div class="idle-mark"><img src="/icons/app.svg" alt=""/></div>
    <div>
      <div class="now-title" style="gap:10px"><h3 style="margin:0">${title}</h3><span class="badge ${st.tone}">${esc(st.label)}</span></div>
      <p style="margin-top:6px">${esc(sub)}</p>
      <div class="last">${d.queued.length ? `${icon('clock', 15)} Na fila: ${d.queued.map((q) => `<span class="chip">#${q.id} ${esc(q.app)}</span>`).join('')}` : last ? `Última: <span class="chip">#${last.id} ${esc(last.app)}</span> ${badge(last.status)} <span class="hint">${ago(last.finishedAt ?? last.createdAt)}</span>` : 'Nenhuma execução ainda.'}</div>
    </div>
    <div style="display:flex;gap:8px">${last ? `<button class="btn" data-action="detail" data-id="${last.id}">${icon('file', 15)}Ver a última</button>` : ''}<button class="btn dark" data-action="run-modal">${icon('play', 14)}Rodar notas</button></div>
  </div>`
}

function limitsCard() {
  const u = S.agent?.usage ?? {}
  const meter = (title, w, ico, resetFmt) => {
    const v = w?.utilization ?? 0
    const cls = v >= 0.9 ? 'red' : v >= 0.7 ? 'yellow' : ''
    const reset = w?.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString('pt-BR', resetFmt) : null
    return `<div class="limit">
      <div class="limit-head"><span class="name"><span class="ico">${icon(ico, 17)}</span>${title}</span><span class="pillstat">Uso <b class="${cls ? '' : 'green'}">${w ? `${Math.round(v * 100)}%` : '—'}</b></span></div>
      ${ticks(v, 32, cls)}
      <div class="scale"><span>0</span><span>${reset ? `volta ${esc(reset)}` : 'sem leitura ainda'}</span><span>100</span></div>
    </div>`
  }
  return `<div>
    <div class="sec-head"><h3>Limite do Claude</h3><span class="pillstat">${icon('coins', 14)} hoje <b>${money(u.costToday ?? 0)}</b></span></div>
    ${meter('Janela de 5 horas', u.fiveHour, 'clock', { hour: '2-digit', minute: '2-digit' })}
    ${meter('Semana', u.sevenDay, 'gauge', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
    <p class="hint" style="margin:10px 2px 0">Acima de ${Math.round((S.agent?.config?.maxFiveHour ?? 0.9) * 100)}% na janela de 5 h, nada novo começa até ela virar.</p>
  </div>`
}

function alertsCard(d) {
  const list = alerts(d)
  return `<div id="alerts">
    <div class="sec-head"><h3>Alertas</h3><button class="more" data-action="refresh" title="Atualizar">${icon('refresh', 16)}</button></div>
    <div class="alerts">${
      list.length
        ? list
            .slice(0, 6)
            .map(
              (a) => `<div class="alert"><span class="ico ${a.tone}">${icon(a.icon, 19)}</span><div><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div>${
                a.action
                  ? `<button class="link pill" data-action="${a.action[0]}" ${a.action[2] ? `data-app="${esc(a.action[2])}"` : ''}>${a.action[1]}</button>`
                  : a.run
                    ? `<button class="link" data-action="detail" data-id="${a.run}">Ver</button>`
                    : ''
              }</div>`,
            )
            .join('')
        : '<div class="empty">Tudo certo por aqui.</div>'
    }</div>
  </div>`
}

function kindsCard(d) {
  const items = ['bug', 'idea', 'ux', 'question']
    .map((k) => ({ key: k, label: KIND[k], value: d.kinds[k] ?? 0 }))
    .filter((i) => i.value)
  return `<div>
    <div class="sec-head"><h3>Tipos de nota</h3><span class="hint">bug → Sonnet · resto → Opus</span></div>
    ${items.length ? structure(items, (v) => nf().format(v), (i) => `seg-${i.key}`) : '<div class="empty">Aparece a partir das próximas execuções.</div>'}
  </div>`
}

function answersCard() {
  const list = S.data.runs.filter((r) => r.kind === 'work' && r.summary).slice(0, 4)
  return `<div>
    <div class="sec-head"><h3>Últimas respostas</h3><button class="link" data-view="execucoes">Ver todas</button></div>
    <div class="answers">${
      list.length
        ? list
            .map(
              (r) => `<div class="answer" data-action="detail" data-id="${r.id}"><div class="top"><span style="display:flex;gap:8px;align-items:center">${tile(r.app, 22)}<b>#${r.id} · ${esc(r.app)}</b></span><span>${ago(r.finishedAt)}</span></div><p>${esc(r.summary.replace(/\n\s*\n+/g, '\n'))}</p></div>`,
            )
            .join('')
        : '<div class="empty">O relatório de cada execução aparece aqui.</div>'
    }</div>
  </div>`
}

function modelCard(d) {
  const entries = Object.entries(d.byModel).sort((a, b) => b[1] - a[1])
  const top = entries.slice(0, 3).map(([k, v]) => ({ label: modelName(k), value: v }))
  const rest = entries.slice(3).reduce((s, [, v]) => s + v, 0)
  if (rest) top.push({ label: 'Outros', value: rest })
  return `<div class="sec-head"><h2>Custo por modelo</h2><span class="hint">equivalente na API</span></div>
    ${structure(top, (v) => money(v), (i, n) => (i.label === 'Outros' ? 'seg-4' : `seg-${n + 1}`))}`
}

function runRows(runs, compact) {
  if (!runs.length) return `<div class="empty">Nenhuma execução${S.search || S.filter !== 'all' || S.app ? ' com esse filtro' : ' ainda'}.</div>`
  return `<div class="scroll-x"><table class="table">
    <thead><tr><th>Execução</th><th>Projeto</th><th>Notas</th><th>Status</th><th>Modelo</th>${compact ? '' : '<th>Commits</th>'}<th class="num">Duração</th><th class="num">Custo</th><th>Quando</th></tr></thead>
    <tbody>${runs
      .map(
        (r) => `<tr class="click" data-action="detail" data-id="${r.id}">
        <td><span class="name">${icon(r.kind === 'rollback' ? 'undo' : 'spark', 15)}#${r.id}${r.kind === 'rollback' ? ` <span class="hint">desfaz #${r.targetRun}</span>` : ''}${r.rolledBackBy ? ` <span class="badge gray plain">desfeita</span>` : ''}</span></td>
        <td><span class="name">${tile(r.app, 24)}${esc(r.app)}</span></td>
        <td class="ellipsis">${r.notes.map((n) => `#${n}`).join(' ')}</td>
        <td>${badge(r.status)}</td>
        <td class="muted" title="${esc(r.stats?.model ?? '')}">${esc(r.stats?.model ? [...new Set(String(r.stats.model).split(', ').map((m) => modelName(m.split('/')[0])))].join(' + ') : r.kind === 'rollback' ? 'sem Claude' : '—')}</td>
        ${compact ? '' : `<td class="muted">${r.commits.length || '—'}</td>`}
        <td class="num tabular">${dur(runDur(r))}</td>
        <td class="num tabular">${r.stats?.costUsd != null ? money(r.stats.costUsd) : '—'}</td>
        <td class="muted">${ago(r.createdAt)}</td>
      </tr>`,
      )
      .join('')}</tbody></table></div>`
}

function projectsTable(d) {
  const rows = d.projects.filter((p) => p.runs || p.dir)
  if (!rows.length) return '<div class="empty">Nenhum projeto com feedback-kit.json nas pastas configuradas.</div>'
  return `<div class="scroll-x"><table class="table">
    <thead><tr><th>Projeto</th><th>Sucesso</th><th>Participação</th><th>Abertas</th><th class="num">Custo</th></tr></thead>
    <tbody>${rows
      .map(
        (p) => `<tr class="click" data-action="filter-app" data-app="${esc(p.app)}">
        <td><span class="name">${tile(p.app)}${esc(p.name)}${p.dir ? '' : ' <span class="badge yellow">sem pasta</span>'}</span></td>
        <td><span class="zap">${icon('zap', 14)}${p.success == null ? '—' : `${Math.round(p.success * 100)}%`}</span></td>
        <td><div style="display:flex;align-items:center;gap:10px"><span class="hint tabular" style="width:44px">(${Math.round(p.share * 100)}%)</span><div style="width:200px">${ticks(p.share, 24, 'sm')}</div></div></td>
        <td>${p.open == null ? '—' : p.open}</td>
        <td class="num money tabular">${money(p.cost)}</td>
      </tr>`,
      )
      .join('')}</tbody></table></div>`
}

function viewPainel(d) {
  return `${head('Painel', headActions(), periodTabs())}
    ${statsStrip(d.stats)}
    <div class="board">
      <div class="main">
        <div class="section" id="now">${nowBlock(d)}</div>
        <div class="split">
          <div class="section"><div class="sec-head"><h2>Execuções por dia</h2><div class="legend"><span><i></i>hoje</span><span><i style="background:var(--primary-3)"></i>outros dias</span></div></div>${barChart('bars', d.days)}</div>
          <div class="section">${modelCard(d)}</div>
        </div>
        <div class="section"><div class="sec-head"><h2>Custo por dia</h2><div class="legend"><span><i></i>Este período</span><span><i class="dash"></i>Período anterior</span></div></div>${lineChart('line', d.days)}</div>
        <div class="section"><div class="sec-head"><h2>Projetos</h2><button class="link" data-view="projetos">Ver projetos</button></div>${projectsTable(d)}</div>
        <div class="section"><div class="sec-head"><h2>Histórico recente</h2><button class="link" data-view="execucoes">Ver tudo</button></div>${runRows(S.data.runs.slice(0, 6), true)}</div>
      </div>
      <aside class="side">
        ${limitsCard()}
        ${alertsCard(d)}
        ${kindsCard(d)}
        ${answersCard()}
      </aside>
    </div>`
}

function viewRuns() {
  const q = S.search.toLowerCase()
  const runs = S.data.runs.filter(
    (r) =>
      (S.filter === 'all' || (S.filter === 'undone' ? r.kind === 'rollback' || r.rolledBackBy : r.status === S.filter)) &&
      (!S.app || r.app === S.app) &&
      (!q || `#${r.id} ${r.app} ${r.summary ?? ''} ${r.error ?? ''} ${r.messages.join(' ')}`.toLowerCase().includes(q)),
  )
  const apps = [...new Set(S.data.runs.map((r) => r.app))].sort()
  const f = [
    ['all', 'Todas'],
    ['running', 'Rodando'],
    ['done', 'Concluídas'],
    ['failed', 'Falharam'],
    ['canceled', 'Canceladas'],
    ['undone', 'Desfeitas'],
  ]
  return `${head('Execuções', headActions())}
    <div class="subtabs" style="padding-bottom:0"></div>
    <div class="section">
      <div class="sec-head">
        <div class="filters">${f.map(([k, l]) => `<button class="${S.filter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
        <div class="tools">
          <select class="select" data-input="app"><option value="">Todos os projetos</option>${apps.map((a) => `<option ${S.app === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
          <label class="search">${icon('search', 16)}<input id="search" data-input="search" placeholder="Procurar no relatório, nas mensagens…" value="${esc(S.search)}"/></label>
        </div>
      </div>
      ${runRows(runs.slice(0, 200))}
    </div>`
}

function viewProjects(d) {
  const list = d.projects
  return `${head('Projetos', headActions())}<div class="subtabs" style="padding-bottom:0"></div>
    <div class="cards">${
      list.length
        ? list
            .map(
              (p) => `<div class="card">
        <div class="top">${tile(p.app)}${p.dir ? (d.queued.some((q) => q.app === p.app) || S.agent?.current?.app === p.app ? badge('running') : '<span class="badge green">Pasta ok</span>') : '<span class="badge yellow">Sem pasta aqui</span>'}</div>
        <h3>${esc(p.name)}</h3>
        <div class="path" title="${esc(p.dir ?? '')}">${esc(p.dir ?? 'Crie um feedback-kit.json na pasta do projeto')}</div>
        <div class="rows">
          <div>Notas abertas <b>${p.open ?? '—'}</b></div>
          <div>Execuções no período <b>${p.runs}</b></div>
          <div>Sucesso <b>${p.success == null ? '—' : `${Math.round(p.success * 100)}%`}</b></div>
          <div>Custo <b>${money(p.cost)}</b></div>
          <div>Última <b>${p.last ? `#${p.last.id} · ${ago(p.last.createdAt)}` : '—'}</b></div>
          <div>Publicar ao desfazer <b>${esc(p.deploy ?? 'pelo push')}</b></div>
        </div>
        <div class="foot">
          <button class="btn dark sm grow" data-action="run" data-app="${esc(p.app)}" ${p.dir && p.open ? '' : 'disabled'}>${icon('play', 13)}Rodar ${p.open ?? ''} nota${p.open === 1 ? '' : 's'}</button>
          <button class="icon-btn" title="Abrir a pasta" data-action="open" data-what="folder" data-app="${esc(p.app)}" ${p.dir ? '' : 'disabled'}>${icon('folder', 15)}</button>
          <button class="icon-btn" title="Execuções deste projeto" data-action="filter-app" data-app="${esc(p.app)}">${icon('list', 15)}</button>
        </div>
      </div>`,
            )
            .join('')
        : '<div class="empty">Nenhum projeto encontrado.</div>'
    }</div>`
}

let logLines = []
function viewLog() {
  const a = S.agent ?? {}
  const c = a.config ?? {}
  const models = Object.entries(c.models ?? {})
    .map(([k, v]) => `${k === 'default' ? 'O resto' : KIND[k] ?? k} → ${modelName(`${v.model}/${v.effort ?? ''}`.replace(/\/$/, ''))}`)
    .join('\n')
  const items = [
    ['Computador', a.name],
    ['Versão do agente', a.version],
    ['Worker', a.worker],
    ['Modelos', models],
    ['Teto por execução', c.maxBudgetUsd ? money(c.maxBudgetUsd) : 'sem teto'],
    ['Tempo máximo', `${c.timeoutMinutes ?? '—'} min`],
    ['Permissões', c.permissionMode],
    ['Pastas procuradas', (c.roots ?? []).join(', ')],
  ]
  const line = (l) => {
    const m = l.match(/^(\S+Z) (.*)$/)
    const text = m ? m[2] : l
    const cls = /falh|erro|sem conexão|não /i.test(text) ? 'err' : /feita|ligado|concluí|pronto/i.test(text) ? 'ok' : ''
    return `${m ? `<span class="ts">${esc(new Date(m[1]).toLocaleString('pt-BR'))}</span>  ` : ''}<span class="${cls}">${esc(text)}</span>`
  }
  return `${head('Log e configuração', `<button class="btn" data-action="open" data-what="runs">${icon('folder', 15)}Transcrições</button><button class="btn" data-action="open" data-what="log">${icon('file', 15)}Abrir o log</button><button class="btn dark" data-action="open" data-what="config">${icon('settings', 15)}Editar agent.json</button>`)}
    <div class="subtabs" style="padding-bottom:0"></div>
    <div class="config">${items.map(([k, v]) => `<div class="${k === 'Pastas procuradas' || k === 'Worker' ? 'wide' : ''}"><small>${k}</small><b style="white-space:pre-line">${esc(v ?? '—')}</b></div>`).join('')}</div>
    <div class="log" id="log">${logLines.length ? logLines.map(line).join('\n') : 'Sem log ainda.'}</div>`
}

/* ------------------------------------------------------------------ drawer */
function renderDrawer() {
  const el = $('#drawer')
  const r = S.data.runs.find((x) => x.id === S.drawer)
  if (!S.drawer || !r) {
    el.classList.remove('show')
    $('#scrim').classList.remove('show')
    return
  }
  const live = S.agent?.current?.id === r.id ? S.agent.current : null
  const messages = live?.messages?.length ? live.messages : r.messages
  const s = r.stats ?? {}
  el.innerHTML = `<header>
      <div class="row">${tile(r.app)}<div style="flex:1"><h2>${r.kind === 'rollback' ? `Desfazer a #${r.targetRun}` : `Execução #${r.id}`}</h2><div class="hint">${esc(r.app)} · ${when(r.createdAt)}</div></div>${badge(r.status)}<button class="icon-btn" data-action="close" title="Fechar">${icon('x', 17)}</button></div>
    </header>
    <div class="body">
      <div class="kv">
        <div><small>Modelo</small><b>${esc(s.model ? String(s.model).split(', ').map(modelName).join(' + ') : r.kind === 'rollback' ? 'sem Claude' : '—')}</b></div>
        <div><small>Duração</small><b>${dur(runDur(r))}</b></div>
        <div><small>Custo</small><b>${s.costUsd != null ? money(s.costUsd) : '—'}</b></div>
        <div><small>Tokens</small><b>${runTokens(r) ? tokens(runTokens(r)) : '—'}</b></div>
        <div><small>Turnos</small><b>${s.turns ?? '—'}</b></div>
        <div><small>Commits</small><b>${r.commits.length}</b></div>
      </div>
      <div class="block"><h4>Notas</h4><div style="display:flex;gap:6px;flex-wrap:wrap">${r.notes.map((n) => `<span class="chip">#${n}</span>`).join('') || '—'}</div>${r.instructions ? `<p class="hint" style="margin:10px 0 0">Instrução: ${esc(r.instructions)}</p>` : ''}</div>
      ${r.summary ? `<div class="block"><h4>Relatório</h4><div class="report">${esc(r.summary)}</div></div>` : ''}
      ${r.error ? `<div class="block"><h4>O que deu errado</h4><div class="error-box">${esc(r.error)}</div></div>` : ''}
      ${r.commits.length ? `<div class="block"><h4>Commits</h4><div class="commits">${r.commits.map((c) => `<code>${esc(c)}</code>`).join('')}</div>${r.baseSha ? `<p class="hint" style="margin:8px 0 0">${esc(r.baseSha.slice(0, 7))} → ${esc((r.headSha ?? '').slice(0, 7))}${r.rolledBackBy ? ` · desfeita pela #${r.rolledBackBy}` : ''}</p>` : ''}</div>` : ''}
      <div class="block"><h4>O que o Claude foi dizendo</h4>${messages.length ? `<ul class="timeline">${messages.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<div class="empty">Nada ainda.</div>'}</div>
    </div>
    <footer>
      <button class="btn" data-action="open" data-what="transcript" data-id="${r.id}">${icon('file', 15)}Transcrição</button>
      ${active(r) ? `<button class="btn danger" data-action="cancel" data-id="${r.id}">${icon('ban', 15)}Cancelar</button>` : ''}
      ${undoable(r) ? `<button class="btn dark" data-action="rollback" data-id="${r.id}">${icon('undo', 15)}Desfazer</button>` : ''}
    </footer>`
  el.classList.add('show')
  $('#scrim').classList.add('show')
}

/* ------------------------------------------------------------------- modal */
function openModal(app) {
  const d = derive()
  const ready = d.projects.filter((p) => p.dir)
  const pick = app ?? ready.find((p) => p.open)?.app ?? ready[0]?.app ?? ''
  $('#modal').innerHTML = `<h2>Rodar notas</h2><p class="hint" style="margin:0">As notas abertas do projeto vão para o Claude neste computador: bugs no Sonnet, o resto no Opus.</p>
    <label>Projeto</label>
    <select class="select" id="m-app">${ready.map((p) => `<option value="${esc(p.app)}" ${p.app === pick ? 'selected' : ''}>${esc(p.name)} · ${p.open ?? 0} aberta${p.open === 1 ? '' : 's'}</option>`).join('')}</select>
    <label>Instrução para esta execução (opcional)</label>
    <textarea id="m-instr" placeholder="Ex.: não publicar hoje, só a #3 primeiro…"></textarea>
    <div class="foot"><button class="btn" data-action="close">Cancelar</button><button class="btn dark" data-action="run-go">${icon('play', 14)}Rodar</button></div>`
  $('#modal').classList.add('show')
  $('#scrim').classList.add('show')
}
function closeAll() {
  S.drawer = null
  $('#modal').classList.remove('show')
  renderDrawer()
}

/** What scrolls: the page in a browser, the content under the bar in the window. */
const scroller = () => (document.documentElement.classList.contains('desktop') ? $('#view') : document.scrollingElement)

/* ------------------------------------------------------------------ render */
let lastKey = ''
function render(force) {
  const d = derive()
  renderChrome(d)
  const key = JSON.stringify([S.view, S.period, S.filter, S.app, S.data.at, S.data.runs.length, S.data.runs[0]?.updatedAt, S.agent?.online, S.agent?.paused, S.agent?.status?.state, !!S.agent?.current, S.agent?.usage?.fiveHour?.utilization, logLines.length])
  if (!force && key === lastKey) {
    // only the live parts move
    if (S.view === 'painel') $('#now') && ($('#now').innerHTML = nowBlock(d))
    if (S.drawer) renderDrawer()
    return
  }
  lastKey = key
  const scroll = scroller().scrollTop
  const focus = document.activeElement?.id
  const view =
    S.view === 'execucoes' ? viewRuns() : S.view === 'projetos' ? viewProjects(d) : S.view === 'log' ? viewLog() : viewPainel(d)
  $('#view').innerHTML = view
  drawCharts()
  if (focus === 'search') {
    const input = $('#search')
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }
  scroller().scrollTop = scroll
  if (S.drawer) renderDrawer()
}

/* ------------------------------------------------------------------ events */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-view],[data-period],[data-filter],[data-action]')
  if (!t) return
  if (t.dataset.view) {
    S.view = t.dataset.view
    localStorage.setItem('fk.view', S.view)
    scroller().scrollTop = 0
    if (S.view === 'log') loadLog()
    return render(true)
  }
  if (t.dataset.period) {
    S.period = Number(t.dataset.period)
    localStorage.setItem('fk.period', S.period)
    return render(true)
  }
  if (t.dataset.filter) {
    S.filter = t.dataset.filter
    return render(true)
  }
  const { action, id, app, what } = t.dataset
  try {
    if (action === 'detail') {
      S.drawer = Number(id)
      renderDrawer()
    } else if (action === 'close') closeAll()
    else if (action === 'pause' || action === 'resume') {
      await api(`/api/${action}`, {})
      toast(action === 'pause' ? 'Pausado: nada novo começa.' : 'Retomado.')
      await refresh(true)
    } else if (action === 'cancel') {
      await api(`/api/runs/${id}/cancel`, {})
      toast(`Cancelando a #${id}: para em até 10 s, sem publicar.`)
      await refresh(true)
    } else if (action === 'rollback') {
      if (t.dataset.armed !== '1') {
        t.dataset.armed = '1'
        t.innerHTML = `${icon('undo', 15)}Confirmar: reverter e publicar`
        setTimeout(() => {
          if (t.isConnected) {
            t.dataset.armed = ''
            t.innerHTML = `${icon('undo', 15)}Desfazer`
          }
        }, 4000)
        return
      }
      await api(`/api/runs/${id}/rollback`, {})
      toast(`Desfazer da #${id} na fila.`)
      await refresh(true)
    } else if (action === 'run-modal') openModal()
    else if (action === 'run') openModal(app)
    else if (action === 'run-go') {
      const target = $('#m-app').value
      if (!target) return
      await api(`/api/apps/${target}/run`, { instructions: $('#m-instr').value })
      closeAll()
      toast(`Execução de ${target} na fila: o agente pega em segundos.`)
      await refresh(true)
    } else if (action === 'open') {
      await api('/api/open', { what, id: Number(id) || undefined, app })
    } else if (action === 'filter-app') {
      S.view = 'execucoes'
      S.app = app
      S.filter = 'all'
      render(true)
    } else if (action === 'search') {
      S.view = 'execucoes'
      render(true)
      $('#search')?.focus()
    } else if (action === 'alerts') {
      if (S.view !== 'painel') {
        S.view = 'painel'
        render(true)
      }
      $('#alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (action === 'refresh') await refresh(true)
    else if (action === 'theme') {
      setTheme(theme() === 'dark' ? 'light' : 'dark')
      renderChrome(derive())
    }
  } catch (error) {
    const msg = { busy: 'Já há uma execução na fila ou rodando.', 'nothing to run': 'Nenhuma nota aberta nesse projeto.', 'cannot roll back': 'Essa execução não pode ser desfeita.', 'not active': 'Essa execução já terminou.', 'not found': 'Não encontrei esse arquivo.' }
    toast(msg[error.message.replace(/^.*: \d+ /, '')] ?? msg[error.message] ?? `Não deu certo: ${error.message}`, true)
  }
})
document.addEventListener('input', (e) => {
  const k = e.target.dataset?.input
  if (k === 'search') {
    S.search = e.target.value
    render(true)
  } else if (k === 'app') {
    S.app = e.target.value
    render(true)
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAll()
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    S.view = 'execucoes'
    render(true)
    $('#search')?.focus()
  }
})

/* ------------------------------------------------------------------ polling */
async function loadLog() {
  try {
    logLines = (await api('/api/log')).lines
    if (S.view === 'log') {
      render(true)
      const el = $('#log')
      if (el) el.scrollTop = el.scrollHeight
    }
  } catch {
    // the next refresh tries again
  }
}

let lastRuns = 0
async function refresh(forceRuns) {
  try {
    S.agent = await api('/api/state')
  } catch {
    S.agent = { ...(S.agent ?? {}), online: false, status: { state: 'offline', error: 'O agente não respondeu: ele está ligado?' } }
  }
  const busy = !!S.agent?.current || S.data.runs.some(active)
  if (forceRuns || Date.now() - lastRuns > (busy ? 4000 : 15000)) {
    try {
      S.data = await api('/api/runs')
      lastRuns = Date.now()
    } catch {
      // keep what we had
    }
  }
  render()
}

setInterval(() => {
  const el = $('#elapsed')
  if (el) el.textContent = dur(Date.now() - Date.parse(el.dataset.since))
  const bar = $('#elapsed-bar')
  if (el && bar) bar.style.width = `${Math.min(100, ((Date.now() - Date.parse(el.dataset.since)) / Number(bar.dataset.limit)) * 100)}%`
}, 1000)

window.desktop?.setTheme(theme())
;(async function loop() {
  // The agent keeps the theme too: a new browser profile opens the same way.
  if (!params.get('theme')) api('/api/prefs')
    .then((p) => {
      if (p.theme && p.theme !== theme()) {
        setTheme(p.theme, false)
        render(true)
      } else if (!p.theme) api('/api/prefs', { theme: theme() }).catch(() => {})
    })
    .catch(() => {})
  await refresh(true)
  render(true)
  while (true) {
    await new Promise((r) => setTimeout(r, S.agent?.current ? 2000 : 5000))
    if (document.visibilityState === 'visible') {
      await refresh()
      if (S.view === 'log') loadLog()
    }
  }
})()
