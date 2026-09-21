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

// Espelha REGIMES_TRIBUTARIOS e ANEXOS_SIMPLES de
// backend/src/utils/regime-tributario.util.js — a apuração do Simples só roda
// para `simples_nacional`, mas o cadastro registra o regime real do cliente.
const REGIMES = [
  { valor: 'simples_nacional', rotulo: 'Simples Nacional' },
  { valor: 'lucro_presumido', rotulo: 'Lucro Presumido' },
  { valor: 'lucro_real', rotulo: 'Lucro Real' },
];

const ANEXOS = ['I', 'II', 'III', 'IV', 'V'];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Mesmo piso do backend: antes disso não há tabela do Simples suportada.
const ANO_MINIMO = 2020;

const FORM_CLIENTE_INICIAL = { nome: '', cnpj: '', regime_tributario: '', anexo_simples: '' };

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

function rotuloRegime(regime) {
  return REGIMES.find((item) => item.valor === regime)?.rotulo || null;
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/** Converte o JSONB do banco em linhas editáveis, da competência mais antiga para a mais nova. */
function historicoParaFormulario(historico) {
  if (!Array.isArray(historico)) {
    return [];
  }

  return historico
    .map((entrada) => ({
      mes: String(entrada?.mes ?? ''),
      ano: String(entrada?.ano ?? ''),
      receita: String(entrada?.receita ?? ''),
    }))
    .sort((a, b) => Number(a.ano) - Number(b.ano) || Number(a.mes) - Number(b.mes));
}

/**
 * Valida o formulário com as mesmas regras do backend
 * (`validarHistoricoReceita` + coerência regime/anexo), para o contador ver o
 * problema no campo em vez de receber um 400 genérico depois de salvar.
 */
function validarFormularioRegime({ regime, anexo, historico }) {
  if (regime === 'simples_nacional' && !anexo) {
    return 'Escolha o anexo do Simples — sem ele a apuração não encontra a tabela de alíquotas.';
  }

  const competencias = new Set();

  for (const [indice, linha] of historico.entries()) {
    const posicao = indice + 1;
    const mes = Number(linha.mes);
    const ano = Number(linha.ano);
    const receita = Number(String(linha.receita).replace(',', '.'));

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return `Linha ${posicao} do histórico: escolha o mês.`;
    }

    if (!Number.isInteger(ano) || ano < ANO_MINIMO) {
      return `Linha ${posicao} do histórico: informe um ano a partir de ${ANO_MINIMO}.`;
    }

    if (String(linha.receita).trim() === '' || !Number.isFinite(receita) || receita < 0) {
      return `Linha ${posicao} do histórico: informe uma receita igual ou maior que zero.`;
    }

    const referencia = `${ano}-${mes}`;
    if (competencias.has(referencia)) {
      return `A competência ${String(mes).padStart(2, '0')}/${ano} aparece mais de uma vez no histórico.`;
    }
    competencias.add(referencia);
  }

  return '';
}

function historicoParaPayload(historico) {
  return historico.map((linha) => ({
    mes: Number(linha.mes),
    ano: Number(linha.ano),
    receita: Number(String(linha.receita).replace(',', '.')),
  }));
}

