/**
 * A janela do painel do PC, como a do VS Code: sem a barra de título do Windows. O topo
 * do próprio painel é a barra (arrasta a janela), e o Windows só desenha os botões de
 * minimizar, maximizar e fechar por cima, na cor do topo e do tema.
 *
 *   node_modules\electron\dist\electron.exe agent\window.cjs
 *
 * O agente (agent.mjs) serve a página; se ele ainda está ligando, a janela tenta de novo.
 * Lembra tamanho e posição em ~/.feedback-kit/window.json e abre uma vez só.
 */
const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

const HOME = join(homedir(), '.feedback-kit')
const WINDOW_FILE = join(HOME, 'window.json')
const BAR = 52 // the height of the panel's top bar in this window

const read = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
const port = read(join(HOME, 'agent.json'), {}).dashboardPort || 47820
const URL = `http://127.0.0.1:${port}/?desktop=1`

/** The overlay buttons take the top bar's colors. */
const COLORS = {
  light: { color: '#f6f6f7', symbolColor: '#16151c', height: BAR },
  dark: { color: '#0f1523', symbolColor: '#e9edf6', height: BAR },
}

app.setName('feedback-kit')
app.setAppUserModelId('feedback-kit.agent')
if (!app.requestSingleInstanceLock()) app.quit()

let win = null

function create() {
  const saved = read(WINDOW_FILE, {})
  const prefs = read(join(HOME, 'dashboard.json'), {})
  const theme = prefs.theme ?? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
  win = new BrowserWindow({
    width: saved.width ?? 1480,
    height: saved.height ?? 980,
    x: saved.x,
    y: saved.y,
    minWidth: 960,
    minHeight: 620,
    title: 'feedback-kit',
    icon: join(__dirname, 'icons', 'app.ico'),
    backgroundColor: COLORS[theme].color,
    titleBarStyle: 'hidden',
    titleBarOverlay: COLORS[theme],
    show: false,
    webPreferences: { preload: join(__dirname, 'window-preload.cjs'), contextIsolation: true, sandbox: true },
  })
  if (saved.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // The agent may still be starting (the Start menu shortcut starts both): try again.
  let tries = 0
  const load = () => win.loadURL(URL).catch(() => {})
  win.webContents.on('did-fail-load', (_e, code) => {
    if (code === -3) return // aborted by a newer load
    if (tries++ < 60) setTimeout(load, 1000)
  })
  load()

  // Links to other sites go to the browser, not into this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  const remember = () => {
    if (!win || win.isMinimized()) return
    const maximized = win.isMaximized()
    const bounds = maximized ? read(WINDOW_FILE, {}) : win.getBounds()
    try {
      writeFileSync(WINDOW_FILE, JSON.stringify({ ...bounds, maximized }))
    } catch {
      // next time it opens at the default size
    }
  }
  win.on('resize', remember)
  win.on('move', remember)
  win.on('closed', () => (win = null))
}

ipcMain.on('theme', (_e, theme) => {
  if (win && COLORS[theme]) {
    win.setTitleBarOverlay(COLORS[theme])
    win.setBackgroundColor(COLORS[theme].color)
  }
})

app.on('second-instance', () => {
  if (!win) return create()
  if (win.isMinimized()) win.restore()
  win.focus()
})
app.whenReady().then(create)
app.on('window-all-closed', () => app.quit())
