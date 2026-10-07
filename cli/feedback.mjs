#!/usr/bin/env node
/**
 * A fila de feedback dos apps, pelo lado do Claude.
 *
 *   feedback list                 notas do app que não estão arquivadas
 *   feedback list 2 3 4           só essas
 *   feedback list --archived      todas, arquivadas inclusive
 *   feedback show 3               a nota, o contexto e o histórico inteiro (JSON)
 *   feedback 3 discussing "Perguntei X; aguardando decisão"
 *   feedback 3 in_progress "Começando: …"
 *   feedback 3 - "Feito o passo X"
 *   feedback 3 done "Implementado e publicado" '{"summary":"…","done":["…"],"commits":["abc1234"],"deployed":"v1.2.0"}'
 *   feedback 3 ignored "Motivo…" '{"summary":"…","ignored":["…"],"decisions":["…"]}'
 *
 *   feedback run-code | npx wrangler secret put RUN_HASH
 *                                          gera o código de execução remota (o painel pede
 *                                          uma vez por aparelho) e imprime o hash dele
 *
 *   feedback apps                           os apps cadastrados
 *   feedback apps add <id> "<nome>" [repo] [--code <arquivo>]
 *                                          cadastra um app (ou troca o código de um);
 *                                          --code mantém um código que já existe
 *
 * O app vem de `--app <id>` ou do `feedback-kit.json` ({ "app": "<id>" }) mais próximo,
 * subindo a partir da pasta atual. Status aceitos: discussing, in_progress, done,
 * ignored (ou "-" para não mudar). A resolução é mesclada por chave: ao atualizar uma
 * lista, mande a lista inteira. Arquivar é só do Matheus, pelo 👍.
 *
 * Fala com o Worker (FEEDBACK_KIT_URL, ou o de produção) usando o código de
 * administração de ~/.feedback-kit/admin-code.txt.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const HOME = join(homedir(), '.feedback-kit')
// O Worker do kit: FEEDBACK_KIT_URL, ou ~/.feedback-kit/url.txt (uma linha com a URL).
const URL_BASE = (
  process.env.FEEDBACK_KIT_URL ||
  (existsSync(join(HOME, 'url.txt')) ? readFileSync(join(HOME, 'url.txt'), 'utf8').trim() : '')
).replace(/\/+$/, '')
if (!URL_BASE) {
  console.error('Sem o endereço do Worker: ponha a URL em ~/.feedback-kit/url.txt ou em FEEDBACK_KIT_URL.')
  process.exit(1)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function adminCode() {
  // For a local Worker (`npm run dev`), whose code is a test one.
  if (process.env.FEEDBACK_KIT_ADMIN_CODE) return process.env.FEEDBACK_KIT_ADMIN_CODE
  const file = join(HOME, 'admin-code.txt')
  if (!existsSync(file)) fail(`falta o código de administração em ${file} (ver o README do feedback-kit)`)
  return readFileSync(file, 'utf8').trim()
}

async function call(method, path, payload) {
  const res = await fetch(`${URL_BASE}/v1/admin${path}`, {
    method,
    headers: { authorization: `Bearer ${adminCode()}`, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) fail(`${res.status}: ${data.error ?? 'erro'}`)
  return data
}

/** The app of this project: --app, or the nearest feedback-kit.json. */
function findApp(args) {
  const flag = args.indexOf('--app')
  if (flag >= 0) {
    const app = args[flag + 1]
    args.splice(flag, 2)
    if (!app) fail('--app precisa de um id')
    return app
  }
  for (let dir = resolve(process.cwd()); ; dir = dirname(dir)) {
    const file = join(dir, 'feedback-kit.json')
    if (existsSync(file)) {
      const { app } = JSON.parse(readFileSync(file, 'utf8'))
      if (!app) fail(`${file} não tem "app"`)
      return app
    }
    if (dirname(dir) === dir) break
  }
  fail('não sei de qual app: use --app <id> ou crie um feedback-kit.json com { "app": "<id>" }')
}

