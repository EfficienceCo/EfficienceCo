'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { concluirEtapa, criar, listar } from '../../../services/processos.service';

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Não foi possível carregar os processos.'
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

function obterIdProcesso(processo) {
  return processo?.id || processo?.processo_id || processo?.processoId || null;
}

function obterTipoProcesso(processo) {
  return (
    processo?.tipo ||
    processo?.tipo_processo ||
    processo?.categoria ||
    processo?.tipoProcesso ||
    ''
  );
}

function obterStatusProcesso(processo) {
  return processo?.status || processo?.situacao || 'em_andamento';
}

function obterCampoEtapas(processo) {
  if (Array.isArray(processo?.etapas)) {
    return 'etapas';
  }

  if (Array.isArray(processo?.checklist)) {
    return 'checklist';
  }

  if (Array.isArray(processo?.fases)) {
    return 'fases';
  }

  return 'etapas';
}

function obterEtapas(processo) {
  if (Array.isArray(processo?.etapas)) {
    return processo.etapas;
  }

  if (Array.isArray(processo?.checklist)) {
    return processo.checklist;
  }

  if (Array.isArray(processo?.fases)) {
    return processo.fases;
  }

  return [];
}

function obterIdEtapa(etapa) {
  if (typeof etapa === 'string') {
    return null;
  }

  return etapa?.id || etapa?.etapa_id || etapa?.etapaId || etapa?.codigo || null;
}

function obterTituloEtapa(etapa, index = 0) {
  if (typeof etapa === 'string') {
    return etapa;
  }

  return (
    etapa?.nome ||
    etapa?.titulo ||
    etapa?.descricao ||
    etapa?.etapa ||
    `Etapa ${index + 1}`
  );
}

function etapaConcluida(etapa) {
  if (typeof etapa === 'string') {
    return false;
  }

  if (
    etapa?.concluida === true ||
    etapa?.concluido === true ||
    etapa?.finalizada === true ||
    etapa?.done === true ||
    etapa?.completa === true
  ) {
    return true;
  }

  const status = String(etapa?.status || etapa?.situacao || '').trim().toLowerCase();
  return status.includes('conclu') || status.includes('finaliz');
}

function obterResumoEtapas(processo) {
  const etapas = obterEtapas(processo);
  const totalPorCampo =
    Number(processo?.total_etapas) ||
    Number(processo?.etapas_total) ||
    Number(processo?.qtd_etapas) ||
    Number(processo?.quantidade_etapas);

  const concluidasPorCampo =
    Number(processo?.etapas_concluidas) ||
    Number(processo?.qtd_concluidas) ||
    Number(processo?.concluidas);

  const totalEtapas = Number.isFinite(totalPorCampo) && totalPorCampo > 0 ? totalPorCampo : etapas.length;
  const etapasConcluidas =
    Number.isFinite(concluidasPorCampo) && concluidasPorCampo >= 0
      ? concluidasPorCampo
      : etapas.filter((etapa) => etapaConcluida(etapa)).length;

  const percentual =
    totalEtapas > 0 ? Math.round((Math.min(etapasConcluidas, totalEtapas) / totalEtapas) * 100) : 0;

  return {
    totalEtapas,
    etapasConcluidas: Math.min(etapasConcluidas, totalEtapas),
    percentual,
  };
}

const ROTULOS_PT_BR = {
  admissao: 'Admissão',
  atrasado: 'Atrasado',
  contabil: 'Contábil',
  concluida: 'Concluída',
  concluido: 'Concluído',
  em_andamento: 'Em andamento',
  fiscal: 'Fiscal',
  folha_pagamento: 'Folha de pagamento',
  pendente: 'Pendente',
  rescisao: 'Rescisão',
  trabalhista: 'Trabalhista',
};

function formatarRotulo(valor) {
  if (!valor) {
    return '-';
  }

  const chave = String(valor).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (ROTULOS_PT_BR[chave]) {
    return ROTULOS_PT_BR[chave];
  }

  const texto = String(valor)
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  if (!texto) {
    return '-';
  }

  return texto
    .split(/\s+/)
    .map((parte) => `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`)
    .join(' ');
}

function classeBadgeStatus(status) {
  const statusNormalizado = String(status || '').toLowerCase();

  if (statusNormalizado.includes('conclu')) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (statusNormalizado.includes('atras')) {
    return 'bg-rose-100 text-rose-700';
  }

  if (statusNormalizado.includes('andamento') || statusNormalizado.includes('and')) {
    return 'bg-sky-100 text-sky-700';
  }

  return 'bg-amber-100 text-amber-800';
}

function tituloProcesso(processo, index) {
  return processo?.titulo || processo?.nome || processo?.descricao || `Processo ${index + 1}`;
}

