-- Feedback dos apps do Matheus: comentários sobre cada app, escritos por ele,
-- trabalhados e resolvidos pelo Claude. Um banco só para todos os apps.
--
-- Herdeiro das tabelas `notes` e `note_log` do DailyFlow e do markdown-viewer, com uma
-- diferença: cada nota pertence a um app, e o número que o Matheus vê (`#12`) é
-- sequencial dentro do app, nunca reutilizado. O `id` interno é global e não aparece.

create table apps (
  id          text primary key check (id glob '[a-z0-9]*' and length(id) between 2 and 40),
  name        text not null,
  -- Base dos links de commit da resolução, ex.: https://github.com/megomes/dailyflow
  repo        text,
  -- SHA-256 em hex do código de acesso que o app manda como Bearer.
  access_hash text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table notes (
  id          integer primary key autoincrement,
  app         text    not null references apps (id),
  number      integer not null,
  body        text    not null,
  kind        text    not null default 'idea' check (kind in ('bug', 'idea', 'ux', 'question')),
  -- archived = o Matheus testou e confirmou (👍). Um 👎 reabre com comentário
  -- (note_log action 'rejected').
  status      text    not null default 'open'
              check (status in ('open', 'discussing', 'in_progress', 'done', 'ignored', 'archived')),
  stage       text,
  app_version text,
  screen      text,
  device_id   text,
  -- Escrita pelo Claude: { summary, done[], ignored[], decisions[], commits[], deployed, follow_ups[] }
  resolution  text    not null default '{}' check (json_valid(resolution)),
  -- Onde a nota foi escrita: aparelho, tela, rede, estado do app, servidor.
  context     text    not null default '{}' check (json_valid(context)),
  deleted     integer not null default 0,
  created_at  text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (app, number)
);

-- Rastreio exato: cada mudança numa nota, por quem, com detalhes (texto anterior nas
-- edições, status, resolução).
create table note_log (
  id      integer primary key autoincrement,
  note_id integer not null references notes (id),
  ts      text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor   text    not null check (actor in ('user', 'claude')),
  action  text    not null,
  message text,
  detail  text    not null default '{}' check (json_valid(detail))
);
create index note_log_note_idx on note_log (note_id, ts);

-- A entrada do Claude. Um único INSERT muda o status (opcional), mescla a resolução e
-- grava no histórico, pelos gatilhos abaixo:
--   insert into note_claude (app, number, status, message, resolution)
--   values ('dailyflow', 4, 'done', 'Implementado e publicado', '{"summary":"…","commits":["abc123"]}')
create table note_claude (
  id         integer primary key autoincrement,
  app        text    not null,
  number     integer not null,
  status     text,
  message    text,
  resolution text    not null default '{}',
  ts         text    not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- BEGIN e END em maiúsculas: o D1 remoto não reconhece o corpo do gatilho em minúsculas.
create trigger note_claude_check before insert on note_claude
BEGIN
  select raise(abort, 'note not found')
   where not exists (select 1 from notes
                      where app = new.app and number = new.number and deleted = 0);
  select raise(abort, 'invalid status')
   where new.status is not null
     and new.status not in ('open', 'discussing', 'in_progress', 'done', 'ignored');
  select raise(abort, 'resolution must be a JSON object')
   where not json_valid(new.resolution) or json_type(new.resolution) <> 'object';
END;

-- json_patch sobre '{}' descarta as chaves nulas.
create trigger note_claude_apply after insert on note_claude
BEGIN
  update notes
     set status = coalesce(new.status, status),
         resolution = json_patch(resolution, new.resolution),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   where app = new.app and number = new.number;
  insert into note_log (note_id, actor, action, message, detail)
  select id, 'claude', iif(new.status is null, 'work', 'status'), new.message,
         json_patch('{}', json_object(
           'status', new.status,
           'resolution', iif(new.resolution = '{}', null, json(new.resolution))))
    from notes where app = new.app and number = new.number;
END;
