'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarNotificacoes } from '../../services/notificacoes.service';
import WidgetCard from './WidgetCard';

const LIMITE_VISUAL = 4;

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar as notificacoes.'
  );
}

function normalizarNotificacoes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.notificacoes)) {
    return payload.notificacoes;
  }

  return [];
}

function notificacaoNaoLida(notificacao) {
  if (!notificacao) {
    return false;
  }

  if (notificacao.nao_lida === true) {
    return true;
  }

  if (notificacao.lida === false || notificacao.lido === false || notificacao.read === false) {
    return true;
  }

  const status = String(notificacao.status || '').toLowerCase();
  if (status === 'nao_lida' || status === 'nao lida' || status === 'unread') {
    return true;
  }

  return false;
}

function contarNaoLidas(payload, notificacoes) {
  if (typeof payload?.nao_lidas === 'number') {
    return payload.nao_lidas;
  }

  if (typeof payload?.total_nao_lidas === 'number') {
    return payload.total_nao_lidas;
  }

  if (typeof payload?.unread === 'number') {
    return payload.unread;
  }

  return notificacoes.filter(notificacaoNaoLida).length;
}

function obterTitulo(notificacao, index) {
  return (
    notificacao?.titulo ||
    notificacao?.assunto ||
    notificacao?.mensagem ||
    notificacao?.descricao ||
    `Notificacao ${index + 1}`
  );
}

function obterData(notificacao) {
  return (
    notificacao?.criado_em ||
    notificacao?.created_at ||
    notificacao?.data ||
    notificacao?.timestamp
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
  const [payload, setPayload] = useState(null);
  const [notificacoes, setNotificacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarNotificacoes = useCallback(async () => {
    setIsLoading(true);
    setErro('');

    try {
      const data = await listarNotificacoes();
      setPayload(data);
      setNotificacoes(normalizarNotificacoes(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarNotificacoes();
  }, [carregarNotificacoes]);

  const naoLidas = useMemo(
    () => contarNaoLidas(payload, notificacoes),
    [payload, notificacoes],
  );

  return (
    <WidgetCard
      title="Notificacoes"
      description="Resumo das mensagens pendentes."
      href="/comunicacao"
      linkLabel="Abrir comunicacao"
    >
      {isLoading ? <p className="text-sm text-zinc-500">Carregando notificacoes...</p> : null}

      {!isLoading && erro ? (
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

      {!isLoading && !erro ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
              Nao lidas
            </p>
            <p className="mt-1 text-3xl font-bold leading-none text-sky-900 sm:text-4xl">
              {naoLidas}
            </p>
          </div>

          {notificacoes.length > 0 ? (
            <ul className="space-y-2">
              {notificacoes.slice(0, LIMITE_VISUAL).map((notificacao, index) => {
                const titulo = obterTitulo(notificacao, index);
                const data = formatarDataHora(obterData(notificacao));

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
