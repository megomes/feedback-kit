#!/usr/bin/env node
/**
 * Os ícones do agente, desenhados aqui em SVG e gerados em agent/icons/:
 *
 *   app.svg / app.ico          o do menu Iniciar e da janela do painel (o azul do design)
 *   app-192.png, app-512.png   os do manifesto do painel
 *   tray-<estado>.ico          os da bandeja: o balão em branco (barra escura) e em
 *   tray-<estado>-dark.ico     grafite (barra clara), com um ponto de cor por estado
 *
 * Os arquivos gerados vão no repositório: o PC só precisa do PowerShell para usá-los.
 *
 *   node scripts/build-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'agent', 'icons')
mkdirSync(OUT, { recursive: true })

/** A four-point spark centered on (cx, cy): the plump kind, not a thin star. */
function spark(cx, cy, r, k = 0.27) {
  const c = r * k
  return [
    `M ${cx} ${cy - r}`,
    `C ${cx + c} ${cy - c} ${cx + c} ${cy - c} ${cx + r} ${cy}`,
    `C ${cx + c} ${cy + c} ${cx + c} ${cy + c} ${cx} ${cy + r}`,
    `C ${cx - c} ${cy + c} ${cx - c} ${cy + c} ${cx - r} ${cy}`,
    `C ${cx - c} ${cy - c} ${cx - c} ${cy - c} ${cx} ${cy - r}`,
    'Z',
  ].join(' ')
}

/**
 * The speech bubble as one outline: the bottom-left corner becomes the tail. The tail
 * leaves the bottom edge flat (same tangent) and comes back into the left edge vertical,
 * so nothing kinks where it joins the body.
 */
function bubble(x, y, w, h, r, tail) {
  const b = y + h
  const start = x + r + tail * 0.55 // where the tail leaves the bottom edge
  const tipX = x - tail * 0.12
  const tipY = b + tail * 0.78
  const back = b - r * 0.35 // where it rejoins the left edge
  return [
    `M ${x + r} ${y}`,
    `H ${x + w - r}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V ${b - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${b}`,
    `H ${start}`,
    `C ${start - tail * 0.5} ${b} ${tipX + tail * 0.42} ${tipY - tail * 0.12} ${tipX} ${tipY}`,
    `C ${x + tail * 0.06} ${tipY - tail * 0.32} ${x} ${back + r * 0.42} ${x} ${back}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ')
}

const APP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7FA8FF"/>
      <stop offset="0.55" stop-color="#4C7BF2"/>
      <stop offset="1" stop-color="#2448C8"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.22" cy="0.12" r="0.75">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6E96FF"/>
      <stop offset="1" stop-color="#2347C9"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#0F2A7A" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="256" height="256" rx="64" fill="url(#bg)"/>
  <rect width="256" height="256" rx="64" fill="url(#glow)"/>
  <rect x="3" y="3" width="250" height="250" rx="61" fill="none" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="2"/>
  <path d="${bubble(52, 60, 152, 122, 38, 38)}" fill="#FFFFFF" filter="url(#lift)"/>
  <path d="${spark(128, 121, 41)}" fill="url(#ink)"/>
  <path d="${spark(186, 54, 16, 0.3)}" fill="#FFFFFF" opacity="0.95"/>
</svg>`

const STATES = {
  idle: null,
  running: '#6FA0FF',
  paused: '#F5B83D',
  limited: '#FF7A45',
  offline: '#9AA0AA',
}

/** The tray glyph: the bubble with the spark cut out, and a status dot cut into its corner. */
function tray(color, dot) {
  const cut = dot ? `<circle cx="200" cy="200" r="64" fill="#000"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
      <rect width="256" height="256" fill="#fff"/>
      <path d="${spark(124, 108, 56, 0.3)}" fill="#000"/>
      ${cut}
    </mask>
  </defs>
  <path d="${bubble(12, 22, 224, 172, 56, 56)}" fill="${color}" mask="url(#m)"/>
  ${dot ? `<circle cx="200" cy="200" r="46" fill="${dot}"/>` : ''}
</svg>`
}

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

/** RGBA pixels of the SVG at a size, for the BMP frames. */
function rgba(svg, size) {
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render()
  return { width: image.width, height: image.height, pixels: image.pixels }
}

/**
 * A .ico: classic 32-bit BMP frames up to 64 px (what the tray and old APIs read best),
 * a PNG frame at 128 and 256.
 */
function ico(svg, sizes) {
  const frames = sizes.map((size) => {
    if (size >= 128) return { size, data: png(svg, size) }
    const { width, height, pixels } = rgba(svg, size)
    const maskRow = Math.ceil(width / 32) * 4
    const data = Buffer.alloc(40 + width * height * 4 + maskRow * height)
    data.writeUInt32LE(40, 0)
    data.writeInt32LE(width, 4)
    data.writeInt32LE(height * 2, 8) // color + mask
    data.writeUInt16LE(1, 12)
    data.writeUInt16LE(32, 14)
    data.writeUInt32LE(width * height * 4, 20)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = ((height - 1 - y) * width + x) * 4 // bottom-up
        const to = 40 + (y * width + x) * 4
        data[to] = pixels[from + 2]
        data[to + 1] = pixels[from + 1]
        data[to + 2] = pixels[from]
        data[to + 3] = pixels[from + 3]
      }
    }
    return { size, data } // the AND mask stays zero: alpha does the work
  })
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ size, data }, i) => {
    const at = 6 + i * 16
    header[at] = size >= 256 ? 0 : size
    header[at + 1] = size >= 256 ? 0 : size
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(data.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...frames.map((f) => f.data)])
}

writeFileSync(join(OUT, 'app.svg'), APP)
writeFileSync(join(OUT, 'app.ico'), ico(APP, [16, 20, 24, 32, 40, 48, 64, 128, 256]))
writeFileSync(join(OUT, 'app-192.png'), png(APP, 192))
writeFileSync(join(OUT, 'app-512.png'), png(APP, 512))
for (const [state, dot] of Object.entries(STATES)) {
  writeFileSync(join(OUT, `tray-${state}.ico`), ico(tray('#FFFFFF', dot), [16, 20, 24, 32, 40, 48]))
  writeFileSync(join(OUT, `tray-${state}-dark.ico`), ico(tray('#1A2236', dot), [16, 20, 24, 32, 40, 48]))
}
writeFileSync(join(OUT, 'tray.svg'), tray('#FFFFFF', null))
console.log(`Ícones em ${OUT}`)
