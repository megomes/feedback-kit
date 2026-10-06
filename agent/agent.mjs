#!/usr/bin/env node
/**
 * O agente do feedback-kit: fica ligado no PC do Matheus e executa, sem ninguém por
 * perto, o que ele pede no painel de feedback de qualquer app ("Rodar no computador").
 *
 *   node agent/agent.mjs            o laço: pergunta ao Worker por trabalho a cada ~20 s
 *   node agent/agent.mjs projects   os apps que ele achou e as pastas deles
 *   node agent/agent.mjs init       cria ~/.feedback-kit/agent.json com os padrões
 *
 * Parado, ele não gasta nada do Claude: a consulta é um HTTP ao Worker. O Claude Code só
 * roda quando há uma execução na fila, e sai ao terminar (`claude -p`).
 *
 * Uma execução 'work': na pasta do projeto, confere que não há mudança local pendente,
 * `git pull --ff-only`, roda o Claude Code headless com a skill feedback-kit sobre as notas
 * pedidas, manda o progresso ao Worker a cada poucos segundos (o painel mostra ao vivo),
 * garante o `git push` e registra commits, custo, tokens e o limite do plano.
 *
 * Uma execução 'rollback' não usa o Claude: `git revert` dos commits da execução
 * desfeita, `git push`, o `deploy` do feedback-kit.json do projeto (se houver) e as notas
 * voltam para 'open'.
 *
 * Projetos: cada pasta com um feedback-kit.json ({ "app": "<id>", "deploy"?: "<comando>" })
 * dentro das `roots` da configuração (até dois níveis), mais os `projects` escritos à mão.
 *
 * Arquivos, em ~/.feedback-kit/:
 *   agent.json         a configuração (veja DEFAULTS)
 *   agent-status.json  o estado agora, que o ícone da bandeja lê
 *   agent.paused       existe = pausado (a bandeja cria e apaga)
 *   agent.log          o que aconteceu
 *   runs/<id>.jsonl    a saída inteira do Claude Code de cada execução
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.0.0'
const HOME = join(homedir(), '.feedback-kit')
const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(KIT, 'cli', 'feedback.mjs')
const URL_BASE = (process.env.FEEDBACK_KIT_URL || 'https://feedback-kit.megomes.workers.dev').replace(/\/+$/, '')
const WINDOWS = process.platform === 'win32'

const FILES = {
  config: join(HOME, 'agent.json'),
  state: join(HOME, 'agent-state.json'),
  status: join(HOME, 'agent-status.json'),
  paused: join(HOME, 'agent.paused'),
  log: join(HOME, 'agent.log'),
  runs: join(HOME, 'runs'),
}

const DEFAULTS = {
  /** How the computer shows up in the panel. */
  name: hostname(),
  /** Folders searched (two levels deep) for projects with a feedback-kit.json. */
  roots: [join(homedir(), 'Code')],
  /** Written by hand, win over what the search finds: { "<app>": "<folder>" }. */
  projects: {},
  pollSeconds: 20,
  /** The Claude Code model (`--model`): null = the account's default. */
  model: null,
  /** `--max-budget-usd` per run: stops a run that runs away. null = no cap. */
  maxBudgetUsd: 5,
  timeoutMinutes: 45,
  /**
   * Nobody is there to approve a tool, so the default lets every tool run. "auto" is the
   * more careful choice: it blocks what looks risky, and the run may stop short.
   */
  permissionMode: 'bypassPermissions',
  /** A new run waits while the 5-hour window is at least this full (0 to 1). */
  maxFiveHour: 0.9,
  /** The command that starts Claude Code. */
  claude: 'claude',
}

/* ------------------------------------------------------------------ helpers */

