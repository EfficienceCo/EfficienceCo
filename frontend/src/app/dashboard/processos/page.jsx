'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { listarProcessosEmAndamento } from '../../../services/processos.service';

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar os processos.'
  );
}

function normalizarProcessos(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.processos)) {
    return payload.processos;
  }

  return [];
}

function extrairPrazo(processo) {
  return (
    processo?.prazo ||
    processo?.data_limite ||
    processo?.vencimento ||
    processo?.deadline
  );
}

function processoAtrasado(processo) {
  if (!processo) {
    return false;
  }

  if (processo.atrasado === true || processo.em_atraso === true) {
    return true;
  }

  const status = String(processo.status || processo.situacao || '').toLowerCase();
  if (status.includes('atras')) {
    return true;
  }

  const prazo = extrairPrazo(processo);
  if (!prazo) {
    return false;
  }

  const prazoDate = new Date(prazo);
  if (Number.isNaN(prazoDate.getTime())) {
    return false;
  }

  return prazoDate.getTime() < Date.now();
}

function tituloProcesso(processo, index) {
  return processo?.titulo || processo?.nome || processo?.descricao || `Processo ${index + 1}`;
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

function calcularTotalEmAndamento(payload, processos) {
  if (typeof payload?.total_em_andamento === 'number') {
    return payload.total_em_andamento;
  }

  if (typeof payload?.total === 'number') {
    return payload.total;
  }

  if (typeof payload?.count === 'number') {
    return payload.count;
  }

  return processos.length;
}

function calcularAtrasados(payload, processos) {
  if (typeof payload?.total_atrasados === 'number') {
    return payload.total_atrasados;
  }

  if (typeof payload?.atrasados === 'number') {
    return payload.atrasados;
  }

  if (typeof payload?.em_atraso === 'number') {
    return payload.em_atraso;
  }

  return processos.filter(processoAtrasado).length;
}

export default function ProcessosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [payload, setPayload] = useState(null);
  const [processos, setProcessos] = useState([]);
  const [isLoadingProcessos, setIsLoadingProcessos] = useState(true);
  const [erro, setErro] = useState('');

  const carregarProcessos = useCallback(async () => {
    setIsLoadingProcessos(true);
    setErro('');

    try {
      const data = await listarProcessosEmAndamento();
      setPayload(data);
      setProcessos(normalizarProcessos(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoadingProcessos(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarProcessos();
    }
  }, [carregarProcessos, isAuthenticated, isLoading]);

  const totalEmAndamento = useMemo(
    () => calcularTotalEmAndamento(payload, processos),
    [payload, processos],
  );

  const totalAtrasados = useMemo(
    () => calcularAtrasados(payload, processos),
    [payload, processos],
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
          <h1 className="text-2xl font-semibold text-zinc-900">Processos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Todos os processos em andamento com destaque para atrasos.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarProcessos}
          disabled={isLoadingProcessos}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingProcessos ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Em andamento
          </p>
          <p className="mt-2 text-4xl font-bold leading-none text-zinc-900">{totalEmAndamento}</p>
        </article>

        <article className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Em atraso
          </p>
          <p className="mt-2 text-4xl font-bold leading-none text-amber-800">{totalAtrasados}</p>
        </article>
      </section>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {!erro && isLoadingProcessos ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando processos...</p>
        </section>
      ) : null}

      {!erro && !isLoadingProcessos && processos.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhum processo em andamento encontrado.</p>
        </section>
      ) : null}

      {!erro && !isLoadingProcessos && processos.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Processo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Prazo</th>
                <th className="px-4 py-3">Atraso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {processos.map((processo, index) => (
                <tr key={processo?.id || `${tituloProcesso(processo, index)}-${index}`}>
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {tituloProcesso(processo, index)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {processo?.status || processo?.situacao || 'em_andamento'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarData(extrairPrazo(processo))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        processoAtrasado(processo)
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {processoAtrasado(processo) ? 'Em atraso' : 'No prazo'}
                    </span>
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