function calcularTotalProcessos(payload, processos) {
  if (typeof payload?.total === 'number') {
    return payload.total;
  }

  if (typeof payload?.count === 'number') {
    return payload.count;
  }

  if (typeof payload?.total_processos === 'number') {
    return payload.total_processos;
  }

  return processos.length;
}

function aplicarAtualizacaoEtapaNaLista(lista, processoId, etapaId, concluida) {
  return lista.map((processo) => {
    if (String(obterIdProcesso(processo)) !== String(processoId)) {
      return processo;
    }

    const campoEtapas = obterCampoEtapas(processo);
    const etapas = obterEtapas(processo);
    const etapasAtualizadas = etapas.map((etapa, indice) => {
      if (String(obterIdEtapa(etapa)) !== String(etapaId)) {
        return etapa;
      }

      if (!etapa || typeof etapa !== 'object') {
        return etapa;
      }

      const etapaAtualizada = {
        ...etapa,
        concluida,
      };

      if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'concluido')) {
        etapaAtualizada.concluido = concluida;
      }

      if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'finalizada')) {
        etapaAtualizada.finalizada = concluida;
      }

      if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'done')) {
        etapaAtualizada.done = concluida;
      }

      if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'completa')) {
        etapaAtualizada.completa = concluida;
      }

      if (typeof etapaAtualizada.status === 'string') {
        etapaAtualizada.status = concluida ? 'concluida' : 'pendente';
      }

      return etapaAtualizada;
    });

    const processoAtualizado = {
      ...processo,
      [campoEtapas]: etapasAtualizadas,
    };

    if (typeof processoAtualizado.total_etapas === 'number') {
      processoAtualizado.total_etapas = etapasAtualizadas.length;
    }

    const concluidas = etapasAtualizadas.filter((etapa) => etapaConcluida(etapa)).length;

    if (typeof processoAtualizado.etapas_concluidas === 'number') {
      processoAtualizado.etapas_concluidas = concluidas;
    }

    if (typeof processoAtualizado.concluidas === 'number') {
      processoAtualizado.concluidas = concluidas;
    }

    return processoAtualizado;
  });
}

function extrairProcessoAtualizado(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.processo && typeof payload.processo === 'object') {
    return payload.processo;
  }

  if (payload.data && typeof payload.data === 'object') {
    if (payload.data.processo && typeof payload.data.processo === 'object') {
      return payload.data.processo;
    }

    if (
      payload.data.id ||
      payload.data.status ||
      payload.data.situacao ||
      Array.isArray(payload.data.etapas) ||
      Array.isArray(payload.data.checklist)
    ) {
      return payload.data;
    }
  }

  if (payload.id || payload.status || payload.situacao || Array.isArray(payload.etapas)) {
    return payload;
  }

  return null;
}

function atualizarProcessoNaLista(lista, processoId, processoAtualizado) {
  return lista.map((processo) => {
    if (String(obterIdProcesso(processo)) !== String(processoId)) {
      return processo;
    }

    return {
      ...processo,
      ...processoAtualizado,
    };
  });
}

