'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import {
  criarLancamentoContabil,
  deletarLancamentoContabil,
  iniciarConciliacao,
  listarConciliacoes,
  listarLancamentosContabeis,
  uploadExtrato,
} from '../../../../services/conciliacao.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';

const MESES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const TIPOS_LANCAMENTO = [
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
];

const FORM_INICIAL = {
  data_lancamento: '',
  descricao: '',
  tipo: TIPOS_LANCAMENTO[0].value,
  valor: '',
  categoria: '',
};

const STATUS_CONCILIACAO_META = {
  em_andamento: {
    label: 'Em andamento',
    classes: 'bg-sky-100 text-sky-800 ring-sky-200',
  },
  concluida: {
    label: 'Concluída',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
};

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function normalizarLista(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  return [];
}

function normalizarClientes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.clientes)) {
    return payload.clientes;
  }

  return [];
}

function obterIdCliente(cliente) {
  return cliente?.id || cliente?.cliente_id || cliente?.clienteId || '';
}

function obterNomeCliente(cliente) {
  return cliente?.nome || cliente?.razao_social || cliente?.email || obterIdCliente(cliente);
}

function obterAnosDisponiveis() {
  const anoAtual = new Date().getFullYear();
  return [anoAtual, anoAtual - 1, anoAtual - 2, anoAtual - 3, anoAtual - 4];
}

