'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { listarClientes } from '../../services/clientes.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';

const STATUS_STYLES = {
  ativo: 'bg-emerald-100 text-emerald-700',
  inativo: 'bg-rose-100 text-rose-700',
  suspenso: 'bg-amber-100 text-amber-700',
};

function obterMensagemErro(error, fallback) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function formatarStatus(status) {
  if (!status) {
    return 'Desconhecido';
  }

  const normalizado = String(status).toLowerCase();
  return `${normalizado.charAt(0).toUpperCase()}${normalizado.slice(1)}`;
}

function formatarData(data) {
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

function obterDataCadastro(cliente) {
  return cliente?.criado_em || cliente?.created_at || cliente?.data_criacao || null;
}

function ordenarPorDataMaisRecente(lista) {
  return [...lista].sort((a, b) => {
    const dataA = new Date(obterDataCadastro(a) || 0).getTime();
    const dataB = new Date(obterDataCadastro(b) || 0).getTime();
    return dataB - dataA;
  });
}

export default function Admin() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const carregarClientes = useCallback(async () => {
    setIsLoadingClientes(true);
    setErroLista('');

    try {
      const data = await listarClientes();
      setClientes(Array.isArray(data) ? data : []);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel carregar os escritorios.'));
      setClientes([]);
    } finally {
      setIsLoadingClientes(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !user) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !isAdminEfficience) {
      router.replace('/dashboard');
    }
  }, [isAdminEfficience, isAuthenticated, isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdminEfficience) {
      carregarClientes();
    }
  }, [carregarClientes, isAdminEfficience, isAuthenticated, isLoading]);

  const metricas = useMemo(() => {
    return clientes.reduce(
      (acumulador, cliente) => {
        const status = String(cliente?.status || '').toLowerCase();
        acumulador.total += 1;

        if (status === 'ativo') {
          acumulador.ativos += 1;
        } else if (status === 'inativo') {
          acumulador.inativos += 1;
        } else if (status === 'suspenso') {
          acumulador.suspensos += 1;
        }

        return acumulador;
      },
      { total: 0, ativos: 0, inativos: 0, suspensos: 0 },
    );
  }, [clientes]);

  const ultimosEscritorios = useMemo(() => {
    return ordenarPorDataMaisRecente(clientes).slice(0, 5);
  }, [clientes]);

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated || !isAdminEfficience) {
    return null;
  }

  const cardValue = (valor) => (erroLista ? '—' : valor);

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Painel administrativo</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Visao geral dos escritorios cadastrados na plataforma.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarClientes}
          disabled={isLoadingClientes}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingClientes ? 'Atualizando...' : 'Atualizar painel'}
        </button>
      </header>

      {erroLista ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">{erroLista}</p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Total de escritorios</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{cardValue(metricas.total)}</p>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Ativos</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">{cardValue(metricas.ativos)}</p>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Inativos</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">{cardValue(metricas.inativos)}</p>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Suspensos</p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">{cardValue(metricas.suspensos)}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-zinc-900">Ultimos 5 escritorios cadastrados</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data de cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isLoadingClientes ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-zinc-500">
                      Carregando escritorios...
                    </td>
                  </tr>
                ) : null}

                {!isLoadingClientes && ultimosEscritorios.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-zinc-500">
                      {erroLista ? 'Dados indisponiveis no momento.' : 'Nenhum escritorio cadastrado.'}
                    </td>
                  </tr>
                ) : null}

                {!isLoadingClientes &&
                  ultimosEscritorios.map((cliente) => {
                    const statusNormalizado = String(cliente?.status || '').toLowerCase();
                    const statusClasses =
                      STATUS_STYLES[statusNormalizado] || 'bg-zinc-100 text-zinc-700';

                    return (
                      <tr key={cliente.id || `${cliente.nome}-${obterDataCadastro(cliente) || ''}`}>
                        <td className="px-4 py-3 font-medium text-zinc-900">{cliente?.nome || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses}`}>
                            {formatarStatus(cliente?.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          {formatarData(obterDataCadastro(cliente))}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Links rapidos</h2>
          <p className="mt-1 text-sm text-zinc-500">Acesso direto para as areas administrativas.</p>

          <div className="mt-4 grid gap-3">
            <Link
              href="/admin/clientes"
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              Gerenciar clientes
            </Link>

            <Link
              href="/admin/usuarios"
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              Gerenciar usuarios
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}

