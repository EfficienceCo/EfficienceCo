'use client';

import { useMemo } from 'react';
import { obterDataNotificacao, useNotificacoes } from '../../context/NotificacoesContext';
import WidgetCard from './WidgetCard';

const LIMITE_VISUAL = 4;

function obterTitulo(notificacao, index) {
  return (
    notificacao?.titulo ||
    notificacao?.assunto ||
    notificacao?.mensagem ||
    notificacao?.descricao ||
    `Notificacao ${index + 1}`
  );
}

function formatarDataHora(data) {
  if (!data) {
    return '';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(valor);
}

export default function NotificacoesWidget() {
  const { notificacoes, naoLidas, isLoadingNotificacoes, erro, carregarNotificacoes } =
    useNotificacoes();

  const listaResumida = useMemo(
    () => notificacoes.slice(0, LIMITE_VISUAL),
    [notificacoes],
  );

  return (
    <WidgetCard
      title="Notificacoes"
      description="Resumo das mensagens pendentes."
      href="/dashboard/comunicacao"
      linkLabel="Abrir comunicacao"
    >
      {isLoadingNotificacoes ? <p className="text-sm text-zinc-500">Carregando notificacoes...</p> : null}

      {!isLoadingNotificacoes && erro ? (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{erro}</p>
          <button
            type="button"
            onClick={carregarNotificacoes}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-800"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoadingNotificacoes && !erro ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
              Nao lidas
            </p>
            <p className="mt-1 text-3xl font-bold leading-none text-sky-900 sm:text-4xl">
              {naoLidas}
            </p>
          </div>

          {listaResumida.length > 0 ? (
            <ul className="space-y-2">
              {listaResumida.map((notificacao, index) => {
                const titulo = obterTitulo(notificacao, index);
                const data = formatarDataHora(obterDataNotificacao(notificacao));

                return (
                  <li
                    key={notificacao?.id || `${titulo}-${index}`}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                  >
                    <p className="truncate text-sm font-medium text-zinc-900">{titulo}</p>
                    {data ? <p className="mt-1 text-xs text-zinc-600">{data}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600">Nenhuma notificacao recebida.</p>
          )}
        </div>
      ) : null}
    </WidgetCard>
  );
}