mkdirSync(FILES.runs, { recursive: true })

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}`
  console.log(line)
  try {
    appendFileSync(FILES.log, line + '\n')
  } catch {
    // the log is a convenience
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function config() {
  return { ...DEFAULTS, ...readJson(FILES.config, {}) }
}

/** The agent's id survives restarts: the Worker uses it to fail a run a crash left behind. */
function state() {
  const saved = readJson(FILES.state, {})
  if (!saved.id) {
    saved.id = `agent-${randomBytes(6).toString('hex')}`
    writeFileSync(FILES.state, JSON.stringify(saved, null, 2))
  }
  return saved
}

function saveState(patch) {
  const next = { ...state(), ...patch }
  writeFileSync(FILES.state, JSON.stringify(next, null, 2))
  return next
}

function writeStatus(status) {
  try {
    writeFileSync(FILES.status, JSON.stringify({ ...status, at: new Date().toISOString(), pid: process.pid }, null, 2))
  } catch {
    // the tray just shows the previous state
  }
}

function adminCode() {
  if (process.env.FEEDBACK_KIT_ADMIN_CODE) return process.env.FEEDBACK_KIT_ADMIN_CODE
  const file = join(HOME, 'admin-code.txt')
  if (!existsSync(file)) throw new Error(`falta o código de administração em ${file}`)
  return readFileSync(file, 'utf8').trim()
}

async function call(method, path, payload) {
  const res = await fetch(`${URL_BASE}/v1/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${adminCode()}`, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error ?? ''}`.trim())
  return data
}

/** Runs a command and answers its output; throws with the output when it fails. */
function sh(cwd, command, args) {
  const out = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false, windowsHide: true })
  if (out.error) throw out.error
  if (out.status !== 0) {
    throw new Error(`${command} ${args.join(' ')}: ${(out.stderr || out.stdout || '').trim().slice(-1500)}`)
  }
  return out.stdout.trim()
}
const git = (cwd, ...args) => sh(cwd, 'git', args)

/** Kills a process and everything it started (on Windows, `claude` runs under a shell). */
function killTree(child) {
  if (!child?.pid) return
  if (WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}

/* ----------------------------------------------------------------- projects */

/** { app: { dir, deploy } } from the roots, then the hand-written ones. */
function discover(cfg) {
  const found = {}
  const look = (dir, depth) => {
    const file = join(dir, 'feedback-kit.json')
    if (existsSync(file)) {
      const { app, deploy } = readJson(file, {})
      if (typeof app === 'string' && !found[app]) found[app] = { dir, deploy: deploy || null }
      return
    }
    if (depth === 0) return
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') look(join(dir, e.name), depth - 1)
    }
  }
  for (const root of cfg.roots ?? []) look(root, 2)
  for (const [app, dir] of Object.entries(cfg.projects ?? {})) {
    const { deploy } = readJson(join(dir, 'feedback-kit.json'), {})
    found[app] = { dir, deploy: deploy || null }
  }
  return found
}

/* -------------------------------------------------------------------- usage */

/**
 * The plan's limits as Claude Code last reported them (its `rate_limit_event`). A window
 * whose reset time has passed is empty again, which is known without spending anything.
 */
function currentUsage() {
  const usage = state().usage ?? {}
  const now = Date.now() / 1000
  const window = (w) => (w && w.resetsAt && w.resetsAt < now ? { ...w, utilization: 0, reset: true } : w)
  const history = readJson(join(HOME, 'agent-history.json'), [])
  const since = (ms) =>
    history
      .filter((r) => Date.parse(r.finishedAt) > Date.now() - ms)
      .reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
  return {
    ...usage,
    fiveHour: window(usage.fiveHour),
    sevenDay: window(usage.sevenDay),
    status: usage.fiveHour?.resetsAt < now ? 'allowed' : usage.status,
    costFiveHours: Number(since(5 * 3600_000).toFixed(4)),
    costToday: Number(since(24 * 3600_000).toFixed(4)),
  }
}

function recordUsage(info) {
  const windows = info.unifiedWindows ?? {}
  saveState({
    usage: {
      status: info.status ?? null,
      fiveHour: windows.five_hour ?? null,
      sevenDay: windows.seven_day ?? null,
      overage: info.isUsingOverage ?? false,
      updatedAt: new Date().toISOString(),
    },
  })
}

function limited(cfg, usage) {
  const now = Date.now() / 1000
  const five = usage.fiveHour
  if (usage.status === 'rejected' && five?.resetsAt > now) return 'limite do plano atingido'
  if (five && five.utilization >= cfg.maxFiveHour && five.resetsAt > now) {
    return `janela de 5 h em ${Math.round(five.utilization * 100)}%`
  }
  return null
}

/* --------------------------------------------------------------------- runs */

