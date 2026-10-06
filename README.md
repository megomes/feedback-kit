# feedback-kit

O feedback de todos os apps do Matheus, num lugar só: ele escreve comentários dentro de
cada app, o Claude trabalha neles e registra exatamente o que fez, e ele confirma com 👍 ou
reabre com 👎. Nasceu da tela Notes do DailyFlow e da tela Feedback do markdown-viewer, que
eram cópias uma da outra e já tinham divergido.

Três peças, e cada uma se atualiza num lugar só:

| Peça | O que é | Como chega aos apps |
| --- | --- | --- |
| **Worker + D1** (`worker/`, `migrations/`) | A API e o banco, para todos os apps | `npm run deploy` |
| **Widget** (`widget/`) | O `<feedback-panel>`, um Web Component | Os apps carregam `/v1/widget.js` do Worker ao abrir: o deploy chega a todos em até 5 minutos, sem rebuild |
| **Skill + CLI** (`skill/`, `cli/`) | As regras da fila e a ferramenta do Claude | `git pull` aqui; a skill instalada só aponta para este repositório |

Produção: `https://feedback-kit.megomes.workers.dev` (a raiz é uma página de demonstração).

## Usar num app

```html
<script type="module" src="https://feedback-kit.megomes.workers.dev/v1/widget.js"></script>
<feedback-panel app="dailyflow" screen="today" lang="pt" closable></feedback-panel>
```

| Atributo | |
| --- | --- |
| `app` | o id do app no kit (obrigatório) |
| `screen` | de onde o painel foi aberto; vai com cada nota (nunca um caminho de arquivo) |
| `lang` | `pt` ou `en` (padrão: o do navegador) |
| `theme` | `light` ou `dark` (padrão: o do sistema). Quem mapeia os próprios tokens pode omitir |
| `closable` | mostra o X e fecha no Esc; o app escuta `feedback-close` |
| `api` | outro Worker (desenvolvimento local); por padrão, o de onde o script veio |

| Propriedade | |
| --- | --- |
| `appContext` | objeto, ou função que devolve um: o estado do app (versão, etapa, sync…), gravado em `context.app` |
| `accessCode` | um código que o app já tem, para não pedir à pessoa |

| Evento | |
| --- | --- |
| `feedback-close` | a pessoa fechou o painel |
| `feedback-link` | `detail.url`, cancelável: `preventDefault()` para abrir o link você mesmo (o Tauri manda para o navegador do sistema) |

### React

```tsx
useEffect(() => {
  void import(/* @vite-ignore */ 'https://feedback-kit.megomes.workers.dev/v1/widget.js')
}, [])

<feedback-panel ref={ref} app="dailyflow" closable />
// ref.current.appContext = () => ({ version, stage })
// ref.current.addEventListener('feedback-close', onClose)
```

O tipo do elemento para o TSX: `declare module 'react' { namespace JSX { interface IntrinsicElements { 'feedback-panel': any } } }`.

## Design: tokens e partes

O painel desenha dentro de um shadow DOM: o CSS do app não entra e o dele não sai. A
aparência se ajusta por **tokens**, variáveis CSS que atravessam essa barreira. Todos têm
um valor padrão (claro e escuro); o app mapeia os seus por cima:

```css
feedback-panel {
  --fb-bg: var(--bg-content);
  --fb-surface: var(--surface-1);
  --fb-border: var(--border-default);
  --fb-text: var(--text-primary);
  --fb-focus: var(--accent);
  --fb-radius-lg: var(--radius-lg);
  --fb-font: var(--font-ui);
}
```

Tokens: `--fb-bg`, `--fb-surface`, `--fb-surface-hover`, `--fb-surface-active`,
`--fb-input`, `--fb-border`, `--fb-border-subtle`, `--fb-border-strong`, `--fb-text`,
`--fb-text-secondary`, `--fb-text-muted`, `--fb-focus`, `--fb-primary-bg`,
`--fb-primary-text`, `--fb-danger`, `--fb-positive`, `--fb-warning`, `--fb-claude`, os
tons `--fb-blue`, `--fb-purple`, `--fb-cyan`, `--fb-yellow`, `--fb-red`, `--fb-teal`,
`--fb-gray`, `--fb-radius-sm|md|lg`, `--fb-font`, `--fb-font-mono`, `--fb-font-size`,
`--fb-max-width` e `--fb-padding`.

Para ajustes finos, as partes: `page`, `card`, `note`, `composer`, `resolution`, `pill`,
`chip`, `input`, `button`, `button-primary`, `filters`
(`feedback-panel::part(card) { … }`).

**O contrato é o `/v1/`.** Mudar o nome ou o sentido de um token, atributo, evento ou
parte quebra apps: isso vai para `/v2/widget.js`, e o v1 continua como estava.

## A fila, pelo Claude

```bash
npm run install-skill        # uma vez por máquina: a skill do Claude Code
node cli/feedback.mjs apps   # os apps cadastrados
```

O resto (ler, atualizar, entregar) está em [skill/SKILL.md](skill/SKILL.md).

## Códigos

- **Administração:** o CLI manda o código de `~/.feedback-kit/admin-code.txt`; o Worker
  guarda só o SHA-256, no secret `ADMIN_HASH`.
- **Por app:** `node cli/feedback.mjs apps add <id> "<Nome>" [repo]` gera um código novo,
  grava em `~/.feedback-kit/codes/<id>.txt` e guarda o hash no banco. Ele é colado uma vez
  em cada aparelho, no próprio painel (ou o app passa em `accessCode`).

Trocar o código de administração:

```bash
node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))' > ~/.feedback-kit/admin-code.txt
node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1],"utf8")).digest("hex"))' ~/.feedback-kit/admin-code.txt | npx wrangler secret put ADMIN_HASH
```

## Desenvolver

```bash
npm run verify    # tipos, testes do Worker (a migração real no SQLite do Node) e build
npm run dev       # Worker local em http://localhost:8787 com D1 local
```

Local: `.dev.vars` com `ADMIN_HASH=<sha-256>` (fora do git) e
`npx wrangler d1 migrations apply feedback-kit --local`. O CLI aponta para ele com
`FEEDBACK_KIT_URL=http://localhost:8787 FEEDBACK_KIT_ADMIN_CODE=<código>`, e o painel com o
atributo `api`.

**Nos gatilhos do D1, `BEGIN` e `END` vão em maiúsculas.** O D1 remoto não reconhece o
corpo do gatilho escrito em minúsculas.

## Publicar

```bash
npm run deploy
```

Compila o widget, aplica as migrações pendentes e publica o Worker. Suba `version` no
`package.json` a cada mudança no widget: ela vai em `context.kit.version` de cada nota.
