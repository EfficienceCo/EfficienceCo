'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  atualizarRegra,
  criarRegra,
  deletarRegra,
  listarRegras,
} from '../../../services/regras.service';

const PERFIS_AUTORIZADOS = new Set(['admin_cliente', 'admin_efficience']);

const CONDICAO_OPCOES = [
  { value: 'extensao=.pdf', label: 'Extensao .pdf' },
  { value: 'extensao=.xml', label: 'Extensao .xml' },
  { value: 'extensao=.csv', label: 'Extensao .csv' },
  { value: 'extensao=.txt', label: 'Extensao .txt' },
  { value: 'extensao=.xlsx', label: 'Extensao .xlsx' },
];

const ACAO_OPCOES = [
  { value: 'mover', label: 'Mover arquivo' },
  { value: 'copiar', label: 'Copiar arquivo' },
  { value: 'renomear', label: 'Renomear arquivo' },
];

const FORM_INICIAL = {
  pasta_origem: '',
  pasta_destino: '',
  condicao: CONDICAO_OPCOES[0].value,
  acao: ACAO_OPCOES[0].value,
  ativa: true,
};

function obterMensagemErro(error, fallback = 'Nao foi possivel processar sua solicitacao.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function formatarCondicao(condicao) {
  if (!condicao) {
    return '-';
  }

  if (condicao.startsWith('extensao=')) {
    const extensao = condicao.split('=')[1] || '';
    return `Extensao ${extensao}`;
  }

  return condicao;
}

function formatarAcao(acao) {
  if (!acao) {
    return '-';
  }

  return `${acao.charAt(0).toUpperCase()}${acao.slice(1)}`;
}