function prompt(run, cfg) {
  const ids = run.notes.join(' ')
  const list = run.notes.map((n) => `#${n}`).join(', ')
  const cli = `node "${CLI}"`
  return `Você está rodando sozinho: execução remota #${run.id} do feedback-kit, que o Matheus disparou do celular. Ninguém vai responder perguntas, então não pergunte: decida ou registre a dúvida na nota.

Trabalhe as notas ${list} do app \`${run.app}\` com a skill feedback-kit, seguindo as regras dela e o CLAUDE.md deste projeto. O CLI da fila é \`${cli}\` (o app sai do feedback-kit.json desta pasta).

Como esta execução funciona:
1. Comece com \`${cli} list ${ids}\`; nas notas reabertas com 👎, leia a conversa inteira com \`${cli} show <n>\`.
2. Para cada nota: \`in_progress\` ao começar; implemente; verifique com o que o projeto tiver (tipos, testes, build); um commit por nota, citando \`#n\` na mensagem; então \`done\` com a resolução completa (summary, done, ignored, decisions, commits, deployed, follow_ups).
3. Nota ambígua, ou que pede uma decisão que é do Matheus (produto, dinheiro, algo destrutivo ou irreversível): não chute. Marque \`discussing\` com a pergunta exata e as opções, e siga para a próxima.
4. Nunca: force push, reescrever histórico, apagar dados de produção, mexer em segredos ou instalar coisas fora do projeto.
5. Ao terminar, \`git push\` na branch atual. Publique só como o CLAUDE.md do projeto mandar; é isso que vai em \`deployed\`.
6. Sua última mensagem é o relatório que o Matheus lê no celular: curto, em português, sem títulos, uma linha por nota ("#n: o que aconteceu"), depois a versão publicada e o que ficou pendente.
${run.instructions ? `\nO Matheus pediu também, para esta execução:\n${run.instructions}\n` : ''}`
}

/** A report to the Worker; answers the run's status there ('canceled' means stop). */
async function report(run, payload) {
  try {
    const { status } = await call('POST', `/runs/${run.id}`, payload)
    return status
  } catch (error) {
    log(`#${run.id}: não consegui relatar: ${error.message}`)
    return null
  }
}

/** Checks the folder and brings it up to date; answers the commit it starts from. */
function prepare(dir) {
  if (!existsSync(dir)) throw new Error(`A pasta ${dir} não existe neste computador.`)
  const dirty = git(dir, 'status', '--porcelain', '--untracked-files=no')
  if (dirty) {
    throw new Error(`Há mudanças não commitadas em ${dir}; não mexi em nada.\n${dirty.slice(0, 800)}`)
  }
  let upstream = true
  try {
    git(dir, 'rev-parse', '--abbrev-ref', '@{u}')
  } catch {
    upstream = false
  }
  if (upstream) git(dir, 'pull', '--ff-only')
  return { base: git(dir, 'rev-parse', 'HEAD'), upstream }
}

/** Pushes what is still local (Claude was told to, this makes sure). */
function pushIfAhead(dir, upstream) {
  if (!upstream) return 'sem upstream: nada foi enviado'
  const ahead = Number(git(dir, 'rev-list', '--count', '@{u}..HEAD'))
  if (ahead > 0) git(dir, 'push')
  return null
}

const commitsBetween = (dir, base, head) =>
  base === head ? [] : git(dir, 'rev-list', '--reverse', '--abbrev-commit', `${base}..${head}`).split('\n').filter(Boolean)

