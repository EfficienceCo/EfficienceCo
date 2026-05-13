'use client';

import { useCallback, useEffect, useState } from 'react';
import { listarEventos } from '../../services/eventos.service';
import WidgetCard from './WidgetCard';

const LIMITE_EVENTOS = 5;

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar os eventos do agente.'
  );
}

function normalizarEventos(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.eventos)) {
    return payload.eventos;
  }

  return [];
}

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

function IconeFalha() {
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

function eventoSucesso(evento) {
  return Boolean(evento?.sucesso);
}

function eventoDescricao(evento) {
  return evento?.descricao || evento?.mensagem || 'Evento sem descricao';
}

export default function AgenteEventosWidget() {
  const [eventos, setEventos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarEventos = useCallback(async () => {
    setIsLoading(true);
    setErro('');

    try {
      const data = await listarEventos({ limit: LIMITE_EVENTOS });
      setEventos(normalizarEventos(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarEventos();
  }, [carregarEventos]);

  return (
    <WidgetCard
      title="Agente"
      description="Ultimos eventos executados pelo agente."
      href="/dashboard/logs"
      linkLabel="Ver todos os logs"
    >
      {isLoading ? <p className="text-sm text-zinc-500">Carregando eventos...</p> : null}

      {!isLoading && erro ? (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{erro}</p>
          <button
            type="button"
            onClick={carregarEventos}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-800"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !erro && eventos.length === 0 ? (
        <p className="text-sm text-zinc-600">Nenhum evento recente encontrado.</p>
      ) : null}

      {!isLoading && !erro && eventos.length > 0 ? (
        <ul className="space-y-2">
          {eventos.slice(0, LIMITE_EVENTOS).map((evento, index) => {
            const sucesso = eventoSucesso(evento);

            return (
              <li
                key={evento?.id || `${evento?.criado_em || 'evento'}-${index}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={
                        sucesso
                          ? 'inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700'
                          : 'inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-rose-100 text-rose-700'
                      }
                      aria-label={sucesso ? 'Evento com sucesso' : 'Evento com falha'}
                    >
                      {sucesso ? <IconeSucesso /> : <IconeFalha />}
                    </span>

                    <p className="truncate text-sm font-medium text-zinc-900">
                      {eventoDescricao(evento)}
                    </p>
                  </div>

                  <span
                    className={
                      sucesso
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
                        : 'rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700'
                    }
                  >
                    {sucesso ? 'Sucesso' : 'Falha'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{formatarDataHora(evento?.criado_em)}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </WidgetCard>
  );
}