function obterMesAnoAtual() {
  const hoje = new Date();
  return { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
}

function formatarData(data) {
  if (!data) {
    return '-';
  }

  const dataTexto = String(data).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataTexto);

  if (!match) {
    return '-';
  }

  const valor = new Date(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
  );

  return Number.isNaN(valor.getTime())
    ? '-'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function formatarDataHora(data) {
  if (!data) {
    return '-';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(valor);
}

function formatarValor(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarTipoLancamento(tipo) {
  if (tipo === 'credito') {
    return 'Crédito';
  }

  if (tipo === 'debito') {
    return 'Débito';
  }

  return '-';
}

function classeBadgeTipo(tipo) {
  if (tipo === 'credito') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (tipo === 'debito') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-zinc-100 text-zinc-700';
}

function obterStatusConciliacaoMeta(status) {
  return (
    STATUS_CONCILIACAO_META[status] || {
      label: status || '-',
      classes: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
    }
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export default function ConciliacaoPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { isAuthenticated, isLoading, user } = useAuth();

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const [filtroMes, setFiltroMes] = useState(() => obterMesAnoAtual().mes);
  const [filtroAno, setFiltroAno] = useState(() => obterMesAnoAtual().ano);

  const clienteIdEfetivo = isAdminEfficience ? clienteId : user?.cliente_id || '';

  const [lancamentos, setLancamentos] = useState([]);
  const [isLoadingLancamentos, setIsLoadingLancamentos] = useState(true);
  const [erroLancamentos, setErroLancamentos] = useState('');

  const [conciliacoes, setConciliacoes] = useState([]);
  const [isLoadingConciliacoes, setIsLoadingConciliacoes] = useState(true);
  const [erroConciliacoes, setErroConciliacoes] = useState('');

  const [extrato, setExtrato] = useState(null);
  const [isUploadingExtrato, setIsUploadingExtrato] = useState(false);
  const [erroUpload, setErroUpload] = useState('');

  const [isModalLancamentoAberto, setIsModalLancamentoAberto] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [erroFormulario, setErroFormulario] = useState('');
  const [isSavingLancamento, setIsSavingLancamento] = useState(false);

  const [lancamentoParaDeletar, setLancamentoParaDeletar] = useState(null);
  const [isDeleteModalAberto, setIsDeleteModalAberto] = useState(false);
  const [erroDelete, setErroDelete] = useState('');
  const [isDeletingLancamento, setIsDeletingLancamento] = useState(false);

  const [isIniciandoConciliacao, setIsIniciandoConciliacao] = useState(false);
  const [erroIniciar, setErroIniciar] = useState('');

  const anosDisponiveis = useMemo(obterAnosDisponiveis, []);

  const clientesOrdenados = useMemo(
    () =>
      [...clientes].sort((clienteA, clienteB) =>
        obterNomeCliente(clienteA).localeCompare(obterNomeCliente(clienteB), 'pt-BR', {
          sensitivity: 'base',
        }),
      ),
    [clientes],
  );

  const carregarClientes = useCallback(async () => {
    setIsLoadingClientes(true);
    setErroClientes('');

    try {
      const data = await listarClientes();
      setClientes(normalizarClientes(data));
    } catch (error) {
      setErroClientes(obterMensagemErro(error, 'Não foi possível carregar os clientes.'));
    } finally {
      setIsLoadingClientes(false);
    }
  }, []);

  const requisicaoIdRef = useRef(0);

  const carregarDados = useCallback(async () => {
    const idRequisicao = (requisicaoIdRef.current += 1);

    setIsLoadingLancamentos(true);
    setErroLancamentos('');
    setIsLoadingConciliacoes(true);
    setErroConciliacoes('');

    try {
      const parametros = { clienteId: clienteIdEfetivo, mes: filtroMes, ano: filtroAno };

      const [resultadoLancamentos, resultadoConciliacoes] = await Promise.allSettled([
        listarLancamentosContabeis(parametros),
        listarConciliacoes(parametros),
      ]);

      if (idRequisicao !== requisicaoIdRef.current) {
        return;
      }

      if (resultadoLancamentos.status === 'fulfilled') {
        setLancamentos(normalizarLista(resultadoLancamentos.value));
      } else {
        setErroLancamentos(
          obterMensagemErro(resultadoLancamentos.reason, 'Não foi possível carregar os lançamentos.'),
        );
        setLancamentos([]);
      }

      if (resultadoConciliacoes.status === 'fulfilled') {
        setConciliacoes(normalizarLista(resultadoConciliacoes.value));
      } else {
        setErroConciliacoes(
          obterMensagemErro(resultadoConciliacoes.reason, 'Não foi possível carregar as conciliações.'),
        );
        setConciliacoes([]);
      }
    } catch (error) {
      if (idRequisicao === requisicaoIdRef.current) {
        setErroLancamentos(obterMensagemErro(error, 'Não foi possível carregar os lançamentos.'));
        setErroConciliacoes(obterMensagemErro(error, 'Não foi possível carregar as conciliações.'));
        setLancamentos([]);
        setConciliacoes([]);
      }
    } finally {
      if (idRequisicao === requisicaoIdRef.current) {
        setIsLoadingLancamentos(false);
        setIsLoadingConciliacoes(false);
      }
    }
  }, [clienteIdEfetivo, filtroAno, filtroMes]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdminEfficience) {
      carregarClientes();
    }
  }, [carregarClientes, isAdminEfficience, isAuthenticated, isLoading]);

  // O upload de extrato não tem endpoint de consulta por período — o estado só
  // existe enquanto durar esta sessão da página, por isso é limpo a cada troca
  // de cliente/período em vez de tentar recuperá-lo do backend.
  useEffect(() => {
    setExtrato(null);
    setErroUpload('');
  }, [clienteIdEfetivo, filtroMes, filtroAno]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    if (isAdminEfficience && !clienteId) {
      requisicaoIdRef.current += 1;
      setLancamentos([]);
      setIsLoadingLancamentos(false);
      setErroLancamentos('');
      setConciliacoes([]);
      setIsLoadingConciliacoes(false);
      setErroConciliacoes('');
      return;
    }

    carregarDados();
  }, [carregarDados, clienteId, isAdminEfficience, isAuthenticated, isLoading]);

  function abrirModalLancamento() {
    setFormData(FORM_INICIAL);
    setErroFormulario('');
    setIsModalLancamentoAberto(true);
  }

  function fecharModalLancamento() {
    if (isSavingLancamento) {
      return;
    }

    setIsModalLancamentoAberto(false);
    setErroFormulario('');
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((atual) => ({ ...atual, [name]: value }));
  }

  async function handleSubmitLancamento(event) {
    event.preventDefault();

    const descricao = formData.descricao.trim();
    const categoria = formData.categoria.trim();
    const valorNumero = Number(formData.valor);

    if (!formData.data_lancamento || !descricao) {
      setErroFormulario('Preencha data e descrição.');
      return;
    }

    if (!TIPOS_LANCAMENTO.some((item) => item.value === formData.tipo)) {
      setErroFormulario('Selecione um tipo válido.');
      return;
    }

    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setErroFormulario('Informe um valor válido maior que zero.');
      return;
    }

    if (!clienteIdEfetivo) {
      setErroFormulario('Selecione um cliente antes de adicionar o lançamento.');
      return;
    }

    setIsSavingLancamento(true);
    setErroFormulario('');

    try {
      const criado = await criarLancamentoContabil({
        cliente_id: clienteIdEfetivo,
        data_lancamento: formData.data_lancamento,
        descricao,
        tipo: formData.tipo,
        valor: valorNumero,
        ...(categoria ? { categoria } : {}),
      });

      // Invalida qualquer carregarDados() ainda em voo disparado antes desta
      // criação: sem isso, uma resposta antiga que só resolve depois (ex.:
      // troca de mês/ano ainda carregando) sobrescreve a lista e apaga o
      // lançamento recém-criado da tela, mesmo com ele já salvo no backend.
      requisicaoIdRef.current += 1;
      setLancamentos((atual) => [criado, ...atual]);
      setIsModalLancamentoAberto(false);
      setFormData(FORM_INICIAL);
    } catch (error) {
      setErroFormulario(obterMensagemErro(error, 'Não foi possível salvar o lançamento.'));
    } finally {
      setIsSavingLancamento(false);
    }
  }

  function abrirModalDelete(lancamento) {
    setLancamentoParaDeletar(lancamento);
    setErroDelete('');
    setIsDeleteModalAberto(true);
  }

  function fecharModalDelete() {
    if (isDeletingLancamento) {
      return;
    }

    setIsDeleteModalAberto(false);
    setLancamentoParaDeletar(null);
    setErroDelete('');
  }

  async function confirmarDeleteLancamento() {
    if (!lancamentoParaDeletar?.id) {
      return;
    }

    setIsDeletingLancamento(true);
    setErroDelete('');

    try {
      await deletarLancamentoContabil(lancamentoParaDeletar.id);

      // Mesma razão do criar: invalida um carregarDados() ainda em voo pra
      // ele não trazer de volta o lançamento que acabou de ser excluído.
      requisicaoIdRef.current += 1;
      setLancamentos((atual) => atual.filter((item) => item.id !== lancamentoParaDeletar.id));
      setIsDeleteModalAberto(false);
      setLancamentoParaDeletar(null);
    } catch (error) {
      setErroDelete(obterMensagemErro(error, 'Não foi possível excluir o lançamento.'));
    } finally {
      setIsDeletingLancamento(false);
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleArquivoSelecionado(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo) {
      return;
    }

    setIsUploadingExtrato(true);
    setErroUpload('');

    try {
      const resultado = await uploadExtrato(clienteIdEfetivo, arquivo, filtroMes, filtroAno);

      setExtrato({
        extratoId: resultado?.extrato_id,
        banco: resultado?.banco,
        conta: resultado?.conta,
        totalTransacoes: resultado?.total_transacoes ?? 0,
        enviadoEm: new Date().toISOString(),
      });
    } catch (error) {
      setErroUpload(obterMensagemErro(error, 'Não foi possível enviar o extrato bancário.'));
    } finally {
      setIsUploadingExtrato(false);
    }
  }

  async function handleNovaConciliacao() {
    if (!extrato?.extratoId) {
      return;
    }

    setIsIniciandoConciliacao(true);
    setErroIniciar('');

    try {
      const resultado = await iniciarConciliacao({
        clienteId: clienteIdEfetivo,
        extratoId: extrato.extratoId,
        mes: filtroMes,
        ano: filtroAno,
      });

      router.push(
        `/dashboard/conciliacao/${resultado.conciliacao_id}?clienteId=${encodeURIComponent(clienteIdEfetivo)}`,
      );
    } catch (error) {
      setErroIniciar(obterMensagemErro(error, 'Não foi possível iniciar a conciliação.'));
      setIsIniciandoConciliacao(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const aguardandoSelecaoCliente = isAdminEfficience && !clienteId;
  const podeIniciarConciliacao = Boolean(extrato?.extratoId) && lancamentos.length > 0;

  return (
    <>
      <main className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Conciliação Bancária</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Gerencie os lançamentos internos, envie o extrato bancário e inicie uma nova sessão de
            conciliação.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {isAdminEfficience ? (
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Cliente</span>
                <select
                  value={clienteId}
                  onChange={(event) => setClienteId(event.target.value)}
                  disabled={isLoadingClientes || Boolean(erroClientes)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {isLoadingClientes ? 'Carregando clientes...' : 'Selecione um cliente'}
                  </option>
                  {clientesOrdenados.map((cliente) => {
                    const id = obterIdCliente(cliente);
                    return (
                      <option key={id} value={id}>
                        {obterNomeCliente(cliente)}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Mês</span>
              <select
                value={filtroMes}
                onChange={(event) => setFiltroMes(Number(event.target.value))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {MESES.map((mes) => (
                  <option key={mes.value} value={mes.value}>
                    {mes.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Ano</span>
              <select
                value={filtroAno}
                onChange={(event) => setFiltroAno(Number(event.target.value))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {anosDisponiveis.map((ano) => (
                  <option key={ano} value={ano}>
                    {ano}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {erroClientes ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroClientes}</p>
          </section>
        ) : null}

        {aguardandoSelecaoCliente ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <p className="text-sm text-sky-900">Selecione um cliente para ver os dados de conciliação.</p>
          </section>
        ) : null}

        {!aguardandoSelecaoCliente ? (
          <>
            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <header className="flex flex-col gap-3 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Lançamentos Internos</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Registros contábeis do período selecionado.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={abrirModalLancamento}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                >
                  + Adicionar lançamento
                </button>
              </header>

              {erroLancamentos ? (
                <p className="m-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {erroLancamentos}
                </p>
              ) : null}

              {!erroLancamentos && isLoadingLancamentos ? (
                <div className="flex items-center gap-3 p-5 text-sm text-zinc-600">
                  <Spinner />
                  <span>Carregando lançamentos...</span>
                </div>
              ) : null}

              {!erroLancamentos && !isLoadingLancamentos && lancamentos.length === 0 ? (
                <p className="p-5 text-sm text-zinc-600">Nenhum lançamento cadastrado para o período.</p>
              ) : null}

              {!erroLancamentos && !isLoadingLancamentos && lancamentos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Conciliado?</th>
                        <th className="px-4 py-3">Ações</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {lancamentos.map((lancamento, index) => (
                        <tr key={lancamento?.id || `${lancamento?.descricao}-${index}`}>
                          <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                            {formatarData(lancamento?.data_lancamento)}
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{lancamento?.descricao || '-'}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${classeBadgeTipo(
                                lancamento?.tipo,
                              )}`}
                            >
                              {formatarTipoLancamento(lancamento?.tipo)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                            {formatarValor(lancamento?.valor)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                lancamento?.conciliado
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-zinc-100 text-zinc-700'
                              }`}
                            >
                              {lancamento?.conciliado ? 'Sim' : 'Não'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {!lancamento?.conciliado ? (
                              <button
                                type="button"
                                onClick={() => abrirModalDelete(lancamento)}
                                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                              >
                                Excluir
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Extrato Bancário</h2>

              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx"
                className="hidden"
                onChange={handleArquivoSelecionado}
              />

              {erroUpload ? (
                <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {erroUpload}
                </p>
              ) : null}

              {isUploadingExtrato ? (
                <div className="mt-4 flex items-center gap-3 text-sm text-zinc-600">
                  <Spinner />
                  <span>Processando...</span>
                </div>
              ) : extrato ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-emerald-700">
                    {extrato.totalTransacoes} transaç{extrato.totalTransacoes === 1 ? 'ão' : 'ões'} importada
                    {extrato.totalTransacoes === 1 ? '' : 's'}
                  </p>
                  <dl className="grid gap-2 text-sm text-zinc-700 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Banco</dt>
                      <dd className="font-medium">{extrato.banco || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Conta</dt>
                      <dd className="font-medium">{extrato.conta || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">Enviado em</dt>
                      <dd className="font-medium">{formatarDataHora(extrato.enviadoEm)}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
                  >
                    <UploadIcon />
                    Enviar novo extrato
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-500">
                    Nenhum extrato enviado para este período. Envie o arquivo OFX exportado do internet
                    banking para iniciar a conciliação.
                  </p>
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                  >
                    <UploadIcon />
                    Upload OFX
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <header className="flex flex-col gap-3 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Sessões de Conciliação</h2>
                  <p className="mt-1 text-sm text-zinc-500">Sessões anteriores do período selecionado.</p>
                </div>

                {podeIniciarConciliacao ? (
                  <button
                    type="button"
                    onClick={handleNovaConciliacao}
                    disabled={isIniciandoConciliacao}
                    className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isIniciandoConciliacao ? <Spinner /> : null}
                    {isIniciandoConciliacao ? 'Iniciando...' : 'Nova conciliação'}
                  </button>
                ) : null}
              </header>

              {erroIniciar ? (
                <p className="m-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {erroIniciar}
                </p>
              ) : null}

              {erroConciliacoes ? (
                <p className="m-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {erroConciliacoes}
                </p>
              ) : null}

              {!erroConciliacoes && isLoadingConciliacoes ? (
                <div className="flex items-center gap-3 p-5 text-sm text-zinc-600">
                  <Spinner />
                  <span>Carregando sessões...</span>
                </div>
              ) : null}

              {!erroConciliacoes && !isLoadingConciliacoes && conciliacoes.length === 0 ? (
                <p className="p-5 text-sm text-zinc-600">Nenhuma sessão de conciliação para o período.</p>
              ) : null}

              {!erroConciliacoes && !isLoadingConciliacoes && conciliacoes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Conciliadas / Total</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-zinc-100">
                      {conciliacoes.map((sessao) => {
                        const statusMeta = obterStatusConciliacaoMeta(sessao?.status);

                        return (
                          <tr key={sessao?.id}>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                              {formatarDataHora(sessao?.criado_em)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta.classes}`}
                              >
                                {statusMeta.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                              {sessao?.total_conciliadas ?? 0} / {sessao?.total_transacoes ?? 0}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <Link
                                href={`/dashboard/conciliacao/${sessao?.id}?clienteId=${encodeURIComponent(clienteIdEfetivo)}`}
                                className="text-sm font-medium text-sky-700 hover:underline"
                              >
                                Ver detalhes
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </main>

      {isModalLancamentoAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Novo lançamento</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Informe os dados do lançamento contábil interno.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalLancamento}
                disabled={isSavingLancamento}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar modal"
              >
                X
              </button>
            </header>

            <form className="space-y-4 p-5" onSubmit={handleSubmitLancamento}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="data_lancamento" className="block text-sm font-medium text-zinc-700">
                    Data
                  </label>
                  <input
                    id="data_lancamento"
                    name="data_lancamento"
                    type="date"
                    value={formData.data_lancamento}
                    onChange={handleFormChange}
                    disabled={isSavingLancamento}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="tipo" className="block text-sm font-medium text-zinc-700">
                    Tipo
                  </label>
                  <select
                    id="tipo"
                    name="tipo"
                    value={formData.tipo}
                    onChange={handleFormChange}
                    disabled={isSavingLancamento}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {TIPOS_LANCAMENTO.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="descricao" className="block text-sm font-medium text-zinc-700">
                    Descrição
                  </label>
                  <input
                    id="descricao"
                    name="descricao"
                    value={formData.descricao}
                    onChange={handleFormChange}
                    placeholder="Ex: Pagamento fornecedor ABC"
                    disabled={isSavingLancamento}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="valor" className="block text-sm font-medium text-zinc-700">
                    Valor
                  </label>
                  <input
                    id="valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.valor}
                    onChange={handleFormChange}
                    placeholder="0,00"
                    disabled={isSavingLancamento}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="categoria" className="block text-sm font-medium text-zinc-700">
                    Categoria (opcional)
                  </label>
                  <input
                    id="categoria"
                    name="categoria"
                    value={formData.categoria}
                    onChange={handleFormChange}
                    placeholder="Ex: fornecedor"
                    disabled={isSavingLancamento}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  onClick={fecharModalLancamento}
                  disabled={isSavingLancamento}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSavingLancamento}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingLancamento ? <Spinner /> : null}
                  {isSavingLancamento ? 'Salvando...' : 'Adicionar lançamento'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteModalAberto && lancamentoParaDeletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar exclusão</h2>
            <p className="mt-2 text-sm text-zinc-600">Deseja realmente excluir este lançamento?</p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              {lancamentoParaDeletar.descricao || '-'} — {formatarValor(lancamentoParaDeletar.valor)}
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
                disabled={isDeletingLancamento}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarDeleteLancamento}
                disabled={isDeletingLancamento}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingLancamento ? <Spinner /> : null}
                {isDeletingLancamento ? 'Excluindo...' : 'Excluir lançamento'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