async function work(run, project, cfg) {
  const { base, upstream } = prepare(project.dir)
  const messages = [`Começando no ${cfg.name}, a partir de ${base.slice(0, 7)}.`]
  await report(run, { baseSha: base, messages })

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', cfg.permissionMode]
  if (cfg.model) args.push('--model', cfg.model)
  if (cfg.maxBudgetUsd) args.push('--max-budget-usd', String(cfg.maxBudgetUsd))

  const transcript = join(FILES.runs, `${run.id}.jsonl`)
  // The prompt goes through stdin: no shell quoting on Windows to get wrong.
  const child = spawn(cfg.claude, args, {
    cwd: project.dir,
    shell: WINDOWS,
    windowsHide: true,
    env: { ...process.env, FEEDBACK_KIT_RUN: String(run.id) },
  })
  child.stdin.end(prompt(run, cfg))

  let result = null
  let buffer = ''
  let dirty = false
  let stopped = null
  let lastReport = Date.now()
  const errors = []

  child.stdout.on('data', (chunk) => {
    appendFileSync(transcript, chunk)
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      if (event.type === 'rate_limit_event' && event.rate_limit_info) recordUsage(event.rate_limit_info)
      if (event.type === 'assistant' && !event.parent_tool_use_id) {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'text' && block.text?.trim()) {
            messages.push(block.text.trim().slice(0, 4000))
            dirty = true
          }
        }
      }
      if (event.type === 'result') result = event
    }
  })
  child.stderr.on('data', (chunk) => errors.push(String(chunk)))

  const exited = new Promise((done) => child.on('close', (code) => done(code)))
  child.on('error', (error) => errors.push(String(error)))
  const deadline = Date.now() + cfg.timeoutMinutes * 60_000

  // Live progress, and the cancel coming back the other way.
  while (true) {
    const code = await Promise.race([exited, sleep(5000).then(() => undefined)])
    if (code !== undefined) break
    if (Date.now() > deadline) {
      stopped = `Passou de ${cfg.timeoutMinutes} minutos; parei.`
      killTree(child)
      continue
    }
    // A report also keeps the computer "online" in the panel during a long run.
    if (dirty || Date.now() - lastReport > 60_000) {
      dirty = false
      lastReport = Date.now()
      const status = await report(run, { messages })
      if (status === 'canceled' && !stopped) {
        stopped = 'Cancelada pelo painel.'
        killTree(child)
      }
    }
    writeStatus({ state: 'running', run: run.id, app: run.app, usage: currentUsage() })
  }

  const head = git(project.dir, 'rev-parse', 'HEAD')
  let pushNote = null
  try {
    pushNote = pushIfAhead(project.dir, upstream)
  } catch (error) {
    pushNote = `git push falhou: ${error.message}`
  }
  const stats = result
    ? {
        costUsd: result.total_cost_usd ?? null,
        turns: result.num_turns ?? null,
        durationMs: result.duration_ms ?? null,
        inputTokens: result.usage?.input_tokens ?? null,
        outputTokens: result.usage?.output_tokens ?? null,
        cacheReadTokens: result.usage?.cache_read_input_tokens ?? null,
        cacheWriteTokens: result.usage?.cache_creation_input_tokens ?? null,
        sessionId: result.session_id ?? null,
        model: cfg.model,
      }
    : {}
  const failed = stopped || !result || result.is_error
  const error = failed
    ? [
        stopped,
        result?.is_error ? result.result || result.subtype : null,
        !result && !stopped ? errors.join('').slice(-2000) || 'O Claude Code saiu sem resultado.' : null,
      ]
        .filter(Boolean)
        .join('\n')
    : null
  if (pushNote) messages.push(pushNote)

  const history = readJson(join(HOME, 'agent-history.json'), [])
  history.push({ run: run.id, app: run.app, finishedAt: new Date().toISOString(), costUsd: stats.costUsd ?? 0 })
  writeFileSync(join(HOME, 'agent-history.json'), JSON.stringify(history.slice(-500)))

  await report(run, {
    status: failed ? 'failed' : 'done',
    headSha: head,
    commits: commitsBetween(project.dir, base, head),
    messages,
    summary: result?.result ?? null,
    error,
    stats: { ...stats, usage: currentUsage() },
  })
  log(`#${run.id} ${run.app}: ${stopped ? 'parada' : failed ? 'falhou' : 'feita'} (${stats.costUsd ?? '?'} USD)`)
}

