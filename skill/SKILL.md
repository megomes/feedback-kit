---
name: feedback-kit
description: A fila de feedback dos apps do Matheus (feedback-kit). Use quando ele pedir para ler, discutir, fazer ou entregar notas de feedback ("faz os ids 2, 3 e 5", "olha o feedback", "o que tem na fila"), em qualquer projeto que tenha um feedback-kit.json, e ao integrar o painel de feedback num app novo.
---

# Fila de feedback (feedback-kit)

O Matheus escreve comentários sobre cada app num painel de feedback dentro do próprio
app (`<feedback-panel>`). Cada nota tem número sequencial **por app** (`#1`, `#2`…, nunca
reutilizado). Quando ele pedir "faz os ids 2, 3, 4 e 5", é dessa fila, do app do projeto
atual. Tudo fica num banco só, o D1 `feedback-kit` da Cloudflare, atrás do Worker
`https://feedback-kit.megomes.workers.dev`.

O kit está clonado em `~/Code/feedback-kit` (repositório privado `megomes/feedback-kit`).
**Antes de começar, atualize:** `git -C ~/Code/feedback-kit pull --ff-only`.

## O CLI

O app sai do `feedback-kit.json` na raiz do projeto (`{ "app": "<id>" }`), ou de
`--app <id>`.

```bash
node ~/Code/feedback-kit/cli/feedback.mjs list            # o que não está arquivado
node ~/Code/feedback-kit/cli/feedback.mjs list 2 3 4      # só essas
node ~/Code/feedback-kit/cli/feedback.mjs show 3          # nota, contexto e histórico (JSON)
```

Atualizar, sempre por aqui (muda o status, mescla a resolução e grava no histórico numa
operação só):

```bash
F=~/Code/feedback-kit/cli/feedback.mjs
node $F 3 discussing "Perguntei X; aguardando decisão"
node $F 3 in_progress "Começando: …"
node $F 3 - "Feito o passo X"                      # progresso sem mudar status
node $F 3 done "Implementado e publicado" '{"summary":"…","done":["…"],"ignored":["…"],"decisions":["…"],"follow_ups":["…"],"commits":["<sha>"],"deployed":"v1.2.0"}'
node $F 3 ignored "Motivo…" '{"summary":"…","ignored":["…"],"decisions":["…"]}'
```

## Regras

- **Estados:** `open` (o Matheus pode editar e excluir) → `discussing` → `in_progress` →
  `done` | `ignored` → ele testa: 👍 = `archived` (log `confirmed`); 👎 = volta para
  `open` com um comentário (log `rejected`, texto em `message`).
- O texto da nota (`body`) é do Matheus: nunca altere. **Nunca arquive:** só o 👍 dele
  arquiva, e o CLI nem aceita.
- **A conversa fica embaixo da nota:** o painel mostra cada 👎 com o texto dele e um
  divisor para cada entrega (`done` ou `ignored`), em ordem. A mensagem de cada entrega
  precisa se sustentar sozinha.
- **Nota reaberta com 👎:** leia a conversa inteira no `show` (todas as entradas
  `rejected` do `log`), não só o último comentário. Ao entregar de novo, mande a lista
  `done` completa (a anterior mais o que mudou) e diga na mensagem o que foi corrigido em
  resposta ao comentário.
- **A resolução é mesclada por chave:** ao atualizar uma lista, mande a lista inteira.
- **Seja exato:** o que foi feito, o que ficou de fora e por quê, decisões tomadas,
  commits (sha curto) e em que versão saiu. É isso que o Matheus lê no app.
- **Contexto para debug:** `context` guarda onde a nota foi escrita: `device` (kind,
  os, browser, surface `tauri`|`electron`|`android-webview`|`pwa`|`browser`, layout,
  toque, memória), `screen` (viewport, dpr, tema), `network`, `locale`, `app` (o que o
  próprio app informa: versão, etapa, tela de origem, sync…), `page.path`, `server`
  (user agent, país, cidade e colo da Cloudflare) e `queuedOffline`. Edições e
  reaberturas guardam o mesmo em `log[].detail.context`.
- **Ordem do trabalho:** `in_progress` ao começar; commit; publicar como o projeto manda
  (o CLAUDE.md dele diz como); só então `done`, com os commits e a versão em `deployed`.
- **Versão:** se o projeto tem versão de produto, suba-a na entrega (minor para notas ou
  funcionalidades novas, patch para correção pequena de algo já entregue), registre-a no
  `deployed` e diga ao Matheus qual versão saiu. Sem isso a entrega não está completa.
- Mudanças relevantes de escopo também vão para a spec do projeto.

## Execução remota (sem ninguém por perto)

Quando a variável `FEEDBACK_KIT_RUN` existe, você foi chamado pelo agente do PC
(`agent/`), a pedido do Matheus pelo painel, e ninguém vai ler perguntas até o fim. Não
pergunte nem espere confirmação: decida o que é técnico; o que é decisão dele (produto,
dinheiro, destrutivo) vai para `discussing` com a pergunta e as opções, e você segue. A
última mensagem é o relatório que ele lê no celular. O agente cuida de `git pull`, do
`git push` final, do registro dos commits e do desfazer; por isso nada de `git reset`,
`--amend` ou rebase: errou, faça um commit novo.

## Integrar o painel num app novo

1. Cadastrar o app (gera o código de acesso em `~/.feedback-kit/codes/<id>.txt`):
   `node ~/Code/feedback-kit/cli/feedback.mjs apps add <id> "<Nome>" https://github.com/megomes/<repo>`
2. Criar `feedback-kit.json` na raiz do projeto: `{ "app": "<id>" }` (com
   `"deploy": "<comando>"` se publicar não é automático no push: o desfazer remoto usa).
3. Carregar o script e pôr o elemento onde o painel deve aparecer (veja o README do kit
   para React, Next e Tauri):

   ```html
   <script type="module" src="https://feedback-kit.megomes.workers.dev/v1/widget.js"></script>
   <feedback-panel app="<id>" screen="<tela>" closable></feedback-panel>
   ```

4. Passar o estado do app: `panel.appContext = () => ({ version, stage, sync })`.
5. Mapear os tokens do app nos `--fb-*` (cores, raio, fonte) num seletor
   `feedback-panel { … }`, para o painel parecer parte do app.
6. No CLAUDE.md do projeto, uma seção curta: "Feedback: feedback-kit, app `<id>`; use a
   skill feedback-kit".
