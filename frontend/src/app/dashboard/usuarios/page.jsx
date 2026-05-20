'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  atualizarUsuario,
  criarUsuario,
  deletarUsuario,
  listarUsuarios,
} from '../../../services/usuarios.service';

const PERFIS_AUTORIZADOS = new Set(['admin_cliente', 'admin_efficience']);
const PERFIS_CADASTRAVEIS = [
  { value: 'admin_cliente', label: 'Admin cliente' },
  { value: 'funcionario', label: 'Funcionario' },
];
const FORM_INICIAL = {
  nome: '',
  email: '',
  senha: '',
  perfil: PERFIS_CADASTRAVEIS[1].value,
};

function obterMensagemErro(error, fallback = 'Nao foi possivel processar sua solicitacao.') {
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

function formatarPerfil(perfil) {
  if (!perfil) {
    return '-';
  }

  return String(perfil)
    .split('_')
    .map((parte) => `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`)
    .join(' ');
}

function usuarioParaFormulario(usuario) {
  return {
    nome: usuario?.nome || '',
    email: usuario?.email || '',
    senha: '',
    perfil: usuario?.perfil || PERFIS_CADASTRAVEIS[1].value,
  };
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function Usuarios() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [isLoadingUsuarios, setIsLoadingUsuarios] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [isFormModalAberto, setIsFormModalAberto] = useState(false);
  const [modoFormulario, setModoFormulario] = useState('criar');
  const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [erroFormulario, setErroFormulario] = useState('');
  const [isSavingFormulario, setIsSavingFormulario] = useState(false);

  const [usuarioParaDeletar, setUsuarioParaDeletar] = useState(null);
  const [isDeleteModalAberto, setIsDeleteModalAberto] = useState(false);
  const [erroDelete, setErroDelete] = useState('');
  const [isDeletingUsuario, setIsDeletingUsuario] = useState(false);

  const podeGerenciarUsuarios = PERFIS_AUTORIZADOS.has(user?.perfil);
  const podeCriarUsuarios = podeGerenciarUsuarios;
  const podeEditarUsuarios = podeGerenciarUsuarios;
  const podeExcluirUsuarios = podeGerenciarUsuarios;
  const exibeColunaAcoes = podeEditarUsuarios || podeExcluirUsuarios;

  const clienteIdAdminGlobal =
    user?.perfil === 'admin_efficience' ? user?.cliente_id || null : null;
  const requerClienteId = user?.perfil === 'admin_efficience' && !clienteIdAdminGlobal;

  const carregarUsuarios = useCallback(async () => {
    if (requerClienteId) {
      setIsLoadingUsuarios(false);
      setUsuarios([]);
      setErroLista(
        'Seu usuario admin_efficience nao possui cliente_id no token para gerir usuarios.',
      );
      return;
    }

    setIsLoadingUsuarios(true);
    setErroLista('');

    try {
      const data = await listarUsuarios({ clienteId: clienteIdAdminGlobal || undefined });
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel carregar os usuarios.'));
    } finally {
      setIsLoadingUsuarios(false);
    }
  }, [clienteIdAdminGlobal, requerClienteId]);

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

  function abrirModalCriacao() {
    setModoFormulario('criar');
    setUsuarioEditandoId(null);
    setFormData(FORM_INICIAL);
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function abrirModalEdicao(usuario) {
    setModoFormulario('editar');
    setUsuarioEditandoId(usuario.id);
    setFormData(usuarioParaFormulario(usuario));
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function fecharModalFormulario() {
    if (isSavingFormulario) {
      return;
    }

    setIsFormModalAberto(false);
    setErroFormulario('');
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((currentValue) => ({
      ...currentValue,
      [name]: value,
    }));
  }

  async function handleSubmitFormulario(event) {
    event.preventDefault();

    const nome = formData.nome.trim();
    const email = formData.email.trim().toLowerCase();
    const senha = formData.senha.trim();

    if (!nome || !email) {
      setErroFormulario('Preencha nome e email.');
      return;
    }

    if (modoFormulario === 'criar' && !senha) {
      setErroFormulario('Preencha a senha para criar o usuario.');
      return;
    }

    if (!PERFIS_CADASTRAVEIS.some((item) => item.value === formData.perfil)) {
      setErroFormulario('Selecione um perfil valido.');
      return;
    }

    if (user?.perfil === 'admin_efficience' && !clienteIdAdminGlobal) {
      setErroFormulario(
        'Seu usuario admin_efficience nao possui cliente_id no token para esta acao.',
      );
      return;
    }

    setIsSavingFormulario(true);
    setErroFormulario('');

    const payload = {
      nome,
      email,
      perfil: formData.perfil,
    };

    if (modoFormulario === 'criar') {
      payload.senha = senha;
    } else if (senha) {
      payload.senha = senha;
    }

    try {
      if (modoFormulario === 'criar') {
        const criado = await criarUsuario(payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setUsuarios((currentValue) => [
          criado,
          ...currentValue.filter((item) => item.id !== criado.id),
        ]);
      } else {
        const atualizado = await atualizarUsuario(usuarioEditandoId, payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setUsuarios((currentValue) =>
          currentValue.map((item) => (item.id === atualizado.id ? atualizado : item)),
        );
      }

      setIsFormModalAberto(false);
      setUsuarioEditandoId(null);
      setFormData(FORM_INICIAL);
    } catch (error) {
      setErroFormulario(obterMensagemErro(error));
    } finally {
      setIsSavingFormulario(false);
    }
  }

  function abrirModalDelete(usuario) {
    setUsuarioParaDeletar(usuario);
    setErroDelete('');
    setIsDeleteModalAberto(true);
  }

  function fecharModalDelete() {
    if (isDeletingUsuario) {
      return;
    }

    setIsDeleteModalAberto(false);
    setUsuarioParaDeletar(null);
    setErroDelete('');
  }

  async function confirmarDeleteUsuario() {
    if (!usuarioParaDeletar?.id) {
      return;
    }

    if (user?.perfil === 'admin_efficience' && !clienteIdAdminGlobal) {
      setErroDelete(
        'Seu usuario admin_efficience nao possui cliente_id no token para esta acao.',
      );
      return;
    }

    setIsDeletingUsuario(true);
    setErroDelete('');

    try {
      await deletarUsuario(usuarioParaDeletar.id, {
        clienteId: clienteIdAdminGlobal || undefined,
      });

      setUsuarios((currentValue) =>
        currentValue.filter((item) => item.id !== usuarioParaDeletar.id),
      );
      setIsDeleteModalAberto(false);
      setUsuarioParaDeletar(null);
    } catch (error) {
      setErroDelete(obterMensagemErro(error, 'Nao foi possivel deletar o usuario.'));
    } finally {
      setIsDeletingUsuario(false);
    }
  }

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
          <h1 className="text-2xl font-semibold text-zinc-900">Usuarios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Apenas administradores podem visualizar esta area.
          </p>
        </header>
      </main>
    );
  }

  return (
    <>
      <main className="space-y-6 p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Usuarios</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Lista de usuarios vinculados ao cliente logado.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {podeCriarUsuarios ? (
              <button
                type="button"
                onClick={abrirModalCriacao}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Novo usuario
              </button>
            ) : null}

            <button
              type="button"
              onClick={carregarUsuarios}
              disabled={isLoadingUsuarios}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingUsuarios ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {erroLista ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroLista}</p>
          </section>
        ) : null}

        {!erroLista && isLoadingUsuarios ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando usuarios...</span>
            </div>
          </section>
        ) : null}

        {!erroLista && !isLoadingUsuarios && usuarios.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">
              Nenhum usuario encontrado para este cliente.
            </p>
          </section>
        ) : null}

        {!erroLista && !isLoadingUsuarios && usuarios.length > 0 ? (
          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Criado em</th>
                  {exibeColunaAcoes ? <th className="px-4 py-3">Acoes</th> : null}
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

                    {exibeColunaAcoes ? (
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          {podeEditarUsuarios ? (
                            <button
                              type="button"
                              onClick={() => abrirModalEdicao(usuario)}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                            >
                              Editar
                            </button>
                          ) : null}

                          {podeExcluirUsuarios ? (
                            <button
                              type="button"
                              onClick={() => abrirModalDelete(usuario)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                            >
                              Deletar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>

      {isFormModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {modoFormulario === 'criar' ? 'Novo usuario' : 'Editar usuario'}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {modoFormulario === 'criar'
                    ? 'Informe os dados para cadastrar o usuario.'
                    : 'Atualize os dados do usuario. Nova senha e opcional.'}
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalFormulario}
                disabled={isSavingFormulario}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar modal"
              >
                X
              </button>
            </header>

            <form className="space-y-4 p-5" onSubmit={handleSubmitFormulario}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="nome" className="block text-sm font-medium text-zinc-700">
                    Nome
                  </label>
                  <input
                    id="nome"
                    name="nome"
                    value={formData.nome}
                    onChange={handleFormChange}
                    placeholder="Ex: Maria Silva"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
                    E-mail
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    placeholder="usuario@empresa.com"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="perfil" className="block text-sm font-medium text-zinc-700">
                    Perfil
                  </label>
                  <select
                    id="perfil"
                    name="perfil"
                    value={formData.perfil}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {PERFIS_CADASTRAVEIS.map((perfil) => (
                      <option key={perfil.value} value={perfil.value}>
                        {perfil.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="senha" className="block text-sm font-medium text-zinc-700">
                    {modoFormulario === 'criar' ? 'Senha' : 'Nova senha (opcional)'}
                  </label>
                  <input
                    id="senha"
                    name="senha"
                    type="password"
                    value={formData.senha}
                    onChange={handleFormChange}
                    placeholder={
                      modoFormulario === 'criar' ? 'Digite a senha' : 'Somente se quiser trocar'
                    }
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required={modoFormulario === 'criar'}
                  />
                </div>
              </div>

              {erroFormulario ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {erroFormulario}
                </p>
              ) : null}

              <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={fecharModalFormulario}
                  disabled={isSavingFormulario}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSavingFormulario}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingFormulario ? <Spinner /> : null}
                  {isSavingFormulario
                    ? 'Salvando...'
                    : modoFormulario === 'criar'
                      ? 'Criar usuario'
                      : 'Salvar alteracoes'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteModalAberto && usuarioParaDeletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar exclusao</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Deseja realmente deletar este usuario?
            </p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              {usuarioParaDeletar.nome || '-'} ({usuarioParaDeletar.email || '-'})
            </p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              Perfil: {formatarPerfil(usuarioParaDeletar.perfil)}
            </p>

            {erroDelete ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {erroDelete}
              </p>
            ) : null}

            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={fecharModalDelete}
                disabled={isDeletingUsuario}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarDeleteUsuario}
                disabled={isDeletingUsuario}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingUsuario ? <Spinner /> : null}
                {isDeletingUsuario ? 'Deletando...' : 'Deletar usuario'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
