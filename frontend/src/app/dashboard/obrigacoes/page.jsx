'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  atualizar as atualizarObrigacao,
  criar as criarObrigacao,
  deletar as deletarObrigacao,
  listar as listarObrigacoes,
} from '../../../services/obrigacoes.service';

const PERFIS_AUTORIZADOS = new Set(['admin_cliente', 'admin_efficience']);
const TIPO_OPCOES = ['mensal', 'anual', 'eventual'];
const STATUS_OPCOES = [
  { value: '', label: 'Todos' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'concluida', label: 'Concluida' },
  { value: 'atrasada', label: 'Atrasada' },
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const FORM_INICIAL = {
  nome: '',
  tipo: TIPO_OPCOES[0],
  data_vencimento: '',
  recorrente: false,
};

function obterMensagemErro(error, fallback = 'Nao foi possivel processar a solicitacao.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
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

function obterDataVencimento(obrigacao) {
  return (
    obrigacao?.data_vencimento ||
    obrigacao?.vencimento ||
    obrigacao?.prazo ||
    obrigacao?.data ||
    ''
  );
}

function parseDataLocal(data) {
  if (!data) {
    return null;
  }

  if (data instanceof Date) {
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const dataTexto = String(data).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataTexto);

  if (match) {
    const ano = Number.parseInt(match[1], 10);
    const mes = Number.parseInt(match[2], 10) - 1;
    const dia = Number.parseInt(match[3], 10);
    const valor = new Date(ano, mes, dia);
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  const tentativa = new Date(data);
  return Number.isNaN(tentativa.getTime()) ? null : tentativa;
}

function dataParaChave(data) {
  if (!data) {
    return '';
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

function obterInicioHoje() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
}

function obterStatusObrigacao(obrigacao) {
  const statusOriginal = String(obrigacao?.status || obrigacao?.situacao || '')
    .trim()
    .toLowerCase();

  if (statusOriginal.includes('conclu')) {
    return 'concluida';
  }

  if (statusOriginal.includes('atras')) {
    return 'atrasada';
  }

  if (statusOriginal.includes('pend')) {
    return 'pendente';
  }

  const dataVencimento = parseDataLocal(obterDataVencimento(obrigacao));
  if (dataVencimento && dataVencimento.getTime() < obterInicioHoje().getTime()) {
    return 'atrasada';
  }

  return 'pendente';
}

function formatarData(data) {
  const valor = parseDataLocal(data);

  if (!valor) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function formatarDataInput(data) {
  const valor = parseDataLocal(data);
  return valor ? dataParaChave(valor) : '';
}

function obrigacaoParaFormulario(obrigacao) {
  return {
    nome: obrigacao?.nome || obrigacao?.titulo || '',
    tipo: obrigacao?.tipo || TIPO_OPCOES[0],
    data_vencimento: formatarDataInput(obterDataVencimento(obrigacao)),
    recorrente: Boolean(obrigacao?.recorrente),
  };
}

function obterTituloObrigacao(obrigacao, index) {
  return (
    obrigacao?.nome ||
    obrigacao?.titulo ||
    obrigacao?.descricao ||
    obrigacao?.tipo ||
    `Obrigacao ${index + 1}`
  );
}

function formatarTipo(tipo) {
  if (!tipo) {
    return '-';
  }

  return `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}`;
}

function formatarStatus(status) {
  if (status === 'concluida') {
    return 'Concluida';
  }

  if (status === 'atrasada') {
    return 'Atrasada';
  }

  return 'Pendente';
}

function classeBadgeStatus(status) {
  if (status === 'concluida') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'atrasada') {
    return 'bg-rose-100 text-rose-700';
  }

  return 'bg-amber-100 text-amber-800';
}

function obterMesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function resolverMesAno(valorMes) {
  if (typeof valorMes === 'string' && /^\d{4}-\d{2}$/.test(valorMes)) {
    const [anoTexto, mesTexto] = valorMes.split('-');
    return {
      ano: Number.parseInt(anoTexto, 10),
      mes: Number.parseInt(mesTexto, 10),
    };
  }

  const hoje = new Date();
  return {
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
  };
}

function construirDiasCalendario(ano, mes) {
  const dias = [];
  const primeiroDiaMes = new Date(ano, mes - 1, 1);
  const totalDiasMes = new Date(ano, mes, 0).getDate();
  const deslocamentoInicio = primeiroDiaMes.getDay();

  for (let indice = deslocamentoInicio; indice > 0; indice -= 1) {
    const data = new Date(ano, mes - 1, 1 - indice);
    dias.push({
      data,
      chave: dataParaChave(data),
      foraDoMes: true,
    });
  }

  for (let dia = 1; dia <= totalDiasMes; dia += 1) {
    const data = new Date(ano, mes - 1, dia);
    dias.push({
      data,
      chave: dataParaChave(data),
      foraDoMes: false,
    });
  }

  const totalCelulas = Math.ceil(dias.length / 7) * 7;

  for (let indice = 1; dias.length < totalCelulas; indice += 1) {
    const data = new Date(ano, mes - 1, totalDiasMes + indice);
    dias.push({
      data,
      chave: dataParaChave(data),
      foraDoMes: true,
    });
  }

  return dias;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function ObrigacoesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroMes, setFiltroMes] = useState(obterMesAtual);

  const [obrigacoes, setObrigacoes] = useState([]);
  const [totalAtrasadas, setTotalAtrasadas] = useState(0);
  const [isLoadingObrigacoes, setIsLoadingObrigacoes] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [isFormModalAberto, setIsFormModalAberto] = useState(false);
  const [modoFormulario, setModoFormulario] = useState('criar');
  const [obrigacaoEditandoId, setObrigacaoEditandoId] = useState(null);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [erroFormulario, setErroFormulario] = useState('');
  const [isSavingFormulario, setIsSavingFormulario] = useState(false);

  const [obrigacaoParaDeletar, setObrigacaoParaDeletar] = useState(null);
  const [isDeleteModalAberto, setIsDeleteModalAberto] = useState(false);
  const [erroDelete, setErroDelete] = useState('');
  const [isDeletingObrigacao, setIsDeletingObrigacao] = useState(false);

  const [statusEmAtualizacao, setStatusEmAtualizacao] = useState({});

  const podeGerenciarObrigacoes = PERFIS_AUTORIZADOS.has(user?.perfil);
  const filtroMesAno = useMemo(() => resolverMesAno(filtroMes), [filtroMes]);

  const carregarObrigacoes = useCallback(async () => {
    const paramsMes = {
      mes: filtroMesAno.mes,
      ano: filtroMesAno.ano,
    };

    setIsLoadingObrigacoes(true);
    setErroLista('');

    try {
      const [listaFiltrada, listaCompletaMes] = await Promise.all([
        listarObrigacoes({
          ...paramsMes,
          ...(filtroStatus ? { status: filtroStatus } : {}),
        }),
        listarObrigacoes(paramsMes),
      ]);

      const obrigacoesFiltradas = normalizarObrigacoes(listaFiltrada);
      const obrigacoesMes = normalizarObrigacoes(listaCompletaMes);
      const atrasadasDoMes = obrigacoesMes.filter(
        (obrigacao) => obterStatusObrigacao(obrigacao) === 'atrasada',
      ).length;

      setObrigacoes(obrigacoesFiltradas);
      setTotalAtrasadas(atrasadasDoMes);
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel carregar as obrigacoes.'));
    } finally {
      setIsLoadingObrigacoes(false);
    }
  }, [filtroMesAno.ano, filtroMesAno.mes, filtroStatus]);

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

  const resumoPorDia = useMemo(() => {
    const mapa = {};

    obrigacoes.forEach((obrigacao) => {
      const data = parseDataLocal(obterDataVencimento(obrigacao));
      if (!data) {
        return;
      }

      const chave = dataParaChave(data);
      if (!mapa[chave]) {
        mapa[chave] = {
          total: 0,
          atrasadas: 0,
          concluidas: 0,
          pendentes: 0,
        };
      }

      const status = obterStatusObrigacao(obrigacao);
      mapa[chave].total += 1;

      if (status === 'atrasada') {
        mapa[chave].atrasadas += 1;
        return;
      }

      if (status === 'concluida') {
        mapa[chave].concluidas += 1;
        return;
      }

      mapa[chave].pendentes += 1;
    });

    return mapa;
  }, [obrigacoes]);

  const diasCalendario = useMemo(
    () => construirDiasCalendario(filtroMesAno.ano, filtroMesAno.mes),
    [filtroMesAno.ano, filtroMesAno.mes],
  );

  const tituloMesCalendario = useMemo(() => {
    const data = new Date(filtroMesAno.ano, filtroMesAno.mes - 1, 1);
    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(data);
  }, [filtroMesAno.ano, filtroMesAno.mes]);

  function abrirModalCriacao() {
    setModoFormulario('criar');
    setObrigacaoEditandoId(null);
    setFormData(FORM_INICIAL);
    setErroFormulario('');
    setIsFormModalAberto(true);
  }

  function abrirModalEdicao(obrigacao) {
    setModoFormulario('editar');
    setObrigacaoEditandoId(obrigacao?.id || null);
    setFormData(obrigacaoParaFormulario(obrigacao));
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

    setFormData((valorAtual) => ({
      ...valorAtual,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleSubmitFormulario(event) {
    event.preventDefault();

    const nome = formData.nome.trim();

    if (!nome || !formData.tipo || !formData.data_vencimento) {
      setErroFormulario('Preencha nome, tipo e data de vencimento.');
      return;
    }

    setIsSavingFormulario(true);
    setErroFormulario('');

    const payload = {
      nome,
      tipo: formData.tipo,
      data_vencimento: formData.data_vencimento,
      recorrente: Boolean(formData.recorrente),
    };

    try {
      if (modoFormulario === 'criar') {
        await criarObrigacao(payload);
      } else if (obrigacaoEditandoId) {
        await atualizarObrigacao(obrigacaoEditandoId, payload);
      }

      setIsFormModalAberto(false);
      setFormData(FORM_INICIAL);
      setObrigacaoEditandoId(null);
      await carregarObrigacoes();
    } catch (error) {
      setErroFormulario(obterMensagemErro(error));
    } finally {
      setIsSavingFormulario(false);
    }
  }

  async function handleMarcarConcluida(obrigacao) {
    if (!obrigacao?.id) {
      return;
    }

    setStatusEmAtualizacao((valorAtual) => ({
      ...valorAtual,
      [obrigacao.id]: true,
    }));

    try {
      await atualizarObrigacao(obrigacao.id, { status: 'concluida' });
      await carregarObrigacoes();
    } catch (error) {
      setErroLista(obterMensagemErro(error, 'Nao foi possivel atualizar o status.'));
    } finally {
      setStatusEmAtualizacao((valorAtual) => {
        const proximo = { ...valorAtual };
        delete proximo[obrigacao.id];
        return proximo;
      });
    }
  }

  function abrirModalDelete(obrigacao) {
    setObrigacaoParaDeletar(obrigacao);
    setErroDelete('');
    setIsDeleteModalAberto(true);
  }

  function fecharModalDelete() {
    if (isDeletingObrigacao) {
      return;
    }

    setIsDeleteModalAberto(false);
    setObrigacaoParaDeletar(null);
    setErroDelete('');
  }

  async function confirmarDeleteObrigacao() {
    if (!obrigacaoParaDeletar?.id) {
      return;
    }

    setIsDeletingObrigacao(true);
    setErroDelete('');

    try {
      await deletarObrigacao(obrigacaoParaDeletar.id);
      setIsDeleteModalAberto(false);
      setObrigacaoParaDeletar(null);
      await carregarObrigacoes();
    } catch (error) {
      setErroDelete(obterMensagemErro(error, 'Nao foi possivel deletar a obrigacao.'));
    } finally {
      setIsDeletingObrigacao(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <main className="space-y-6 p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Obrigacoes</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Visao consolidada de vencimentos para substituir planilhas e lembretes manuais.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {podeGerenciarObrigacoes ? (
              <button
                type="button"
                onClick={abrirModalCriacao}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Nova obrigacao
              </button>
            ) : null}

            <button
              type="button"
              onClick={carregarObrigacoes}
              disabled={isLoadingObrigacoes}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingObrigacoes ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {!podeGerenciarObrigacoes ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="text-sm text-sky-900">
              Seu perfil esta em modo leitura para obrigacoes. Acoes de criar, editar e concluir
              ficam disponiveis apenas para administradores.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Status</span>
                <select
                  value={filtroStatus}
                  onChange={(event) => setFiltroStatus(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                >
                  {STATUS_OPCOES.map((opcao) => (
                    <option key={opcao.value || 'todos'} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Mes</span>
                <input
                  type="month"
                  value={filtroMes}
                  onChange={(event) => setFiltroMes(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                />
              </label>
            </div>
          </article>

          <article className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Total atrasadas
            </p>
            <p className="mt-2 text-4xl font-bold leading-none text-rose-800">{totalAtrasadas}</p>
            <p className="mt-2 text-xs text-rose-700">No mes selecionado.</p>
          </article>
        </section>

        {erroLista ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroLista}</p>
          </section>
        ) : null}

        {!erroLista ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Calendario do mes</h2>
                <p className="text-sm text-zinc-500">{tituloMesCalendario}</p>
              </div>
            </header>

            <div className="grid grid-cols-7 gap-2">
              {DIAS_SEMANA.map((dia) => (
                <div key={dia} className="px-1 text-center text-xs font-semibold text-zinc-500">
                  {dia}
                </div>
              ))}

              {diasCalendario.map((diaInfo) => {
                const resumo = resumoPorDia[diaInfo.chave];
                const possuiAtrasadas = (resumo?.atrasadas || 0) > 0;
                const somenteConcluidas =
                  (resumo?.total || 0) > 0 && resumo.total === resumo.concluidas;
                const ehHoje = diaInfo.chave === dataParaChave(obterInicioHoje());

                const classesEstado = diaInfo.foraDoMes
                  ? 'border-zinc-100 bg-zinc-50 text-zinc-400'
                  : possuiAtrasadas
                    ? 'border-rose-200 bg-rose-50 text-rose-900'
                    : somenteConcluidas
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : resumo?.total
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-zinc-200 bg-white text-zinc-700';

                return (
                  <div
                    key={`${diaInfo.chave}-${diaInfo.foraDoMes ? 'fora' : 'mes'}`}
                    className={`min-h-[86px] rounded-lg border p-2 ${classesEstado} ${
                      ehHoje ? 'ring-2 ring-zinc-300 ring-offset-1' : ''
                    }`}
                  >
                    <p className="text-right text-xs font-semibold">{diaInfo.data.getDate()}</p>

                    {resumo?.total ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] font-semibold">
                          {resumo.total} vencimento{resumo.total > 1 ? 's' : ''}
                        </p>
                        {resumo.atrasadas > 0 ? (
                          <p className="text-[11px] font-medium text-rose-700">
                            {resumo.atrasadas} atrasada{resumo.atrasadas > 1 ? 's' : ''}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {!erroLista && isLoadingObrigacoes ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando obrigacoes...</span>
            </div>
          </section>
        ) : null}

        {!erroLista && !isLoadingObrigacoes && obrigacoes.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">
              Nenhuma obrigacao encontrada para os filtros ativos.
            </p>
          </section>
        ) : null}

        {!erroLista && !isLoadingObrigacoes && obrigacoes.length > 0 ? (
          <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Obrigacao</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Recorrente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {obrigacoes.map((obrigacao, index) => {
                  const status = obterStatusObrigacao(obrigacao);
                  const atualizandoStatus = Boolean(statusEmAtualizacao[obrigacao.id]);
                  const linhaAtrasada = status === 'atrasada';

                  return (
                    <tr
                      key={obrigacao?.id || `${obterTituloObrigacao(obrigacao, index)}-${index}`}
                      className={linhaAtrasada ? 'bg-rose-50/50' : ''}
                    >
                      <td className="max-w-[260px] break-words px-4 py-3 font-medium text-zinc-900">
                        {obterTituloObrigacao(obrigacao, index)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {formatarTipo(obrigacao?.tipo)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {formatarData(obterDataVencimento(obrigacao))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                        {obrigacao?.recorrente ? 'Sim' : 'Nao'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${classeBadgeStatus(
                            status,
                          )}`}
                        >
                          {formatarStatus(status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {podeGerenciarObrigacoes ? (
                          <div className="flex flex-wrap gap-2">
                            {status !== 'concluida' ? (
                              <button
                                type="button"
                                onClick={() => handleMarcarConcluida(obrigacao)}
                                disabled={atualizandoStatus}
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {atualizandoStatus ? 'Salvando...' : 'Marcar concluida'}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => abrirModalEdicao(obrigacao)}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => abrirModalDelete(obrigacao)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                            >
                              Deletar
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">Somente leitura</span>
                        )}
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
                  {modoFormulario === 'criar' ? 'Nova obrigacao' : 'Editar obrigacao'}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Informe nome, tipo, vencimento e recorrencia da obrigacao.
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
                    placeholder="Ex: DAS abril"
                    disabled={isSavingFormulario}
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
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  >
                    {TIPO_OPCOES.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {formatarTipo(tipo)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="data_vencimento"
                    className="block text-sm font-medium text-zinc-700"
                  >
                    Data de vencimento
                  </label>
                  <input
                    id="data_vencimento"
                    name="data_vencimento"
                    type="date"
                    value={formData.data_vencimento}
                    onChange={handleFormChange}
                    disabled={isSavingFormulario}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="recorrente"
                      checked={Boolean(formData.recorrente)}
                      onChange={handleFormChange}
                      disabled={isSavingFormulario}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
                    />
                    Obrigacao recorrente
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
                      ? 'Criar obrigacao'
                      : 'Salvar alteracoes'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {isDeleteModalAberto && obrigacaoParaDeletar ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar exclusao</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Deseja realmente deletar esta obrigacao?
            </p>
            <p className="mt-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              {obrigacaoParaDeletar.nome || obrigacaoParaDeletar.titulo || '-'}
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
                disabled={isDeletingObrigacao}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarDeleteObrigacao}
                disabled={isDeletingObrigacao}
                className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingObrigacao ? <Spinner /> : null}
                {isDeletingObrigacao ? 'Deletando...' : 'Deletar obrigacao'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
