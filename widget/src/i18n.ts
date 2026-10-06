/** The texts of the panel, in the two languages the apps use. */

export type Kind = 'bug' | 'idea' | 'ux' | 'question'
export type Status = 'open' | 'discussing' | 'in_progress' | 'done' | 'ignored' | 'archived'
export type Filter = 'all' | 'open' | 'in_progress' | 'done' | 'ignored'
export type Lang = 'pt' | 'en'

const apple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const pt = {
  title: 'Feedback',
  subtitle:
    'Comentários sobre o app. Cada um ganha um número; o Claude trabalha neles e registra exatamente o que foi feito.',
  placeholder: 'O que deveria mudar, o que incomodou, o que está faltando…',
  add: 'Adicionar',
  kinds: { bug: 'Bug', idea: 'Ideia', ux: 'UX', question: 'Pergunta' } as Record<Kind, string>,
  status: {
    open: 'Aberta',
    discussing: 'Em discussão',
    in_progress: 'Em andamento',
    done: 'Feita',
    ignored: 'Ignorada',
    archived: 'Confirmada',
  } as Record<Status, string>,
  verify: 'Testou?',
  works: 'Funciona',
  notYet: 'Ainda não',
  worksHint: 'Confirma e arquiva a nota',
  notYetHint: 'Reabre a nota com o seu comentário',
  rejectPlaceholder: 'O que ainda está errado ou faltando?',
  rejectSend: 'Reabrir com comentário',
  archived: (n: number) => `Arquivadas · ${n}`,
  backToActive: 'Voltar para as ativas',
  archivedTitle: 'Confirmadas e arquivadas',
  thread: {
    rejected: 'Ainda não',
    delivered: 'Claude entregou',
    ignored: 'Claude decidiu não fazer',
  },
  filters: {
    all: 'Todas',
    open: 'Abertas',
    in_progress: 'Em andamento',
    done: 'Feitas',
    ignored: 'Ignoradas',
  } as Record<Filter, string>,
  filterLabel: 'Filtro',
  kindLabel: 'Tipo',
  edit: 'Editar',
  save: 'Salvar',
  cancel: 'Cancelar',
  delete: 'Excluir',
  confirmDelete: 'Confirmar exclusão',
  pending: 'Aguardando conexão',
  offline: 'Offline: as notas novas ficam neste aparelho e sobem quando a conexão voltar.',
  locked: 'Esta nota não está mais aberta, então não pode ser editada. Reabra primeiro.',
  empty: 'Nada aqui ainda.',
  loadError: 'Não deu para carregar as notas. Confira a conexão.',
  history: (n: number) => `Histórico · ${n}`,
  resolution: {
    summary: 'O que foi feito',
    done: 'Feito',
    ignored: 'Decidido não fazer',
    decisions: 'Decisões',
    follow_ups: 'Próximos passos',
    deployed: 'Publicado',
  },
  actors: { user: 'Você', claude: 'Claude' },
  actions: {
    created: 'criou',
    edited: 'editou',
    deleted: 'excluiu',
    reopened: 'reabriu',
    confirmed: 'confirmou que funciona 👍',
    rejected: 'disse que ainda não está pronto 👎',
    status: 'mudou o status',
    work: 'trabalhou nela',
  } as Record<string, string>,
  from: 'de',
  shortcut: (): string => (apple() ? '⌘↵ para adicionar' : 'Ctrl+↵ para adicionar'),
  close: 'Fechar',
  codeTitle: 'Código de acesso',
  codeHint: (app: string) =>
    `Cole o código deste app (fica em ~/.feedback-kit/codes/${app}.txt). Ele fica guardado neste aparelho.`,
  codeSave: 'Guardar',
  codeWrong: 'Esse código não foi aceito. Confira e tente de novo.',
  debug: 'Info de debug',
  locale: 'pt-BR',
}

const en: typeof pt = {
  title: 'Feedback',
  subtitle:
    'Comments about the app. Each one gets a number; Claude works on them and records exactly what was done.',
  placeholder: 'What should change, what bothered you, what is missing…',
  add: 'Add',
  kinds: { bug: 'Bug', idea: 'Idea', ux: 'UX', question: 'Question' },
  status: {
    open: 'Open',
    discussing: 'Discussing',
    in_progress: 'In progress',
    done: 'Done',
    ignored: 'Ignored',
    archived: 'Confirmed',
  },
  verify: 'Tested it?',
  works: 'Works',
  notYet: 'Not yet',
  worksHint: 'Confirms and archives the note',
  notYetHint: 'Reopens the note with your comment',
  rejectPlaceholder: 'What is still wrong or missing?',
  rejectSend: 'Reopen with comment',
  archived: (n) => `Archived · ${n}`,
  backToActive: 'Back to active',
  archivedTitle: 'Confirmed and archived',
  thread: {
    rejected: 'Not yet',
    delivered: 'Claude delivered',
    ignored: 'Claude decided not to do it',
  },
  filters: { all: 'All', open: 'Open', in_progress: 'In progress', done: 'Done', ignored: 'Ignored' },
  filterLabel: 'Filter',
  kindLabel: 'Kind',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  confirmDelete: 'Confirm delete',
  pending: 'Waiting for connection',
  offline: 'Offline: new notes stay on this device and go up when the connection is back.',
  locked: 'This note is no longer open, so it cannot be edited. Reopen it first.',
  empty: 'Nothing here yet.',
  loadError: 'Could not load the notes. Check the connection.',
  history: (n) => `History · ${n}`,
  resolution: {
    summary: 'What was done',
    done: 'Done',
    ignored: 'Decided not to do',
    decisions: 'Decisions',
    follow_ups: 'Follow-ups',
    deployed: 'Deployed',
  },
  actors: { user: 'You', claude: 'Claude' },
  actions: {
    created: 'created',
    edited: 'edited',
    deleted: 'deleted',
    reopened: 'reopened',
    confirmed: 'confirmed it works 👍',
    rejected: 'said it is not there yet 👎',
    status: 'changed the status',
    work: 'worked on it',
  },
  from: 'from',
  shortcut: () => (apple() ? '⌘↵ to add' : 'Ctrl+↵ to add'),
  close: 'Close',
  codeTitle: 'Access code',
  codeHint: (app) =>
    `Paste this app's code (it is in ~/.feedback-kit/codes/${app}.txt). It stays on this device.`,
  codeSave: 'Save',
  codeWrong: 'That code was not accepted. Check it and try again.',
  debug: 'Debug info',
  locale: 'en-US',
}

export type Messages = typeof pt
export const MESSAGES: Record<Lang, Messages> = { pt, en }

export function pickLang(attr: string | null): Lang {
  const value = (attr || navigator.language || 'en').toLowerCase()
  return value.startsWith('pt') ? 'pt' : 'en'
}
