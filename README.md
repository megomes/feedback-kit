# feedback-kit

O feedback de todos os apps do Matheus, num lugar só: ele escreve comentários dentro de
cada app, o Claude trabalha neles e registra exatamente o que fez, e ele confirma com 👍 ou
reabre com 👎. Nasceu da tela Notes do DailyFlow e da tela Feedback do markdown-viewer, que
eram cópias uma da outra e já tinham divergido.

Quatro peças, e cada uma se atualiza num lugar só:

| Peça | O que é | Como chega aos apps |
| --- | --- | --- |
| **Worker + D1** (`worker/`, `migrations/`) | A API e o banco, para todos os apps | `npm run deploy` |
| **Widget** (`widget/`) | O `<feedback-panel>`, um Web Component | Os apps carregam `/v1/widget.js` do Worker ao abrir: o deploy chega a todos em até 5 minutos, sem rebuild |
| **Skill + CLI** (`skill/`, `cli/`) | As regras da fila e a ferramenta do Claude | `git pull` aqui; a skill instalada só aponta para este repositório |
| **Agente** (`agent/`) | Roda no PC: executa no Claude Code o que o painel pede, de qualquer lugar | `git pull` aqui; o ícone da bandeja religa o agente |

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

## Rodar no computador, do celular

O painel tem um botão **Rodar N notas**: ele põe as notas abertas numa fila no Worker, o
agente no PC (ligado com o Windows, no ícone da bandeja) pega, roda o Claude Code headless
na pasta do projeto e devolve tudo ao painel enquanto trabalha: o que o Claude vai
dizendo, o relatório final, os commits, o custo e os tokens. As notas mudam de status
pelo caminho, como sempre. Cada execução pode ser **cancelada** e, depois de terminada,
**desfeita** (`git revert` dos commits dela, push, o `deploy` do projeto e as notas de
volta para abertas, sem a entrega antiga; isso roda sem o Claude, não gasta nada).

**Qual Claude.** Bugs vão no Sonnet, ideias, UX e perguntas no Opus, os dois em esforço
médio (`models` na configuração do agente). Uma execução com os dois tipos roda duas
sessões seguidas, bugs primeiro.

**Cancelar não publica.** Uma execução cancelada (ou que passou do tempo) não faz mais
push: os commits que ela ainda não tinha enviado ficam só no PC, na branch
`feedback-kit/parada-<id>`, as mudanças soltas vão para o `git stash`, e as notas que
estavam no meio voltam para abertas. O que o Claude já tinha enviado antes do cancelar
continua no ar e pode ser desfeito como qualquer execução.

```
celular ── POST /runs ──▶ Worker (D1: runs, agents) ◀── consulta a cada 20 s ── agente no PC
   ▲                                                                              │
   └──────── o painel lê o progresso a cada 4 s ◀── relatórios ── claude -p ◀─────┘
```

**Parado, não gasta nada do Claude.** A consulta do agente é um HTTP ao Worker (cerca de
4 mil por dia, longe do limite gratuito). O Claude Code só abre quando há execução, e fecha
ao terminar. No plano Pro/Max, uma execução consome a janela de 5 horas como uma sessão
normal; o custo que aparece (`≈ US$`) é o equivalente na API, para comparar execuções.
Com chave de API, é o que de fato se paga.

**O limite do Claude.** O Claude Code informa o uso das janelas de 5 horas e semanal a
cada execução; o agente guarda e o painel mostra (com quando cada uma volta). Acima de
`maxFiveHour` (90%), o agente não começa execução nova: ela espera na fila até a janela
virar.

**Sem ninguém por perto.** O prompt da execução diz ao Claude para não perguntar: nota
ambígua ou que pede decisão do Matheus vai para `discussing` com a pergunta, e ele segue
para a próxima. O agente só começa com a pasta limpa (`git status` sem mudanças), faz
`git pull --ff-only` antes e garante o `git push` depois.

### Ligar (uma vez)

1. No Worker, o código de execução (o painel pede uma vez por aparelho; é o mesmo para
   todos os apps):

   ```bash
   node cli/feedback.mjs run-code | npx wrangler secret put RUN_HASH
   npm run deploy      # aplica a migração 0002 e publica o painel novo
   ```

2. No PC com Windows (Node 22+, Git, Claude Code instalado e logado, e o
   `~/.feedback-kit/admin-code.txt`):

   ```powershell
   git clone https://github.com/megomes/feedback-kit $HOME\Code\feedback-kit
   cd $HOME\Code\feedback-kit; npm ci
   powershell -ExecutionPolicy Bypass -File agent\install-windows.ps1
   ```

   Ele instala a skill, cria `~/.feedback-kit/agent.json`, lista os projetos que achou, põe
   o atalho em Inicializar e liga o ícone.

3. No celular, no painel de qualquer app: **Rodar no computador…** e cole o conteúdo de
   `~/.feedback-kit/run-code.txt`.

Em macOS ou Linux, o mesmo agente roda com `npm run agent` (sem o ícone; ponha num
launchd/systemd ou num `pm2`).

### Projetos e configuração

O agente acha os projetos sozinho: toda pasta com `feedback-kit.json` dentro das `roots`
(até dois níveis). O comando de publicar usado pelo desfazer vai no mesmo arquivo:

```json
{ "app": "dailyflow", "deploy": "npm run deploy" }
```

`~/.feedback-kit/agent.json`:

| Chave | Padrão | |
| --- | --- | --- |
| `name` | o nome do PC | como ele aparece no painel |
| `roots` | `["~/Code"]` | onde procurar projetos |
| `projects` | `{}` | `{ "<app>": "<pasta>" }`, à mão, vence a busca |
| `models` | bug: `sonnet`/`medium`; o resto: `opus`/`medium` | `--model` e `--effort` por tipo de nota (`bug`, `idea`, `ux`, `question`; `default` para os não listados). Notas de modelos diferentes na mesma execução viram sessões em sequência, bugs primeiro |
| `maxBudgetUsd` | `5` | `--max-budget-usd` por execução: corta uma execução que dispara |
| `timeoutMinutes` | `45` | depois disso, para |
| `permissionMode` | `bypassPermissions` | ninguém aprova ferramentas; `auto` é mais cuidadoso e pode parar no meio |
| `maxFiveHour` | `0.9` | não começa execução nova com a janela de 5 h acima disso |

`node agent/agent.mjs projects` lista o que ele achou. Cada execução guarda a saída inteira
do Claude Code em `~/.feedback-kit/runs/<id>.jsonl`, e o log fica em
`~/.feedback-kit/agent.log` (o ícone abre os dois).

**Segurança.** O código do app só escreve notas; rodar, cancelar e desfazer pedem também o
código de execução. Mesmo assim, o texto das notas vira instrução para um Claude com
permissão total no PC: só cadastre num app quem você deixaria mexer no código.

## Códigos

- **Administração:** o CLI manda o código de `~/.feedback-kit/admin-code.txt`; o Worker
  guarda só o SHA-256, no secret `ADMIN_HASH`.
- **Execução remota:** `~/.feedback-kit/run-code.txt`; o Worker guarda o SHA-256 no
  secret `RUN_HASH` (sem ele, o botão nem aparece). Trocar:
  `node cli/feedback.mjs run-code --new | npx wrangler secret put RUN_HASH`.
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
