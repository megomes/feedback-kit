#!/usr/bin/env node
/**
 * Installs the feedback-kit skill for Claude Code, for every project of this user.
 *
 * What goes into ~/.claude/skills/feedback-kit/ is a pointer, not a copy: the same
 * name and description, and a body that sends Claude to pull the kit and read
 * skill/SKILL.md from the repository. So the rules live in one place, and a change to
 * them reaches every project with the next pull, without installing again.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url))
const kit = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '')
const front = /^---\n[\s\S]*?\n---\n/.exec(readFileSync(source, 'utf8').replace(/\r\n/g, '\n'))
if (!front) throw new Error('skill/SKILL.md has no front matter')

const target = join(homedir(), '.claude', 'skills', 'feedback-kit')
mkdirSync(target, { recursive: true })
writeFileSync(
  join(target, 'SKILL.md'),
  `${front[0]}
# Fila de feedback (feedback-kit)

As regras ficam no repositório do kit, para valerem iguais em todos os projetos.
Antes de qualquer coisa:

1. \`git -C "${kit.replaceAll('\\', '/')}" pull --ff-only\`
2. Leia \`${source.replaceAll('\\', '/')}\` inteiro e siga.
`,
)
console.log(`skill instalada em ${target} (aponta para ${source})`)