const ids = (list) => {
  const numbers = list.map(Number)
  if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) fail('ids precisam ser números inteiros')
  return numbers
}

const args = process.argv.slice(2)

if (args[0] === 'run-code') {
  // The owner's code for remote runs: kept here, its hash goes to the Worker's RUN_HASH.
  const file = join(HOME, 'run-code.txt')
  if (!existsSync(file) || args.includes('--new')) {
    mkdirSync(HOME, { recursive: true })
    writeFileSync(file, randomBytes(24).toString('base64url'))
    console.error(`Código de execução novo em ${file}`)
  } else {
    console.error(`Usando o código de ${file} (--new para trocar)`)
  }
  process.stdout.write(createHash('sha256').update(readFileSync(file, 'utf8').trim()).digest('hex'))
} else if (args[0] === 'apps') {
  if (args[1] === 'add') {
    // --code <file>: keep a code the app's devices already have, instead of a new one.
    const flag = args.indexOf('--code')
    const kept = flag >= 0 ? readFileSync(args[flag + 1], 'utf8').trim() : null
    if (flag >= 0) args.splice(flag, 2)
    const [, , id, name, repo] = args
    if (!id || !name) fail('uso: feedback apps add <id> "<nome>" [repo] [--code <arquivo>]')
    const code = kept || randomBytes(32).toString('base64url')
    await call('POST', '/apps', {
      id,
      name,
      repo: repo ?? null,
      accessHash: createHash('sha256').update(code).digest('hex'),
    })
    mkdirSync(join(HOME, 'codes'), { recursive: true })
    const file = join(HOME, 'codes', `${id}.txt`)
    writeFileSync(file, code)
    console.log(`${id} cadastrado. O código de acesso está em ${file}`)
  } else {
    const { apps } = await call('GET', '/apps')
    for (const a of apps) console.log(`${a.id} · ${a.name} · ${a.active} ativas${a.repo ? ` · ${a.repo}` : ''}`)
  }
} else {
  const app = findApp(args)
  const [first, ...rest] = args

  if (!first || first === 'list') {
    const archived = rest.includes('--archived')
    const picked = ids(rest.filter((a) => a !== '--archived'))
    const query = picked.length ? `?ids=${picked.join(',')}` : archived ? '?archived=1' : ''
    const { notes } = await call('GET', `/apps/${app}/notes${query}`)
    for (const n of notes) {
      console.log(`#${n.id} · ${n.kind} · ${n.status} · ${n.createdAt}`)
      console.log(n.body.replace(/^/gm, '  '))
      const reopened = n.log.filter((l) => l.action === 'rejected')
      if (reopened.length) console.log(`  👎 ${reopened.length}x, o último: ${reopened.at(-1).message}`)
      if (Object.keys(n.resolution).length) console.log('  resolução: ' + JSON.stringify(n.resolution))
      console.log()
    }
    if (!notes.length) console.log('Nada na fila.')
  } else if (first === 'show') {
    const [n] = ids(rest.slice(0, 1))
    const { note } = await call('GET', `/apps/${app}/notes/${n}`)
    console.log(JSON.stringify(note, null, 2))
  } else {
    const [n] = ids([first])
    const [status, message, resolution = '{}'] = rest
    if (!status || message === undefined) {
      fail(`uso: feedback <id> <status ou -> "<mensagem>" ['<resolução json>']`)
    }
    let parsed
    try {
      parsed = JSON.parse(resolution)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    } catch {
      fail('a resolução precisa ser um objeto JSON')
    }
    const { note } = await call('POST', `/apps/${app}/notes/${n}/claude`, {
      status: status === '-' ? null : status,
      message,
      resolution: parsed,
    })
    console.log(`${app} #${note.id} agora está ${note.status}.`)
  }
}
