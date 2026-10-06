/**
 * Snapshot of the environment a note was written in, for debugging: device, surface
 * (desktop shell, Android WebView, PWA or browser), layout, screen, network, and what
 * the app itself says about its state. Every field is best-effort; unsupported APIs
 * are simply omitted.
 *
 * Port of `clientContext` from DailyFlow and markdown-viewer, without anything that
 * belongs to one app: the app's own part (version, stage, sync…) comes from the host,
 * through the element's `appContext`.
 */

export type Surface = 'tauri' | 'electron' | 'android-webview' | 'ios-webview' | 'pwa' | 'browser'

export interface ClientContext {
  device: {
    kind: 'phone' | 'tablet' | 'desktop'
    os: string
    browser: string
    surface: Surface
    layout: 'mobile' | 'desktop'
    touchPoints: number
    pointer: 'coarse' | 'fine'
    memoryGb?: number
    cores?: number
  }
  screen: {
    viewport: string
    screen: string
    dpr: number
    orientation?: string
    theme: string
    reducedMotion: boolean
  }
  network: {
    online: boolean
    type?: string
    downlinkMbps?: number
    rttMs?: number
    saveData?: boolean
  }
  locale: { language: string; timezone: string; localTime: string }
  app: Record<string, unknown> & { from: string; version?: string; stage?: string }
  page: { path: string }
  kit: { version: string }
  deviceId: string
  userAgent: string
}

const DEVICE_KEY = 'feedback-kit.device-id'

/** One id per install, kept in this origin's storage. */
export function deviceId(): string {
  try {
    const known = localStorage.getItem(DEVICE_KEY)
    if (known) return known
    const made = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, made)
    return made
  } catch {
    return 'unknown'
  }
}

function deviceKind(): 'phone' | 'tablet' | 'desktop' {
  const w = Math.min(window.screen.width, window.innerWidth || window.screen.width)
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  if (coarse && w < 700) return 'phone'
  if (coarse) return 'tablet'
  return 'desktop'
}

function os(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X/.test(ua)) return navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'unknown'
}

function browser(ua: string): string {
  const pick = (name: string, re: RegExp) => {
    const m = ua.match(re)
    return m ? `${name} ${m[1]}` : null
  }
  return (
    pick('Edge', /Edg\/(\d+)/) ??
    pick('Samsung Internet', /SamsungBrowser\/(\d+)/) ??
    pick('Firefox', /(?:Firefox|FxiOS)\/(\d+)/) ??
    pick('Chrome', /(?:Chrome|CriOS)\/(\d+)/) ??
    pick('Safari', /Version\/(\d+(?:\.\d+)?).*Safari/) ??
    pick('WebKit', /AppleWebKit\/(\d+)/) ??
    'unknown'
  )
}

export function surface(): Surface {
  const w = window as unknown as Record<string, unknown>
  const ua = navigator.userAgent
  if ('__TAURI_INTERNALS__' in w || '__TAURI__' in w) return 'tauri'
  if (/Electron\//.test(ua)) return 'electron'
  if (/; wv\)/.test(ua) || 'ReactNativeWebView' in w) return 'android-webview'
  if (/(iPhone|iPad).*AppleWebKit(?!.*Safari)/.test(ua)) return 'ios-webview'
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'pwa'
  return 'browser'
}

export async function collectContext(
  from: string,
  app: Record<string, unknown>,
  kitVersion: string,
): Promise<ClientContext> {
  const ua = navigator.userAgent
  const mm = (q: string) => window.matchMedia(q).matches
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
    deviceMemory?: number
  }
  const conn = nav.connection
  let storageMb: number | undefined
  try {
    const est = await navigator.storage?.estimate?.()
    if (typeof est?.usage === 'number') storageMb = Math.round((est.usage / 1024 / 1024) * 10) / 10
  } catch {
    // unsupported
  }
  const root = document.documentElement
  const theme =
    root.dataset.theme ??
    (root.classList.contains('dark') ? 'dark' : mm('(prefers-color-scheme: dark)') ? 'dark' : 'light')

  return {
    device: {
      kind: deviceKind(),
      os: os(ua),
      browser: browser(ua),
      surface: surface(),
      layout: mm('(max-width: 820px)') ? 'mobile' : 'desktop',
      touchPoints: navigator.maxTouchPoints ?? 0,
      pointer: mm('(pointer: coarse)') ? 'coarse' : 'fine',
      memoryGb: nav.deviceMemory,
      cores: navigator.hardwareConcurrency,
    },
    screen: {
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      screen: `${window.screen.width}×${window.screen.height}`,
      dpr: window.devicePixelRatio,
      orientation: window.screen.orientation?.type,
      theme,
      reducedMotion: mm('(prefers-reduced-motion: reduce)'),
    },
    network: {
      online: navigator.onLine,
      type: conn?.effectiveType,
      downlinkMbps: conn?.downlink,
      rttMs: conn?.rtt,
      saveData: conn?.saveData,
    },
    locale: {
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      localTime: new Date().toString().slice(0, 33),
    },
    app: { ...app, storageMb, from: from || 'direct' },
    // The route only, never the query or the hash, which may carry personal data.
    page: { path: location.pathname },
    kit: { version: kitVersion },
    deviceId: deviceId(),
    userAgent: ua,
  }
}

const SURFACE_LABEL: Record<string, Record<string, string>> = {
  pt: {
    tauri: 'App desktop',
    'desktop-tauri': 'App desktop',
    electron: 'App desktop',
    'android-webview': 'App Android',
    'ios-webview': 'App iOS',
    pwa: 'App instalado',
    browser: 'Navegador',
  },
  en: {
    tauri: 'Desktop app',
    'desktop-tauri': 'Desktop app',
    electron: 'Desktop app',
    'android-webview': 'Android app',
    'ios-webview': 'iOS app',
    pwa: 'Installed app',
    browser: 'Browser',
  },
}

/** One-line human summary: "Desktop · Windows · Edge 141 · App desktop · 1440×900 · 4g · dark". */
export function summarizeContext(
  c: Partial<ClientContext> | null | undefined,
  lang: 'pt' | 'en',
): string {
  if (!c?.device) return ''
  const kinds: Record<string, Record<string, string>> = {
    pt: { phone: 'Celular', tablet: 'Tablet', desktop: 'Desktop' },
    en: { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' },
  }
  return [
    kinds[lang]![c.device.kind] ?? c.device.kind,
    c.device.os,
    c.device.browser,
    SURFACE_LABEL[lang]![c.device.surface] ?? c.device.surface,
    c.device.layout === 'mobile' && c.device.kind === 'desktop'
      ? lang === 'pt'
        ? 'layout de celular'
        : 'mobile layout'
      : null,
    c.screen?.viewport,
    c.network ? (c.network.online ? (c.network.type ?? 'online') : 'offline') : null,
    c.screen?.theme,
  ]
    .filter(Boolean)
    .join(' · ')
}
