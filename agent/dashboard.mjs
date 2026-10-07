/**
 * O painel do agente no PC: um servidor HTTP local (só 127.0.0.1) que serve
 * agent/dashboard/ e uma API pequena para ele.
 *
 *   GET  /api/state                o agente agora: estado, execução ao vivo, limite, projetos
 *   GET  /api/runs                 as execuções de todos os apps (do Worker; a última cópia
 *                                  boa se ele não responder) e os apps com notas abertas
 *   GET  /api/log                  o fim do agent.log
 *   GET  /api/prefs | POST /api/prefs  { theme }: o que o painel guarda (o tema)
 *   POST /api/pause | /api/resume
 *   POST /api/runs/:id/cancel | /api/runs/:id/rollback
 *   POST /api/apps/:app/run        { instructions? }: roda as notas abertas do app
 *   POST /api/open                 { what: log | config | runs | transcript | folder, id?, app? }
 *
 * Só responde a pedidos do próprio painel: o POST exige o cabeçalho x-feedback-kit e a
 * origem local, então uma página qualquer aberta no navegador não consegue mandar nada.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATIC = join(dirname(fileURLToPath(import.meta.url)), 'dashboard')
const ICONS = join(dirname(fileURLToPath(import.meta.url)), 'icons')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

/** Opens a file, folder or URL with what the system uses for it. */
export function openWith(target, app) {
  if (process.platform === 'win32') {
    const args = app ? ['/c', 'start', '""', app, `"${target}"`] : ['/c', 'start', '""', `"${target}"`]
    spawn('cmd', args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref()
  } else {
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { detached: true, stdio: 'ignore' }).unref()
  }
}

/**
 * The panel in its own window: the Electron one (agent/window.cjs, no Windows title bar)
 * when it is installed, else Edge in app mode on Windows, else the browser.
 */
export function openWindow(url) {
  const electron = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
  if (existsSync(electron)) {
    spawn(electron, [join(dirname(fileURLToPath(import.meta.url)), 'window.cjs')], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '""', 'msedge', `--app=${url}`, '--window-size=1480,980'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true,
    }).unref()
  } else openWith(url)
}

/**
 * Starts the server. `agent` is what the agent shares: { state(), call(), files, kitHome,
 * projects(), transcript(id) }.
 */
export function startDashboard(port, agent, log) {
  let cache = { runs: [], agents: [], apps: [], at: null, stale: true }
  const cacheFile = join(agent.kitHome, 'dashboard-cache.json')
  const prefsFile = join(agent.kitHome, 'dashboard.json')
  try {
    cache = { ...JSON.parse(readFileSync(cacheFile, 'utf8')), stale: true }
  } catch {
    // first time: nothing cached yet
  }
  let fetching = null

  async function runs() {
    if (cache.at && Date.now() - Date.parse(cache.at) < 3000 && !cache.stale) return cache
    fetching ??= (async () => {
      try {
        const [list, apps] = await Promise.all([agent.call('GET', '/runs?limit=300'), agent.call('GET', '/apps')])
        cache = { runs: list.runs, agents: list.agents, apps: apps.apps, at: new Date().toISOString(), stale: false }
        writeFileSync(cacheFile, JSON.stringify(cache))
      } catch (error) {
        cache = { ...cache, stale: true, error: error.message }
      } finally {
        fetching = null
      }
      return cache
    })()
    return fetching
  }

  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
  }

  const readBody = (req) =>
    new Promise((done) => {
      let data = ''
      req.on('data', (chunk) => {
        data += chunk
        if (data.length > 20_000) req.destroy()
      })
      req.on('end', () => {
        try {
          done(data ? JSON.parse(data) : {})
        } catch {
          done({})
        }
      })
    })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const path = url.pathname
    try {
      if (req.method === 'GET' && path === '/api/state') return send(res, 200, agent.state())
      if (req.method === 'GET' && path === '/api/runs') return send(res, 200, await runs())
      if (req.method === 'GET' && path === '/api/prefs') {
        return send(res, 200, existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, 'utf8')) : {})
      }
      if (req.method === 'GET' && path === '/api/log') {
        const text = existsSync(agent.files.log) ? readFileSync(agent.files.log, 'utf8') : ''
        return send(res, 200, { lines: text.trimEnd().split('\n').slice(-300) })
      }

      if (req.method === 'POST' && path.startsWith('/api/')) {
        const origin = req.headers.origin
        const local = !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
        if (req.headers['x-feedback-kit'] !== '1' || !local) return send(res, 403, { error: 'forbidden' })
        const input = await readBody(req)

        if (path === '/api/prefs') {
          const prefs = existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, 'utf8')) : {}
          if (input.theme === 'light' || input.theme === 'dark') prefs.theme = input.theme
          writeFileSync(prefsFile, JSON.stringify(prefs, null, 2))
          return send(res, 200, prefs)
        }
        if (path === '/api/pause') {
          writeFileSync(agent.files.paused, new Date().toISOString())
          return send(res, 200, { ok: true })
        }
        if (path === '/api/resume') {
          if (existsSync(agent.files.paused)) rmSync(agent.files.paused)
          return send(res, 200, { ok: true })
        }
        const action = path.match(/^\/api\/runs\/(\d+)\/(cancel|rollback)$/)
        if (action) {
          const out = await agent.call('POST', `/runs/${action[1]}/${action[2]}`).catch((e) => ({ error: e.message }))
          cache.stale = true
          return send(res, out.error ? 409 : 200, out)
        }
        const start = path.match(/^\/api\/apps\/([a-z0-9-]+)\/run$/)
        if (start) {
          const payload = typeof input.instructions === 'string' && input.instructions.trim() ? { instructions: input.instructions.trim() } : {}
          const out = await agent.call('POST', `/apps/${start[1]}/runs`, payload).catch((e) => ({ error: e.message }))
          cache.stale = true
          return send(res, out.error ? 409 : 200, out)
        }
        if (path === '/api/open') {
          const projects = agent.projects()
          const target =
            input.what === 'log'
              ? agent.files.log
              : input.what === 'config'
                ? agent.files.config
                : input.what === 'runs'
                  ? agent.files.runs
                  : input.what === 'transcript'
                    ? agent.transcript(Number(input.id))
                    : input.what === 'folder'
                      ? projects[input.app]?.dir
                      : null
          if (!target || !existsSync(target)) return send(res, 404, { error: 'not found' })
          if (input.what === 'log' || input.what === 'config' || input.what === 'transcript') openWith(target, 'notepad')
          else openWith(target)
          return send(res, 200, { ok: true })
        }
        return send(res, 404, { error: 'not found' })
      }

      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
      // Static: the page, its files and the icons.
      const file =
        path === '/'
          ? join(STATIC, 'index.html')
          : path.startsWith('/icons/')
            ? join(ICONS, normalize(path.slice(7)).replace(/^(\.\.[/\\])+/, ''))
            : join(STATIC, normalize(path).replace(/^(\.\.[/\\])+/, ''))
      if (!file.startsWith(STATIC) && !file.startsWith(ICONS)) return send(res, 404, 'not found', 'text/plain')
      if (!existsSync(file)) return send(res, 404, 'not found', 'text/plain')
      return send(res, 200, readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream')
    } catch (error) {
      return send(res, 500, { error: error.message })
    }
  })

  server.on('error', (error) => log(`painel: não abri a porta ${port} (${error.code ?? error.message})`))
  server.listen(port, '127.0.0.1', () => log(`painel em http://127.0.0.1:${port}`))
  return server
}