async function rollback(run, target, project) {
  if (!target?.baseSha || !target?.headSha) throw new Error('A execução desfeita não registrou commits.')
  const { base, upstream } = prepare(project.dir)
  const messages = [`Desfazendo a execução #${target.id}: ${target.baseSha.slice(0, 7)}..${target.headSha.slice(0, 7)}.`]
  await report(run, { baseSha: base, messages })

  try {
    git(project.dir, 'merge-base', '--is-ancestor', target.headSha, 'HEAD')
  } catch {
    throw new Error(`O commit ${target.headSha.slice(0, 7)} não está na branch atual; não dá para reverter daqui.`)
  }
  try {
    git(project.dir, 'revert', '--no-edit', `${target.baseSha}..${target.headSha}`)
  } catch (error) {
    try {
      git(project.dir, 'revert', '--abort')
    } catch {
      // nothing to abort
    }
    throw new Error(
      `O revert deu conflito: algo depois da #${target.id} mexeu nos mesmos arquivos. Nada foi mudado.\n${error.message}`,
    )
  }
  const head = git(project.dir, 'rev-parse', 'HEAD')
  messages.push(`Revertido em ${commitsBetween(project.dir, base, head).length} commit(s).`)
  const pushNote = pushIfAhead(project.dir, upstream)
  if (pushNote) messages.push(pushNote)

  if (project.deploy) {
    messages.push(`Publicando: ${project.deploy}`)
    await report(run, { messages })
    const out = spawnSync(project.deploy, { cwd: project.dir, shell: true, encoding: 'utf8', windowsHide: true })
    const tail = (out.stdout + out.stderr).trim().split('\n').slice(-8).join('\n')
    if (out.status !== 0) throw new Error(`Revertido e enviado, mas o deploy falhou:\n${tail}`)
    messages.push(`Publicado.\n${tail}`)
  } else {
    messages.push('Sem "deploy" no feedback-kit.json: se o projeto publica a cada push, já está no ar.')
  }

  for (const n of target.notes) {
    try {
      await call('POST', `/apps/${run.app}/notes/${n}/claude`, {
        status: 'open',
        message: `Desfeito pela execução #${run.id} (git revert de ${target.baseSha.slice(0, 7)}..${target.headSha.slice(0, 7)}).`,
      })
    } catch (error) {
      messages.push(`Não reabri a #${n}: ${error.message}`)
    }
  }

  await report(run, {
    status: 'done',
    headSha: head,
    commits: commitsBetween(project.dir, base, head),
    messages,
    summary: `Execução #${target.id} desfeita; as notas ${target.notes.map((n) => `#${n}`).join(', ')} voltaram para abertas.`,
  })
  log(`#${run.id} ${run.app}: rollback da #${target.id} feito`)
}

/* --------------------------------------------------------------------- loop */

async function loop() {
  log(`agente ${VERSION} ligado, falando com ${URL_BASE}`)
  let failures = 0
  while (true) {
    const cfg = config()
    const projects = discover(cfg)
    const usage = currentUsage()
    const paused = existsSync(FILES.paused)
    const limit = limited(cfg, usage)
    try {
      const { run, target } = await call('POST', '/agent/poll', {
        id: state().id,
        name: cfg.name,
        apps: Object.keys(projects),
        usage: { ...usage, paused, limitedBy: limit },
        version: VERSION,
        paused: paused || !!limit,
        current: null,
      })
      failures = 0
      writeStatus({
        state: paused ? 'paused' : limit ? 'limited' : 'idle',
        limitedBy: limit,
        apps: projects,
        usage,
      })
      if (run) {
        log(`#${run.id} ${run.app}: ${run.kind} ${run.notes.map((n) => `#${n}`).join(' ')}`)
        writeStatus({ state: 'running', run: run.id, app: run.app, usage })
        const project = projects[run.app]
        try {
          if (!project) throw new Error(`Este computador não tem pasta para o app ${run.app}.`)
          if (run.kind === 'rollback') await rollback(run, target, project)
          else await work(run, project, cfg)
        } catch (error) {
          log(`#${run.id}: ${error.message}`)
          await report(run, { status: 'failed', error: error.message })
        }
        continue
      }
    } catch (error) {
      failures++
      log(`sem conexão com o Worker (${failures}x): ${error.message}`)
      writeStatus({ state: 'offline', error: error.message, apps: projects, usage })
    }
    await sleep(Math.min(cfg.pollSeconds * 1000 * Math.max(1, failures), 5 * 60_000))
  }
}

const command = process.argv[2]
if (command === 'projects') {
  const projects = discover(config())
  for (const [app, p] of Object.entries(projects)) console.log(`${app} · ${p.dir}${p.deploy ? ` · deploy: ${p.deploy}` : ''}`)
  if (!Object.keys(projects).length) console.log(`Nenhum projeto com feedback-kit.json em ${config().roots.join(', ')}.`)
} else if (command === 'init') {
  if (existsSync(FILES.config)) console.log(`${FILES.config} já existe.`)
  else {
    const { name, roots, projects, model, maxBudgetUsd, timeoutMinutes, permissionMode, maxFiveHour } = DEFAULTS
    writeFileSync(
      FILES.config,
      JSON.stringify({ name, roots, projects, model, maxBudgetUsd, timeoutMinutes, permissionMode, maxFiveHour }, null, 2),
    )
    console.log(`Criado ${FILES.config}`)
  }
} else {
  await loop()
}