function regraParaFormulario(regra) {
  return {
    pasta_origem: regra?.pasta_origem || '',
    pasta_destino: regra?.pasta_destino || '',
    condicao: regra?.condicao || CONDICAO_OPCOES[0].value,
    acao: regra?.acao || ACAO_OPCOES[0].value,
    ativa: Boolean(regra?.ativa),
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

export default function Regras() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [regras, setRegras] = useState([]);
  const [isLoadingRegras, setIsLoadingRegras] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [isFormModalAberto, setIsFormModalAberto] = useState(false);
  const [modoFormulario, setModoFormulario] = useState('criar');
  const [regraEditandoId, setRegraEditandoId] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [erroFormulario, setErroFormulario] = useState('');
  const [isSavingFormulario, setIsSavingFormulario] = useState(false);

  const [regraParaDeletar, setRegraParaDeletar] = useState(null);
  const [isDeleteModalAberto, setIsDeleteModalAberto] = useState(false);
  const [erroDelete, setErroDelete] = useState('');
  const [isDeletingRegra, setIsDeletingRegra] = useState(false);

  const [statusEmAtualizacao, setStatusEmAtualizacao] = useState({});

  const podeGerenciarRegras = PERFIS_AUTORIZADOS.has(user?.perfil);
  const clienteIdAdminGlobal =
    user?.perfil === 'admin_efficience' ? user?.cliente_id || null : null;
  const requerClienteId = user?.perfil === 'admin_efficience' && !clienteIdAdminGlobal;

  const carregarRegras = useCallback(async () => {
    if (requerClienteId) {
      setIsLoadingRegras(false);
      setRegras([]);
      setErroLista(
        'Seu usuario admin_efficience nao possui cliente_id no token. Use um admin_cliente para configurar regras.',
      );
      return;
    }

    setIsLoadingRegras(true);
    setErroLista('');

    try {
      const data = await listarRegras({ clienteId: clienteIdAdminGlobal || undefined });
      setRegras(Array.isArray(data) ? data : []);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel carregar as regras.'));
    } finally {
      setIsLoadingRegras(false);
    }
  }, [clienteIdAdminGlobal, requerClienteId]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && podeGerenciarRegras) {
      carregarRegras();
    }
  }, [carregarRegras, isAuthenticated, isLoading, podeGerenciarRegras]);

  function abrirModalCriacao() {
    setModoFormulario('criar');
    setRegraEditandoId(null);
    setFormData(FORM_INICIAL);
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function abrirModalEdicao(regra) {
    setModoFormulario('editar');
    setRegraEditandoId(regra.id);
    setFormData(regraParaFormulario(regra));
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
    const { name, value, type, checked } = event.target;

    setFormData((currentValue) => ({
      ...currentValue,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmitFormulario(event) {
    event.preventDefault();

    const pastaOrigem = formData.pasta_origem.trim();
    const pastaDestino = formData.pasta_destino.trim();

    if (!pastaOrigem || !pastaDestino) {
      setErroFormulario('Preencha pasta de origem e pasta de destino.');
      return;
    }

    if (!formData.condicao || !formData.acao) {
      setErroFormulario('Selecione condicao e acao.');
      return;
    }

    setIsSavingFormulario(true);
    setErroFormulario('');

    const payload = {
      pasta_origem: pastaOrigem,
      pasta_destino: pastaDestino,
      condicao: formData.condicao,
      acao: formData.acao,
      ativa: Boolean(formData.ativa),
    };

    try {
      if (modoFormulario === 'criar') {
        const criada = await criarRegra(payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setRegras((currentValue) => [criada, ...currentValue]);
      } else {
        const atualizada = await atualizarRegra(regraEditandoId, payload, {
          clienteId: clienteIdAdminGlobal || undefined,
        });

        setRegras((currentValue) =>
          currentValue.map((item) => (item.id === atualizada.id ? atualizada : item)),
        );
      }

      setIsFormModalAberto(false);
      setRegraEditandoId(null);
      setFormData(FORM_INICIAL);
    } catch (error) {
      setErroFormulario(obterMensagemErro(error));
    } finally {
      setIsSavingFormulario(false);
    }
  }

  async function handleToggleAtiva(regra) {
    if (!regra?.id) {
      return;
    }

    setStatusEmAtualizacao((currentValue) => ({
      ...currentValue,
      [regra.id]: true,
    }));

    try {
      const atualizada = await atualizarRegra(
        regra.id,
        { ativa: !regra.ativa },
        { clienteId: clienteIdAdminGlobal || undefined },
      );

      setRegras((currentValue) =>
        currentValue.map((item) => (item.id === atualizada.id ? atualizada : item)),
      );
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel atualizar o status da regra.'));
    } finally {
      setStatusEmAtualizacao((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[regra.id];
        return nextValue;
      });
    }
  }

  function abrirModalDelete(regra) {
    setRegraParaDeletar(regra);
    setErroDelete('');
    setIsDeleteModalAberto(true);
  }

  function fecharModalDelete() {
    if (isDeletingRegra) {
      return;
    }

    setIsDeleteModalAberto(false);
    setRegraParaDeletar(null);
    setErroDelete('');
  }

  async function confirmarDeleteRegra() {
    if (!regraParaDeletar?.id) {
      return;
    }

    setIsDeletingRegra(true);
    setErroDelete('');

    try {
      await deletarRegra(regraParaDeletar.id, {
        clienteId: clienteIdAdminGlobal || undefined,
      });

      setRegras((currentValue) =>
        currentValue.filter((item) => item.id !== regraParaDeletar.id),
      );
      setIsDeleteModalAberto(false);
      setRegraParaDeletar(null);
    } catch (error) {
      setErroDelete(obterMensagemErro(error, 'Nao foi possivel deletar a regra.'));
    } finally {
      setIsDeletingRegra(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!podeGerenciarRegras) {
    return (
      <main className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Regras de automacao</h1>
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
            <h1 className="text-2xl font-semibold text-zinc-900">Regras de automacao</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Configure as regras que o agente deve aplicar nos arquivos monitorados.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={abrirModalCriacao}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Nova regra
            </button>

            <button
              type="button"
              onClick={carregarRegras}
              disabled={isLoadingRegras}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingRegras ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {erroLista ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroLista}</p>
          </section>
        ) : null}

        {!erroLista && isLoadingRegras ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando regras...</span>
            </div>
          </section>
        ) : null}

        {!erroLista && !isLoadingRegras && regras.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Nenhuma regra cadastrada para este cliente.</p>
          </section>
        ) : null}

        {!erroLista && !isLoadingRegras && regras.length > 0 ? (
          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Pasta origem</th>
                  <th className="px-4 py-3">Pasta destino</th>
                  <th className="px-4 py-3">Condicao</th>
                  <th className="px-4 py-3">Acao</th>
                  <th className="px-4 py-3">Status ativa</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {regras.map((regra) => {
                  const atualizandoStatus = Boolean(statusEmAtualizacao[regra.id]);

                  return (
                    <tr key={regra.id || `${regra.pasta_origem}-${regra.pasta_destino}`}>
                      <td className="max-w-[260px] break-all px-4 py-3 font-medium text-zinc-900">
                        {regra.pasta_origem || '-'}
                      </td>
                      <td className="max-w-[260px] break-all px-4 py-3 text-zinc-700">
                        {regra.pasta_destino || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {formatarCondicao(regra.condicao)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {formatarAcao(regra.acao)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleAtiva(regra)}
                          disabled={atualizandoStatus}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            regra.ativa
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                          }`}
                        >
                          {atualizandoStatus ? 'Salvando...' : regra.ativa ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirModalEdicao(regra)}
                            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirModalDelete(regra)}
                            className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                          >
                            Deletar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>

      {isFormModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {modoFormulario === 'criar' ? 'Nova regra' : 'Editar regra'}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Defina origem, destino, condicao, acao e status da regra.
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
                  <label htmlFor="pasta_origem" className="block text-sm font-medium text-zinc-700">
                    Pasta origem
                  </label>
                  <input
                    id="pasta_origem"
                    name="pasta_origem"
                    value={formData.pasta_origem}
                    onChange={handleFormChange}
                    placeholder="Ex: C:\\Docs\\Entrada"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="pasta_destino" className="block text-sm font-medium text-zinc-700">
                    Pasta destino
                  </label>
                  <input
                    id="pasta_destino"
                    name="pasta_destino"
                    value={formData.pasta_destino}
                    onChange={handleFormChange}
                    placeholder="Ex: C:\\Docs\\Processados"
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="condicao" className="block text-sm font-medium text-zinc-700">
                    Condicao
                  </label>
                  <select
                    id="condicao"
                    name="condicao"
                    value={formData.condicao}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {CONDICAO_OPCOES.map((opcao) => (
                      <option key={opcao.value} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="acao" className="block text-sm font-medium text-zinc-700">
                    Acao
                  </label>
                  <select
                    id="acao"
                    name="acao"
                    value={formData.acao}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {ACAO_OPCOES.map((opcao) => (
                      <option key={opcao.value} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="ativa"
                      checked={Boolean(formData.ativa)}
                      onChange={handleFormChange}
                      disabled={isSavingFormulario}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                    />
                    Regra ativa
                  </label>
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
                      ? 'Criar regra'
                      : 'Salvar alteracoes'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteModalAberto && regraParaDeletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar delecao</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Deseja realmente deletar esta regra?
            </p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              {regraParaDeletar.pasta_origem || '-'} {'->'} {regraParaDeletar.pasta_destino || '-'}
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
                disabled={isDeletingRegra}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarDeleteRegra}
                disabled={isDeletingRegra}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingRegra ? <Spinner /> : null}
                {isDeletingRegra ? 'Deletando...' : 'Deletar regra'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
