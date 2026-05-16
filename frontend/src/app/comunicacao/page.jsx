'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { listarNotificacoes } from '../../services/notificacoes.service';

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

function tituloNotificacao(notificacao, index) {
  return (
    notificacao?.titulo ||
    notificacao?.assunto ||
    notificacao?.mensagem ||
    notificacao?.descricao ||
    `Notificacao ${index + 1}`
  );
}

function dataNotificacao(notificacao) {
  return (
    notificacao?.criado_em ||
    notificacao?.created_at ||
    notificacao?.data ||
    notificacao?.timestamp
  );
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
    timeStyle: 'short',
  }).format(valor);
}

export default function ComunicacaoPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [payload, setPayload] = useState(null);
  const [notificacoes, setNotificacoes] = useState([]);
  const [isLoadingNotificacoes, setIsLoadingNotificacoes] = useState(true);
  const [erro, setErro] = useState('');

  const carregarNotificacoes = useCallback(async () => {
    setIsLoadingNotificacoes(true);
    setErro('');

    try {
      const data = await listarNotificacoes();
      setPayload(data);
      setNotificacoes(normalizarNotificacoes(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoadingNotificacoes(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarNotificacoes();
    }
  }, [carregarNotificacoes, isAuthenticated, isLoading]);

  const naoLidas = useMemo(
    () => contarNaoLidas(payload, notificacoes),
    [payload, notificacoes],
  );

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Comunicacao</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Central de notificacoes recebidas pelo cliente.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarNotificacoes}
          disabled={isLoadingNotificacoes}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingNotificacoes ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Nao lidas</p>
        <p className="mt-2 text-4xl font-bold leading-none text-sky-900">{naoLidas}</p>
      </section>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {!erro && isLoadingNotificacoes ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando notificacoes...</p>
        </section>
      ) : null}

      {!erro && !isLoadingNotificacoes && notificacoes.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhuma notificacao encontrada.</p>
        </section>
      ) : null}

      {!erro && !isLoadingNotificacoes && notificacoes.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Titulo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {notificacoes.map((notificacao, index) => (
                <tr key={notificacao?.id || `${tituloNotificacao(notificacao, index)}-${index}`}>
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {tituloNotificacao(notificacao, index)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        notificacaoNaoLida(notificacao)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {notificacaoNaoLida(notificacao) ? 'Nao lida' : 'Lida'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarDataHora(dataNotificacao(notificacao))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
