/**
 * <feedback-panel>: the feedback of any app, as one element.
 *
 *   <script type="module" src="https://feedback-kit.megomes.workers.dev/v1/widget.js"></script>
 *   <feedback-panel app="dailyflow" screen="today" lang="en" theme="dark" closable></feedback-panel>
 *
 * Attributes
 *   app       the app's id in the kit (required)
 *   screen    where the panel was opened from, recorded with each note (never a path)
 *   lang      pt | en (default: the browser's)
 *   theme     light | dark (default: the system's); a host that maps its own tokens
 *             onto --fb-* gets its theme for free and may leave this out
 *   closable  shows the close button and closes on Escape; the host hears `feedback-close`
 *   api       the kit's Worker, when not the one the script came from (local development)
 *
 * Properties
 *   appContext  object, or function returning one: the host's own state (version, stage,
 *               sync…), stored under `context.app` of every note
 *   accessCode  a code the host already holds, so the person is never asked for one
 *
 * Events
 *   feedback-close  the person closed the panel
 *   feedback-link   { detail: { url } }, cancelable: preventDefault() to open it yourself
 *                   (a desktop shell sends it to the system browser)
 */

import { render } from 'preact'
import { Panel, type PanelConfig } from './Panel'
import { pickLang } from './i18n'
import css from './styles.css'

declare const KIT_VERSION: string

/** The Worker the script was served from: the API lives there too. */
const ORIGIN = (() => {
  try {
    return new URL(import.meta.url).origin
  } catch {
    return ''
  }
})()

type AppContext = Record<string, unknown> | (() => Record<string, unknown>)

class FeedbackPanel extends HTMLElement {
  static observedAttributes = ['app', 'screen', 'lang', 'closable', 'api']

  #root: ShadowRoot
  #mount: HTMLDivElement
  #appContext: AppContext = {}
  #accessCode: string | null = null
  #onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !this.hasAttribute('closable')) return
    // Escape inside a text box belongs to that box (cancel an edit), not to the panel.
    const inField = event
      .composedPath()
      .some((node) => node instanceof HTMLElement && /^(TEXTAREA|INPUT)$/.test(node.tagName))
    if (inField) return
    this.#close()
  }

  constructor() {
    super()
    this.#root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = css
    this.#mount = document.createElement('div')
    this.#root.append(style, this.#mount)
  }

  get appContext(): AppContext {
    return this.#appContext
  }
  set appContext(value: AppContext) {
    this.#appContext = value ?? {}
  }

  get accessCode(): string | null {
    return this.#accessCode
  }
  set accessCode(value: string | null) {
    this.#accessCode = value || null
    this.#render()
  }

  connectedCallback() {
    window.addEventListener('keydown', this.#onKeyDown)
    this.#render()
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.#onKeyDown)
    render(null, this.#mount)
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render()
  }

  #close() {
    this.dispatchEvent(new CustomEvent('feedback-close', { bubbles: true, composed: true }))
  }

  #link(url: string) {
    const event = new CustomEvent('feedback-link', {
      detail: { url },
      bubbles: true,
      composed: true,
      cancelable: true,
    })
    if (this.dispatchEvent(event)) window.open(url, '_blank', 'noopener')
  }

  #render() {
    const app = this.getAttribute('app')
    if (!app) {
      // Rendered by Preact too, so it goes away when the attribute arrives.
      render(<p class="hint">&lt;feedback-panel&gt; needs an app attribute.</p>, this.#mount)
      return
    }
    const cfg: PanelConfig = {
      app,
      api: (this.getAttribute('api') || ORIGIN).replace(/\/+$/, ''),
      screen: this.getAttribute('screen') ?? '',
      lang: pickLang(this.getAttribute('lang')),
      closable: this.hasAttribute('closable'),
      kitVersion: KIT_VERSION,
      appContext: () => {
        const own = this.#appContext
        return typeof own === 'function' ? own() : own
      },
      accessCode: this.#accessCode,
      onClose: () => this.#close(),
      onLink: (url) => this.#link(url),
    }
    // Keyed by app and API, so switching either starts the panel over.
    render(<Panel key={`${cfg.app}@${cfg.api}`} cfg={cfg} />, this.#mount)
  }
}

if (!customElements.get('feedback-panel')) customElements.define('feedback-panel', FeedbackPanel)

export { FeedbackPanel }
