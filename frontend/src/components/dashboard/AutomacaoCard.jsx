'use client';

import Link from 'next/link';

const STATUS_META = {
  disponivel: {
    label: 'Disponível',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
  em_desenvolvimento: {
    label: 'Em desenvolvimento',
    classes: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  planejado: {
    label: 'Planejado',
    classes: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  },
};

function obterStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.planejado;
}

export default function AutomacaoCard({ icon: Icon, nome, descricao, status, href, observacao }) {
  const meta = obterStatusMeta(status);
  const clicavel = status === 'disponivel' && Boolean(href);

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: 'var(--brand-soft)', color: 'var(--brand-soft-fg)' }}
        >
          {Icon ? <Icon className="h-[18px] w-[18px]" /> : null}
        </span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.classes}`}
        >
          {meta.label}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold text-zinc-900">{nome}</h3>
      <p className="mt-1 text-sm leading-5 text-zinc-500">{descricao}</p>

      {observacao ? <p className="mt-2 text-xs text-zinc-400">{observacao}</p> : null}

      {status === 'planejado' ? (
        <p className="mt-3 text-xs font-medium text-zinc-400">Em breve</p>
      ) : null}
    </>
  );

  if (clicavel) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300"
      >
        {conteudo}
      </Link>
    );
  }

  return (
    <div className="cursor-not-allowed rounded-xl border border-zinc-200 bg-white p-5 opacity-80 shadow-sm">
      {conteudo}
    </div>
  );
}
