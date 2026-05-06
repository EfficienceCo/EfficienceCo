'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { listarUsuarios } from '../../../services/usuarios.service';

const PERFIS_AUTORIZADOS = new Set(['admin_cliente', 'admin_efficience']);

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Não foi possível carregar os usuários.'
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

function formatarPerfil(perfil) {
  if (!perfil) {
    return '-';
  }

  return String(perfil)
    .split('_')
    .map((parte) => `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`)
    .join(' ');
}

export default function Usuarios() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [isLoadingUsuarios, setIsLoadingUsuarios] = useState(true);
  const [erro, setErro] = useState('');

  const podeGerenciarUsuarios = PERFIS_AUTORIZADOS.has(user?.perfil);

  const carregarUsuarios = useCallback(async () => {
    setIsLoadingUsuarios(true);
    setErro('');

    try {
      const data = await listarUsuarios();
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoadingUsuarios(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && podeGerenciarUsuarios) {
      carregarUsuarios();
    }
  }, [carregarUsuarios, isAuthenticated, isLoading, podeGerenciarUsuarios]);

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!podeGerenciarUsuarios) {
    return (
      <main className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Usuários</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Apenas administradores podem visualizar esta área.
          </p>
        </header>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Usuários</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Lista de usuários vinculados ao cliente logado.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarUsuarios}
          disabled={isLoadingUsuarios}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingUsuarios ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {!erro && isLoadingUsuarios ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando usuários...</p>
        </section>
      ) : null}

      {!erro && !isLoadingUsuarios && usuarios.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">
            Nenhum usuário encontrado para este cliente.
          </p>
        </section>
      ) : null}

      {!erro && !isLoadingUsuarios && usuarios.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Criado em</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {usuarios.map((usuario) => (
                <tr key={usuario.id || `${usuario.email}-${usuario.criado_em || ''}`}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                    {usuario.nome || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {usuario.email || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarPerfil(usuario.perfil)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                    {formatarDataHora(usuario.criado_em)}
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
