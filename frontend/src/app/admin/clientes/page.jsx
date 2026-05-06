'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { atualizarCliente, criarCliente, listarClientes } from '../../../services/clientes.service';

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

function formatarStatus(status) {
  if (!status) {
    return 'Desconhecido';
  }

  const normalizado = String(status).toLowerCase();
  return `${normalizado.charAt(0).toUpperCase()}${normalizado.slice(1)}`;
}

export default function AdminClientes() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [formData, setFormData] = useState({ nome: '', cnpj: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [erroFormulario, setErroFormulario] = useState('');
  const [sucessoFormulario, setSucessoFormulario] = useState('');

  const [atualizandoId, setAtualizandoId] = useState(null);

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const carregarClientes = useCallback(async () => {
    setIsLoadingClientes(true);
    setErroLista('');

    try {
      const data = await listarClientes();
      setClientes(Array.isArray(data) ? data : []);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Não foi possível carregar os clientes.'));
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

  async function handleToggleStatus(cliente) {
    const novoStatus = cliente.status === 'ativo' ? 'inativo' : 'ativo';
    setAtualizandoId(cliente.id);

    try {
      const atualizado = await atualizarCliente(cliente.id, { status: novoStatus });
      setClientes((prev) =>
        prev.map((c) => (c.id === atualizado.id ? atualizado : c)),
      );
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Não foi possível alterar o status.'));
    } finally {
      setAtualizandoId(null);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((previousValue) => ({
      ...previousValue,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErroFormulario('');
    setSucessoFormulario('');

    const nome = formData.nome.trim();
    const cnpj = formData.cnpj.trim();

    if (!nome) {
      setErroFormulario('Informe o nome do cliente.');
      return;
    }

    setIsCreating(true);

    try {
      const clienteCriado = await criarCliente({
        nome,
        ...(cnpj ? { cnpj } : {}),
      });

      setClientes((currentValue) => [
        clienteCriado,
        ...currentValue.filter((cliente) => cliente.id !== clienteCriado.id),
      ]);
      setFormData({ nome: '', cnpj: '' });
      setSucessoFormulario('Cliente criado com sucesso.');
    } catch (error) {
      setErroFormulario(obterMensagemErro(error, 'Não foi possível criar o cliente.'));
    } finally {
      setIsCreating(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated || !isAdminEfficience) {
    return null;
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Painel interno para listar e cadastrar clientes da Efficience.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarClientes}
          disabled={isLoadingClientes}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingClientes ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Novo cliente</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nome é obrigatório. CNPJ é opcional.
        </p>

        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="nome" className="block text-sm font-medium text-zinc-700">
              Nome
            </label>
            <input
              id="nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              placeholder="Ex: Escritório Alfa"
              disabled={isCreating}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="cnpj" className="block text-sm font-medium text-zinc-700">
              CNPJ
            </label>
            <input
              id="cnpj"
              name="cnpj"
              value={formData.cnpj}
              onChange={handleChange}
              placeholder="00.000.000/0000-00"
              disabled={isCreating}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? 'Salvando...' : 'Cadastrar cliente'}
            </button>
          </div>
        </form>

        {erroFormulario ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {erroFormulario}
          </p>
        ) : null}

        {sucessoFormulario ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {sucessoFormulario}
          </p>
        ) : null}
      </section>

      {erroLista ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroLista}</p>
        </section>
      ) : null}

      {!erroLista && isLoadingClientes ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando clientes...</p>
        </section>
      ) : null}

      {!erroLista && !isLoadingClientes && clientes.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhum cliente cadastrado até agora.</p>
        </section>
      ) : null}

      {!erroLista && !isLoadingClientes && clientes.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CNPJ</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Usuários</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {clientes.map((cliente) => {
                const statusNormalizado = String(cliente?.status || '').toLowerCase();
                const statusClasses = STATUS_STYLES[statusNormalizado] || 'bg-zinc-100 text-zinc-700';

                return (
                  <tr key={cliente.id || `${cliente.nome}-${cliente.criado_em || ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                      {cliente.nome || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {cliente.cnpj || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses}`}>
                        {formatarStatus(cliente.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {Number.isFinite(cliente.total_usuarios) ? cliente.total_usuarios : 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatarDataHora(cliente.criado_em)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(cliente)}
                        disabled={atualizandoId === cliente.id}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          cliente.status === 'ativo'
                            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                      >
                        {atualizandoId === cliente.id
                          ? '...'
                          : cliente.status === 'ativo'
                            ? 'Desativar'
                            : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