const PERFIS_PODEM_MARCAR_ETAPA = new Set(['funcionario', 'admin_cliente', 'admin_efficience']);
const PERFIL_PODE_CRIAR_PROCESSO = 'admin_cliente';
const STATUS_OPCOES = [
  { value: '', label: 'Todos' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'pendente', label: 'Pendente' },
];
const TIPOS_PADRAO = [
  'folha_pagamento',
  'rescisao',
  'admissao',
  'fiscal',
  'contabil',
  'trabalhista',
];

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function ProcessosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [payload, setPayload] = useState(null);
  const [processos, setProcessos] = useState([]);
  const [isLoadingProcessos, setIsLoadingProcessos] = useState(true);
  const [erro, setErro] = useState('');

  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const [processosExpandidos, setProcessosExpandidos] = useState({});
  const [etapasEmAtualizacao, setEtapasEmAtualizacao] = useState({});

  const [isNovoModalAberto, setIsNovoModalAberto] = useState(false);
  const [novoTipoProcesso, setNovoTipoProcesso] = useState(TIPOS_PADRAO[0]);
  const [erroNovoProcesso, setErroNovoProcesso] = useState('');
  const [isCriandoProcesso, setIsCriandoProcesso] = useState(false);

  const perfilUsuario = String(user?.perfil || '').trim();
  const podeCriarProcesso = perfilUsuario === PERFIL_PODE_CRIAR_PROCESSO;
  const podeMarcarEtapa = !perfilUsuario || PERFIS_PODEM_MARCAR_ETAPA.has(perfilUsuario);

  const carregarProcessos = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) {
        setIsLoadingProcessos(true);
      }

      setErro('');

      try {
        const data = await listar({
          ...(filtroStatus ? { status: filtroStatus } : {}),
          ...(filtroTipo ? { tipo: filtroTipo } : {}),
        });

        setPayload(data);
        setProcessos(normalizarProcessos(data));
      } catch (error) {
        setErro(obterMensagemErro(error));
      } finally {
        if (!silencioso) {
          setIsLoadingProcessos(false);
        }
      }
    },
    [filtroStatus, filtroTipo],
  );

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

  const tiposDisponiveis = useMemo(() => {
    const tipos = new Set(TIPOS_PADRAO);

    processos.forEach((processo) => {
      const tipo = String(obterTipoProcesso(processo) || '').trim();

      if (tipo) {
        tipos.add(tipo);
      }
    });

    return Array.from(tipos).sort((tipoA, tipoB) =>
      tipoA.localeCompare(tipoB, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [processos]);

  const totalProcessos = useMemo(() => calcularTotalProcessos(payload, processos), [payload, processos]);

  const totalConcluidos = useMemo(
    () =>
      processos.filter((processo) =>
        String(obterStatusProcesso(processo)).trim().toLowerCase().includes('conclu'),
      ).length,
    [processos],
  );

  function alternarExpansao(chave) {
    setProcessosExpandidos((valorAtual) => ({
      ...valorAtual,
      [chave]: !valorAtual[chave],
    }));
  }

  function abrirModalNovoProcesso() {
    setNovoTipoProcesso(tiposDisponiveis[0] || TIPOS_PADRAO[0]);
    setErroNovoProcesso('');
    setIsNovoModalAberto(true);
  }

  function fecharModalNovoProcesso() {
    if (isCriandoProcesso) {
      return;
    }

    setIsNovoModalAberto(false);
    setErroNovoProcesso('');
  }

  async function handleCriarProcesso(event) {
    event.preventDefault();

    if (!novoTipoProcesso) {
      setErroNovoProcesso('Selecione um tipo de processo.');
      return;
    }

    setIsCriandoProcesso(true);
    setErroNovoProcesso('');

    try {
      await criar({ tipo: novoTipoProcesso });
      setIsNovoModalAberto(false);
      await carregarProcessos();
    } catch (error) {
      setErroNovoProcesso(obterMensagemErro(error, 'Não foi possível criar o processo.'));
    } finally {
      setIsCriandoProcesso(false);
    }
  }

  async function handleToggleEtapa(processo, etapa, concluida) {
    if (!podeMarcarEtapa) {
      return;
    }

    const processoId = obterIdProcesso(processo);
    const etapaId = obterIdEtapa(etapa);

    if (processoId === null || processoId === undefined || processoId === '') {
      return;
    }

    if (etapaId === null || etapaId === undefined || etapaId === '') {
      return;
    }

    const chaveAtualizacao = `${processoId}::${etapaId}`;

    setEtapasEmAtualizacao((valorAtual) => ({
      ...valorAtual,
      [chaveAtualizacao]: true,
    }));

    setErro('');
    setProcessos((valorAtual) =>
      aplicarAtualizacaoEtapaNaLista(valorAtual, processoId, etapaId, concluida),
    );

    try {
      const retorno = await concluirEtapa(processoId, etapaId, { concluida });
      const processoAtualizado = extrairProcessoAtualizado(retorno);

      if (processoAtualizado) {
        setProcessos((valorAtual) =>
          atualizarProcessoNaLista(valorAtual, processoId, processoAtualizado),
        );
      }

      await carregarProcessos({ silencioso: true });
    } catch (error) {
      setErro(obterMensagemErro(error, 'Não foi possível atualizar a etapa.'));
      await carregarProcessos({ silencioso: true });
    } finally {
      setEtapasEmAtualizacao((valorAtual) => {
        const proximo = { ...valorAtual };
        delete proximo[chaveAtualizacao];
        return proximo;
      });
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
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Processos</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Checklist operacional para acompanhar o progresso em cada etapa.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {podeCriarProcesso ? (
              <button
                type="button"
                onClick={abrirModalNovoProcesso}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Novo processo
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => carregarProcessos()}
              disabled={isLoadingProcessos}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingProcessos ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {perfilUsuario && !podeCriarProcesso ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="text-sm text-sky-900">
              Criação de novos processos disponível apenas para o perfil admin_cliente.
            </p>
          </section>
        ) : null}

        {perfilUsuario && !podeMarcarEtapa ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-sm text-amber-900">
              Seu perfil está em modo leitura para etapas. Somente funcionários e administradores
              podem marcar progresso.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Tipo</span>
                <select
                  value={filtroTipo}
                  onChange={(event) => setFiltroTipo(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                >
                  <option value="">Todos</option>
                  {tiposDisponiveis.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {formatarRotulo(tipo)}
                    </option>
                  ))}
                </select>
              </label>

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
            </div>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Total na lista
            </p>
            <p className="mt-2 text-4xl font-bold leading-none text-zinc-900">{totalProcessos}</p>
            <p className="mt-2 text-xs text-zinc-600">{totalConcluidos} concluídos nos filtros.</p>
          </article>
        </section>

        {erro ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erro}</p>
          </section>
        ) : null}

        {!erro && isLoadingProcessos ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando processos...</span>
            </div>
          </section>
        ) : null}

        {!erro && !isLoadingProcessos && processos.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Nenhum processo encontrado para os filtros ativos.</p>
          </section>
        ) : null}

        {!erro && !isLoadingProcessos && processos.length > 0 ? (
          <section className="space-y-3">
            {processos.map((processo, index) => {
              const processoId = obterIdProcesso(processo);
              const chaveProcesso = processoId ? String(processoId) : `idx-${index}`;
              const statusProcesso = obterStatusProcesso(processo);
              const tipoProcesso = obterTipoProcesso(processo);
              const etapas = obterEtapas(processo);
              const { totalEtapas, etapasConcluidas, percentual } = obterResumoEtapas(processo);
              const expandido = Boolean(processosExpandidos[chaveProcesso]);

              return (
                <article
                  key={chaveProcesso}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <h2 className="text-base font-semibold text-zinc-900">
                        {tituloProcesso(processo, index)}
                      </h2>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                          Tipo: {formatarRotulo(tipoProcesso)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 font-medium ${classeBadgeStatus(
                            statusProcesso,
                          )}`}
                        >
                          Status: {formatarRotulo(statusProcesso)}
                        </span>
                      </div>

                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-medium text-zinc-600">
                          {etapasConcluidas} de {totalEtapas} etapas
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-full max-w-xl overflow-hidden rounded-full bg-zinc-200">
                            <div
                              className="h-full rounded-full bg-zinc-800 transition-all"
                              style={{ width: `${percentual}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-zinc-600">{percentual}%</span>
                        </div>
                      </div>
                    </div>

                    {etapas.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => alternarExpansao(chaveProcesso)}
                        className="self-start rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        {expandido ? 'Ocultar etapas' : 'Ver etapas'}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">Sem etapas cadastradas</span>
                    )}
                  </header>

                  {expandido ? (
                    <div className="mt-4 border-t border-zinc-100 pt-4">
                      <ul className="space-y-2">
                        {etapas.map((etapa, etapaIndex) => {
                          const etapaId = obterIdEtapa(etapa);
                          const chaveAtualizacao = processoId ? `${processoId}::${etapaId}` : null;
                          const atualizandoEtapa = chaveAtualizacao
                            ? Boolean(etapasEmAtualizacao[chaveAtualizacao])
                            : false;
                          const concluida = etapaConcluida(etapa);
                          const bloqueado =
                            !podeMarcarEtapa || !processoId || !etapaId || atualizandoEtapa;

                          return (
                            <li
                              key={etapaId || `${chaveProcesso}-etapa-${etapaIndex}`}
                              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                            >
                              <label className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={concluida}
                                    disabled={bloqueado}
                                    onChange={(event) =>
                                      handleToggleEtapa(processo, etapa, event.target.checked)
                                    }
                                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                                  />
                                  <span
                                    className={`text-sm ${
                                      concluida
                                        ? 'text-zinc-500 line-through'
                                        : 'text-zinc-800'
                                    }`}
                                  >
                                    {obterTituloEtapa(etapa, etapaIndex)}
                                  </span>
                                </div>

                                {atualizandoEtapa ? (
                                  <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                                    <Spinner />
                                    <span>Salvando...</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-500">
                                    {concluida ? 'Concluída' : 'Pendente'}
                                  </span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : null}
      </main>

      {isNovoModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Novo processo</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Selecione o tipo para iniciar o checklist do processo.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalNovoProcesso}
                disabled={isCriandoProcesso}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar modal"
              >
                X
              </button>
            </header>

            <form className="space-y-4 p-5" onSubmit={handleCriarProcesso}>
              <label className="space-y-2">
                <span className="block text-sm font-medium text-zinc-700">Tipo de processo</span>
                <select
                  value={novoTipoProcesso}
                  onChange={(event) => setNovoTipoProcesso(event.target.value)}
                  disabled={isCriandoProcesso}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                >
                  {tiposDisponiveis.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {formatarRotulo(tipo)}
                    </option>
                  ))}
                </select>
              </label>

              {erroNovoProcesso ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {erroNovoProcesso}
                </p>
              ) : null}

              <footer className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={fecharModalNovoProcesso}
                  disabled={isCriandoProcesso}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isCriandoProcesso}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCriandoProcesso ? <Spinner /> : null}
                  {isCriandoProcesso ? 'Criando...' : 'Criar processo'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
