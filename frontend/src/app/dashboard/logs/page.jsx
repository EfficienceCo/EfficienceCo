'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { listarEventos } from '../../../services/eventos.service';

const LIMITE_PADRAO = 50;

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

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar os logs do agente.'
  );
}

export default function Logs() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const [eventos, setEventos] = useState([]);
  const [isLoadingEventos, setIsLoadingEventos] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  async function carregarEventos() {
    setIsLoadingEventos(true);
    setErro('');

    try {
      const data = await listarEventos({ limit: LIMITE_PADRAO });
      setEventos(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoadingEventos(false);
    }
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarEventos();
    }
  }, [isLoading, isAuthenticated]);

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
          <h1 className="text-2xl font-semibold text-zinc-900">Logs do Agente</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Historico das execucoes realizadas pelo agente.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarEventos}
          disabled={isLoadingEventos}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingEventos ? 'Atualizando...' : 'Atualizar logs'}
        </button>
      </header>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {!erro && isLoadingEventos ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando logs...</p>
        </section>
      ) : null}

      {!erro && !isLoadingEventos && eventos.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhum log encontrado para este cliente.</p>
        </section>
      ) : null}

      {!erro && !isLoadingEventos && eventos.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Evento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td className="px-4 py-3 text-sm text-zinc-800">{evento.descricao || '-'}</td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{formatarDataHora(evento.criado_em)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          evento.sucesso
                            ? 'inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                            : 'inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700'
                        }
                      >
                        {evento.sucesso ? 'Sucesso' : 'Erro'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

