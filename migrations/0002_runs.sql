-- Execuções remotas: o Matheus aperta "Rodar no computador" no painel (de onde estiver), o
-- agente no PC dele (agent/) pega a execução, roda o Claude Code headless na pasta do
-- projeto e devolve aqui o que aconteceu. Um desfazer é outra execução, do tipo
-- 'rollback', que aponta para a que ele desfaz.
--
-- Estados: queued → running → done | failed; queued → canceled. Uma execução que o
-- agente pegou e parou de relatar vira failed pelo próprio agente ao reiniciar.

create table runs (
  id            integer primary key autoincrement,
  app           text    not null references apps (id),
  kind          text    not null default 'work' check (kind in ('work', 'rollback')),
  -- Os números das notas, em JSON: [2, 3, 5]. Vazio numa execução 'work' = todas as abertas.
  notes         text    not null default '[]' check (json_valid(notes)),
  -- Instrução extra do Matheus para esta execução (opcional).
  instructions  text,
  -- Só em 'rollback': a execução desfeita.
  target_run    integer references runs (id),
  status        text    not null default 'queued'
                check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  agent         text,
  -- Onde o repositório estava antes e depois: o desfazer usa base_sha..head_sha.
  base_sha      text,
  head_sha      text,
  commits       text    not null default '[]' check (json_valid(commits)),
  -- O que o Claude disse, em ordem (cada texto do assistente), e o resumo final.
  messages      text    not null default '[]' check (json_valid(messages)),
  summary       text,
  error         text,
  -- { costUsd, turns, durationMs, inputTokens, outputTokens, cacheReadTokens, sessionId, model }
  stats         text    not null default '{}' check (json_valid(stats)),
  -- Se esta execução foi desfeita: o id do rollback que a desfez.
  rolled_back_by integer,
  created_at    text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at    text,
  finished_at   text,
  updated_at    text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index runs_app_idx on runs (app, id);
create index runs_queue_idx on runs (status, id);

-- O agente se apresenta a cada consulta: assim o painel sabe se o computador está ligado,
-- quais apps ele atende e como está o limite do Claude (janela de 5 horas e semanal).
create table agents (
  id         text primary key,
  name       text not null,
  -- Os apps que ele tem pasta, em JSON: ["dailyflow", "markdown-viewer"].
  apps       text not null default '[]' check (json_valid(apps)),
  -- { fiveHour: { utilization, resetsAt }, sevenDay: {…}, status, paused, … }
  usage      text not null default '{}' check (json_valid(usage)),
  version    text,
  last_seen  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