export default function AdminClientes() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [formData, setFormData] = useState(FORM_CLIENTE_INICIAL);
  const [isCreating, setIsCreating] = useState(false);
  const [erroFormulario, setErroFormulario] = useState('');
  const [sucessoFormulario, setSucessoFormulario] = useState('');

  const [atualizandoId, setAtualizandoId] = useState(null);

  // Editor de regime tributário (#496): regime, anexo e histórico de receita
  // manual — os três campos que `dispararApuracao` lê e que, até esta issue,
  // só dava pra preencher com UPDATE na mão no banco.
  const [clienteEditando, setClienteEditando] = useState(null);
  const [formRegime, setFormRegime] = useState({ regime: '', anexo: '', historico: [] });
  const [erroRegime, setErroRegime] = useState('');
  const [isSavingRegime, setIsSavingRegime] = useState(false);

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

  // Libera o 1º evento eSocial do cliente (bloqueado em
  // eventos-esocial.controller.js enquanto esocial_configurado for false).
  async function handleToggleEsocialConfigurado(cliente) {
    setAtualizandoId(cliente.id);

    try {
      const atualizado = await atualizarCliente(cliente.id, {
        esocial_configurado: !cliente.esocial_configurado,
      });
      setClientes((prev) =>
        prev.map((c) => (c.id === atualizado.id ? atualizado : c)),
      );
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Não foi possível alterar a configuração do eSocial.'));
    } finally {
      setAtualizandoId(null);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((previousValue) => ({
      ...previousValue,
      // Trocar para um regime fora do Simples zera o anexo: ele só existe no
      // Simples Nacional e ficaria pendurado num cadastro que não o usa.
      ...(name === 'regime_tributario' && value !== 'simples_nacional' ? { anexo_simples: '' } : {}),
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

    if (formData.regime_tributario === 'simples_nacional' && !formData.anexo_simples) {
      setErroFormulario('Escolha o anexo do Simples para clientes no Simples Nacional.');
      return;
    }

    setIsCreating(true);

    try {
      const clienteCriado = await criarCliente({
        nome,
        ...(cnpj ? { cnpj } : {}),
        regime_tributario: formData.regime_tributario,
        anexo_simples: formData.anexo_simples,
      });

      setClientes((currentValue) => [
        clienteCriado,
        ...currentValue.filter((cliente) => cliente.id !== clienteCriado.id),
      ]);
      setFormData(FORM_CLIENTE_INICIAL);
      setSucessoFormulario('Cliente criado com sucesso.');
    } catch (error) {
      setErroFormulario(obterMensagemErro(error, 'Não foi possível criar o cliente.'));
    } finally {
      setIsCreating(false);
    }
  }

  function abrirEditorRegime(cliente) {
    setSucessoFormulario('');
    setClienteEditando(cliente);
    setFormRegime({
      regime: cliente.regime_tributario || '',
      anexo: cliente.anexo_simples || '',
      historico: historicoParaFormulario(cliente.historico_receita),
    });
    setErroRegime('');
  }

  function fecharEditorRegime() {
    setClienteEditando(null);
    setErroRegime('');
  }

  function handleChangeRegime(event) {
    const { value } = event.target;
    setFormRegime((anterior) => ({
      ...anterior,
      regime: value,
      anexo: value === 'simples_nacional' ? anterior.anexo : '',
    }));
  }

  function handleChangeLinhaHistorico(indice, campo, valor) {
    setFormRegime((anterior) => ({
      ...anterior,
      historico: anterior.historico.map((linha, posicao) =>
        posicao === indice ? { ...linha, [campo]: valor } : linha,
      ),
    }));
  }

  function adicionarLinhaHistorico() {
    setFormRegime((anterior) => ({
      ...anterior,
      historico: [...anterior.historico, { mes: '', ano: '', receita: '' }],
    }));
  }

  function removerLinhaHistorico(indice) {
    setFormRegime((anterior) => ({
      ...anterior,
      historico: anterior.historico.filter((_, posicao) => posicao !== indice),
    }));
  }

  async function handleSubmitRegime(event) {
    event.preventDefault();
    setErroRegime('');

    const mensagem = validarFormularioRegime({
      regime: formRegime.regime,
      anexo: formRegime.anexo,
      historico: formRegime.historico,
    });

    if (mensagem) {
      setErroRegime(mensagem);
      return;
    }

    setIsSavingRegime(true);

    try {
      const atualizado = await atualizarCliente(clienteEditando.id, {
        // String vazia limpa a coluna no backend — é como o contador desfaz um
        // regime informado por engano.
        regime_tributario: formRegime.regime,
        anexo_simples: formRegime.anexo,
        historico_receita: historicoParaPayload(formRegime.historico),
      });

      setClientes((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c)));
      setClienteEditando(null);
      setSucessoFormulario(`Regime tributário de ${atualizado.nome} atualizado.`);
    } catch (error) {
      setErroRegime(obterMensagemErro(error, 'Não foi possível salvar o regime tributário.'));
    } finally {
      setIsSavingRegime(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated || !isAdminEfficience) {
    return null;
  }

  const totalHistorico = formRegime.historico.reduce((soma, linha) => {
    const receita = Number(String(linha.receita).replace(',', '.'));
    return Number.isFinite(receita) ? soma + receita : soma;
  }, 0);

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

      {/* Confirmação de página: o editor de regime é aberto a partir da tabela,
          então a mensagem não pode morar dentro do card de cadastro. */}
      {sucessoFormulario ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sucessoFormulario}
        </p>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Novo cliente</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nome é obrigatório. CNPJ e regime são opcionais — o regime também pode ser
          informado depois, em &ldquo;Editar&rdquo; na coluna Regime tributário.
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

          <div className="space-y-2">
            <label htmlFor="regime_tributario" className="block text-sm font-medium text-zinc-700">
              Regime tributário
            </label>
            <select
              id="regime_tributario"
              name="regime_tributario"
              value={formData.regime_tributario}
              onChange={handleChange}
              disabled={isCreating}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Não informado</option>
              {REGIMES.map((regime) => (
                <option key={regime.valor} value={regime.valor}>
                  {regime.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="anexo_simples" className="block text-sm font-medium text-zinc-700">
              Anexo do Simples
            </label>
            <select
              id="anexo_simples"
              name="anexo_simples"
              value={formData.anexo_simples}
              onChange={handleChange}
              disabled={isCreating || formData.regime_tributario !== 'simples_nacional'}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {formData.regime_tributario === 'simples_nacional'
                  ? 'Selecione o anexo'
                  : 'Só para o Simples Nacional'}
              </option>
              {ANEXOS.map((anexo) => (
                <option key={anexo} value={anexo}>
                  Anexo {anexo}
                </option>
              ))}
            </select>
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
                <th className="px-4 py-3">Regime tributário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">eSocial (Grupo 1)</th>
                <th className="px-4 py-3">Usuários</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {clientes.map((cliente) => {
                const statusNormalizado = String(cliente?.status || '').toLowerCase();
                const statusClasses = STATUS_STYLES[statusNormalizado] || 'bg-zinc-100 text-zinc-700';
                const regime = rotuloRegime(cliente.regime_tributario);
                const mesesHistorico = Array.isArray(cliente.historico_receita)
                  ? cliente.historico_receita.length
                  : 0;

                return (
                  <tr key={cliente.id || `${cliente.nome}-${cliente.criado_em || ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                      {cliente.nome || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {cliente.cnpj || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="space-y-1">
                        {regime ? (
                          <span className="inline-block rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                            {regime}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                            Não informado
                          </span>
                        )}

                        <p className="text-xs text-zinc-500">
                          {cliente.anexo_simples ? `Anexo ${cliente.anexo_simples} · ` : ''}
                          {mesesHistorico === 0
                            ? 'sem histórico'
                            : `${mesesHistorico} ${mesesHistorico === 1 ? 'mês' : 'meses'}`}
                        </p>

                        {/* A ação mora na própria coluna do regime: é o campo que ela
                            edita, e a coluna Ações já estava no limite da largura. */}
                        <button
                          type="button"
                          onClick={() => abrirEditorRegime(cliente)}
                          className="text-xs font-medium text-sky-700 underline underline-offset-2 transition hover:text-sky-900"
                          aria-label={`Editar regime tributário de ${cliente.nome}`}
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses}`}>
                        {formatarStatus(cliente.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleEsocialConfigurado(cliente)}
                        disabled={atualizandoId === cliente.id}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          cliente.esocial_configurado
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                      >
                        {atualizandoId === cliente.id
                          ? '...'
                          : cliente.esocial_configurado
                            ? 'Configurado'
                            : 'Marcar como configurado'}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                      {Number.isFinite(cliente.total_usuarios) ? cliente.total_usuarios : 0}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {formatarDataHora(cliente.criado_em)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-2">
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {clienteEditando ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Regime tributário</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {clienteEditando.nome} — define como a apuração do Simples calcula o DAS.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharEditorRegime}
                disabled={isSavingRegime}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar editor de regime tributário"
              >
                X
              </button>
            </header>

            <form className="space-y-5 p-5" onSubmit={handleSubmitRegime}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="regime-editor" className="block text-sm font-medium text-zinc-700">
                    Regime tributário
                  </label>
                  <select
                    id="regime-editor"
                    value={formRegime.regime}
                    onChange={handleChangeRegime}
                    disabled={isSavingRegime}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Não informado</option>
                    {REGIMES.map((regime) => (
                      <option key={regime.valor} value={regime.valor}>
                        {regime.rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="anexo-editor" className="block text-sm font-medium text-zinc-700">
                    Anexo do Simples
                  </label>
                  <select
                    id="anexo-editor"
                    value={formRegime.anexo}
                    onChange={(event) =>
                      setFormRegime((anterior) => ({ ...anterior, anexo: event.target.value }))
                    }
                    disabled={isSavingRegime || formRegime.regime !== 'simples_nacional'}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {formRegime.regime === 'simples_nacional'
                        ? 'Selecione o anexo'
                        : 'Só para o Simples Nacional'}
                    </option>
                    {ANEXOS.map((anexo) => (
                      <option key={anexo} value={anexo}>
                        Anexo {anexo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formRegime.regime && formRegime.regime !== 'simples_nacional' ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  A apuração automática hoje cobre apenas o Simples Nacional. Clientes em outro
                  regime ficam cadastrados, mas não geram DAS.
                </p>
              ) : null}

              <div className="space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Histórico de receita</h3>
                    <p className="text-sm text-zinc-500">
                      Receita mensal informada pelo contador. Só é usada nos meses da RBT12 que
                      ainda não têm NF-e importada — não há risco de dupla contagem.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={adicionarLinhaHistorico}
                    disabled={isSavingRegime}
                    className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Adicionar mês
                  </button>
                </div>

                {formRegime.historico.length === 0 ? (
                  <p className="rounded-md border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500">
                    Nenhum mês informado. Sem histórico, a RBT12 considera apenas as notas fiscais
                    já importadas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {formRegime.historico.map((linha, indice) => (
                      // A competência pode estar vazia numa linha recém-criada, então o índice
                      // é a única chave estável enquanto o contador digita.
                      // eslint-disable-next-line react/no-array-index-key
                      // No mobile os campos empilham e uma competência encosta na
                      // seguinte; a moldura agrupa cada linha (some no desktop).
                      <div
                        key={indice}
                        className="grid gap-2 rounded-md border border-zinc-200 p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:border-0 sm:p-0"
                      >
                        <select
                          aria-label={`Mês da linha ${indice + 1}`}
                          value={linha.mes}
                          onChange={(event) =>
                            handleChangeLinhaHistorico(indice, 'mes', event.target.value)
                          }
                          disabled={isSavingRegime}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">Mês</option>
                          {MESES.map((nome, posicao) => (
                            <option key={nome} value={posicao + 1}>
                              {nome}
                            </option>
                          ))}
                        </select>

                        <input
                          aria-label={`Ano da linha ${indice + 1}`}
                          type="number"
                          inputMode="numeric"
                          min={ANO_MINIMO}
                          placeholder="Ano"
                          value={linha.ano}
                          onChange={(event) =>
                            handleChangeLinhaHistorico(indice, 'ano', event.target.value)
                          }
                          disabled={isSavingRegime}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        <input
                          aria-label={`Receita da linha ${indice + 1}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          placeholder="Receita (R$)"
                          value={linha.receita}
                          onChange={(event) =>
                            handleChangeLinhaHistorico(indice, 'receita', event.target.value)
                          }
                          disabled={isSavingRegime}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                        />

                        <button
                          type="button"
                          onClick={() => removerLinhaHistorico(indice)}
                          disabled={isSavingRegime}
                          className="rounded-md bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Remover a linha ${indice + 1} do histórico`}
                        >
                          Remover
                        </button>
                      </div>
                    ))}

                    <p className="text-sm text-zinc-600">
                      Total informado: <strong>{formatarMoeda(totalHistorico)}</strong> em{' '}
                      {formRegime.historico.length}{' '}
                      {formRegime.historico.length === 1 ? 'mês' : 'meses'}.
                    </p>
                  </div>
                )}
              </div>

              {erroRegime ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {erroRegime}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={fecharEditorRegime}
                  disabled={isSavingRegime}
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSavingRegime}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingRegime ? 'Salvando...' : 'Salvar regime'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
