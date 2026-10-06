#!/usr/bin/env node
/**
 * Brings the notes of an app's own D1 (the schema markdown-viewer had before the kit:
 * `notes` and `note_log` without an app column) into the kit, keeping the numbers: the
 * old id becomes the note's number in the app, so `#3` stays `#3`.
 *
 *   node scripts/import-d1.mjs <database-antigo> <app>
 *
 * It refuses to run if the app already has notes in the kit, so it cannot run twice.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [source, app] = process.argv.slice(2)
if (!source || !app) {
  console.error('uso: node scripts/import-d1.mjs <database-antigo> <app>')
  process.exit(1)
}

function wrangler(args) {
  const run = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8', shell: true })
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout)
    process.exit(1)
  }
  return run.stdout
}
const query = (db, sql) =>
  JSON.parse(wrangler(['d1', 'execute', db, '--remote', '--json', '--command', JSON.stringify(sql)]))[0].results

const [{ count }] = query('feedback-kit', `select count(*) as count from notes where app = '${app}'`)
if (count > 0) {
  console.error(`${app} já tem ${count} notas no kit; nada foi importado`)
  process.exit(1)
}

const notes = query(source, 'select * from notes order by id')
const log = query(source, 'select * from note_log order by id')
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`)

const lines = []
for (const n of notes) {
  lines.push(
    `insert into notes (app, number, body, kind, status, stage, app_version, screen, device_id, resolution, context, deleted, created_at, updated_at) values (${[
      q(app), n.id, q(n.body), q(n.kind), q(n.status), q(n.stage), q(n.app_version), q(n.screen),
      q(n.device_id), q(n.resolution), q(n.context), n.deleted, q(n.created_at), q(n.updated_at),
    ].join(', ')});`,
  )
}
for (const l of log) {
  lines.push(
    `insert into note_log (note_id, ts, actor, action, message, detail) select id, ${[
      q(l.ts), q(l.actor), q(l.action), q(l.message), q(l.detail),
    ].join(', ')} from notes where app = ${q(app)} and number = ${l.note_id};`,
  )
}

const file = join(mkdtempSync(join(tmpdir(), 'feedback-kit-')), 'import.sql')
writeFileSync(file, lines.join('\n') + '\n')
wrangler(['d1', 'execute', 'feedback-kit', '--remote', '--file', JSON.stringify(file)])
const [after] = query(
  'feedback-kit',
  `select count(*) as notes, (select count(*) from note_log l join notes n on n.id = l.note_id where n.app = '${app}') as log from notes where app = '${app}'`,
)
console.log(`${app}: ${after.notes} notas e ${after.log} entradas de histórico importadas (de ${notes.length} e ${log.length})`)
