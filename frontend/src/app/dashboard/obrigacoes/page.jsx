'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { listarProximasObrigacoes } from '../../../services/obrigacoes.service';

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar as obrigacoes.'
  );
}

function normalizarObrigacoes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.obrigacoes)) {
    return payload.obrigacoes;
  }

  return [];
}

function formatarData(data) {
  if (!data) {
    return '-';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function tituloObrigacao(obrigacao, index) {
  return (
    obrigacao?.titulo ||
    obrigacao?.nome ||
    obrigacao?.descricao ||
    obrigacao?.tipo ||
    `Obrigacao ${index + 1}`
  );
}

function vencimentoObrigacao(obrigacao) {
  return (
    obrigacao?.vencimento ||
    obrigacao?.data_vencimento ||
    obrigacao?.prazo ||
    obrigacao?.data
  );
}

export default function ObrigacoesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [obrigacoes, setObrigacoes] = useState([]);
  const [isLoadingObrigacoes, setIsLoadingObrigacoes] = useState(true);
  const [erro, setErro] = useState('');

  const carregarObrigacoes = useCallback(async () => {
    setIsLoadingObrigacoes(true);
    setErro('');

    try {
      const data = await listarProximasObrigacoes({ dias: 30 });
      setObrigacoes(normalizarObrigacoes(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoadingObrigacoes(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarObrigacoes();
    }
  }, [carregarObrigacoes, isAuthenticated, isLoading]);

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
          <h1 className="text-2xl font-semibold text-zinc-900">Obrigacoes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Lista de vencimentos esperados nos proximos 30 dias.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarObrigacoes}
          disabled={isLoadingObrigacoes}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingObrigacoes ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {!erro && isLoadingObrigacoes ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando obrigacoes...</p>
        </section>
      ) : null}

      {!erro && !isLoadingObrigacoes && obrigacoes.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhuma obrigacao encontrada.</p>
        </section>
      ) : null}

      {!erro && !isLoadingObrigacoes && obrigacoes.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Obrigacao</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {obrigacoes.map((obrigacao, index) => (
                <tr
                  key={obrigacao?.id || `${tituloObrigacao(obrigacao, index)}-${index}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {tituloObrigacao(obrigacao, index)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarData(vencimentoObrigacao(obrigacao))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {obrigacao?.status || obrigacao?.situacao || '-'}
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
