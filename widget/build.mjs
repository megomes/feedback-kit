/**
 * Builds the widget into dist/, which the Worker serves as static assets:
 *
 *   dist/v1/widget.js   the element, Preact and the CSS in one ES module
 *   dist/index.html     a demo page: the panel for ?app=, to try themes and tokens
 *   dist/_headers       CORS (a module script from another origin needs it) and a short
 *                       cache, so a new version reaches every app within minutes
 *
 * `/v1/` is the contract: anything that would break a host (a token renamed, an
 * attribute that changes meaning) goes to `/v2/`, and v1 stays as it was.
 */
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const out = new URL('../dist/', import.meta.url)
mkdirSync(new URL('v1/', out), { recursive: true })

await build({
  entryPoints: [new URL('src/element.tsx', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
  outfile: new URL('v1/widget.js', out).pathname.replace(/^\/(\w:)/, '$1'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  define: { KIT_VERSION: JSON.stringify(version) },
  legalComments: 'none',
  logLevel: 'info',
})

writeFileSync(
  new URL('_headers', out),
  `/v1/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=300, stale-while-revalidate=86400
`,
)

copyFileSync(new URL('demo.html', import.meta.url), new URL('index.html', out))
