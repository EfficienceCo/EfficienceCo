function formatarDataHora(data) {
  if (!data) {
    return '-';
  }

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(valor);
}

function IconeSucesso() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.75 10.25 9 12.5l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeErro() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m7 7 6 6M13 7l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LogCard({ log }) {
  const descricao = log?.descricao || 'Sem descrição';
  const data = formatarDataHora(log?.criado_em);
  const sucesso = Boolean(log?.sucesso);

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={
              sucesso
                ? 'inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
                : 'inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-rose-100 text-rose-700'
            }
            aria-label={sucesso ? 'Evento com sucesso' : 'Evento com erro'}
            title={sucesso ? 'Sucesso' : 'Erro'}
          >
            {sucesso ? <IconeSucesso /> : <IconeErro />}
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{descricao}</p>
            <p className="mt-1 text-xs text-zinc-500">{data}</p>
          </div>
        </div>

        <span
          className={
            sucesso
              ? 'inline-flex flex-none rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700'
              : 'inline-flex flex-none rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700'
          }
        >
          {sucesso ? 'Sucesso' : 'Erro'}
        </span>
      </div>
    </li>
  );
}
