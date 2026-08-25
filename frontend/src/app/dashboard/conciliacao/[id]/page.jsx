'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import {
  buscarConciliacao,
  concluirConciliacao,
  confirmarPar,
  downloadRelatorio,
  rejeitarPar,
} from '../../../../services/conciliacao.service';

const MESES_LABEL = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
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

function obterStatusConciliacaoMeta(status) {
  return (
    STATUS_CONCILIACAO_META[status] || {
      label: status || '-',
      classes: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
    }
  );
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

function formatarValor(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

// valor do par prioriza a transação bancária — mesmo critério usado no relatório
// PDF (conciliacoes.controller.js, gerarRelatorioConciliacao).
function valorDoPar(par) {
  return par?.transacao?.valor ?? par?.lancamento?.valor ?? null;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

function TabelaPares({ pares, mostrarAcoes, onConfirmar, onRejeitar, pareEmAcao }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
          <tr>
            <th className="px-4 py-3">Data banco</th>
            <th className="px-4 py-3">Descrição banco</th>
            <th className="px-4 py-3">Data lançamento</th>
            <th className="px-4 py-3">Descrição lançamento</th>
            <th className="px-4 py-3">Valor</th>
            {mostrarAcoes ? <th className="px-4 py-3">Ações</th> : null}
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {pares.map((par) => {
            const emAcao = pareEmAcao === par.id;

            return (
              <tr key={par.id}>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                  {formatarData(par.transacao?.data_lancamento)}
                </td>
                <td className="px-4 py-3 text-zinc-700">{par.transacao?.descricao || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                  {formatarData(par.lancamento?.data_lancamento)}
                </td>
                <td className="px-4 py-3 text-zinc-700">{par.lancamento?.descricao || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                  {formatarValor(valorDoPar(par))}
                </td>
                {mostrarAcoes ? (
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirmar(par)}
                        disabled={emAcao}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {emAcao ? <Spinner /> : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejeitar(par)}
                        disabled={emAcao}
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {emAcao ? <Spinner /> : 'Rejeitar'}
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConciliacaoDetalheContent({ id }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteId = searchParams.get('clienteId') || undefined;
  const { isAuthenticated, isLoading } = useAuth();

  const [conciliacao, setConciliacao] = useState(null);
  const [pares, setPares] = useState({ automatico: [], provavel: [], semPar: [] });
  const [isLoadingConciliacao, setIsLoadingConciliacao] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');

  const [automaticoAberto, setAutomaticoAberto] = useState(false);

  const [pareEmAcao, setPareEmAcao] = useState(null);
  const [erroAcaoPar, setErroAcaoPar] = useState('');

  const [isConcluirModalAberto, setIsConcluirModalAberto] = useState(false);
  const [isConcluindo, setIsConcluindo] = useState(false);
  const [erroConcluir, setErroConcluir] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [erroDownload, setErroDownload] = useState('');

  const carregarConciliacao = useCallback(async () => {
    setIsLoadingConciliacao(true);
    setErroCarregar('');

    try {
      const data = await buscarConciliacao(id, { clienteId });

      setConciliacao({
        id: data?.id,
        status: data?.status,
        mes: data?.mes,
        ano: data?.ano,
        extrato: data?.extrato ?? null,
        totalTransacoes: data?.total_transacoes ?? 0,
      });
      setPares({
        automatico: data?.pares?.automatico ?? [],
        provavel: data?.pares?.provavel ?? [],
        semPar: data?.pares?.sem_par ?? [],
      });
    } catch (error) {
      setErroCarregar(obterMensagemErro(error, 'Não foi possível carregar a conciliação.'));
    } finally {
      setIsLoadingConciliacao(false);
    }
  }, [id, clienteId]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarConciliacao();
    }
  }, [carregarConciliacao, isAuthenticated, isLoading]);

  const totalConciliadas = pares.automatico.length;
  const totalTransacoes = conciliacao?.totalTransacoes ?? 0;
  const percentual =
    totalTransacoes > 0 ? Math.round((totalConciliadas / totalTransacoes) * 100) : 0;
  const provaveisRestantes = pares.provavel.length;
  const podeConcluir = conciliacao?.status === 'em_andamento' && provaveisRestantes === 0;

  const transacoesSemLancamento = useMemo(
    () => pares.semPar.filter((par) => par.transacao),
    [pares.semPar],
  );
  const lancamentosSemTransacao = useMemo(
    () => pares.semPar.filter((par) => par.lancamento),
    [pares.semPar],
  );

  async function handleConfirmar(par) {
    setPareEmAcao(par.id);
    setErroAcaoPar('');

    try {
      await confirmarPar(id, par.id, { clienteId });

      setPares((atual) => ({
        ...atual,
        provavel: atual.provavel.filter((item) => item.id !== par.id),
        automatico: [...atual.automatico, par],
      }));
    } catch (error) {
      setErroAcaoPar(obterMensagemErro(error, 'Não foi possível confirmar o par.'));
    } finally {
      setPareEmAcao(null);
    }
  }

  async function handleRejeitar(par) {
    setPareEmAcao(par.id);
    setErroAcaoPar('');

    try {
      await rejeitarPar(id, par.id, { clienteId });

      setPares((atual) => ({
        ...atual,
        provavel: atual.provavel.filter((item) => item.id !== par.id),
        semPar: [...atual.semPar, { ...par, lancamento: null }],
      }));
    } catch (error) {
      setErroAcaoPar(obterMensagemErro(error, 'Não foi possível rejeitar o par.'));
    } finally {
      setPareEmAcao(null);
    }
  }

  async function confirmarConclusao() {
    setIsConcluindo(true);
    setErroConcluir('');

    try {
      await concluirConciliacao(id, { clienteId });

      setConciliacao((atual) => (atual ? { ...atual, status: 'concluida' } : atual));
      setIsConcluirModalAberto(false);
    } catch (error) {
      setErroConcluir(obterMensagemErro(error, 'Não foi possível concluir a conciliação.'));
    } finally {
      setIsConcluindo(false);
    }
  }

  async function handleDownload() {
    setIsDownloading(true);
    setErroDownload('');

    try {
      const blob = await downloadRelatorio(id, { clienteId });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `conciliacao-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErroDownload(obterMensagemErro(error, 'Não foi possível baixar o relatório.'));
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading) {
    return <p className="p-6">Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const statusMeta = obterStatusConciliacaoMeta(conciliacao?.status);
  const mesAnoLabel = conciliacao?.mes
    ? `${MESES_LABEL[conciliacao.mes] || conciliacao.mes}/${conciliacao.ano}`
    : '';
  const extratoLabel = [conciliacao?.extrato?.banco, conciliacao?.extrato?.conta]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <main className="space-y-6 p-6">
        <header className="space-y-3">
          <nav className="text-sm text-zinc-500">
            <Link href="/dashboard/contabil/conciliacao" className="font-medium text-sky-700 hover:underline">
              Conciliação
            </Link>
            {extratoLabel || mesAnoLabel ? (
              <span>
                {' > '}
                {extratoLabel}
                {extratoLabel && mesAnoLabel ? ' — ' : ''}
                {mesAnoLabel}
              </span>
            ) : null}
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">Revisão da conciliação</h1>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta.classes}`}
              >
                {statusMeta.label}
              </span>

              {conciliacao?.status === 'concluida' ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDownloading ? <Spinner /> : null}
                  {isDownloading ? 'Baixando...' : 'Download Relatório'}
                </button>
              ) : null}

              {conciliacao?.status === 'em_andamento' ? (
                <button
                  type="button"
                  onClick={() => setIsConcluirModalAberto(true)}
                  disabled={!podeConcluir}
                  title={
                    podeConcluir
                      ? undefined
                      : 'Resolva todos os pares prováveis antes de concluir'
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Concluir conciliação
                </button>
              ) : null}
            </div>
          </div>

          {erroDownload ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {erroDownload}
            </p>
          ) : null}

          {!erroCarregar && !isLoadingConciliacao ? (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-zinc-600">
                {totalConciliadas} de {totalTransacoes} transações conciliadas
              </p>
              <div className="flex items-center gap-3">
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-zinc-200"
                  role="progressbar"
                  aria-label="Progresso da conciliação"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percentual}
                >
                  <div
                    className="h-full rounded-full bg-zinc-800 transition-all"
                    style={{ width: `${percentual}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-zinc-600">{percentual}%</span>
              </div>
            </div>
          ) : null}
        </header>

        {erroCarregar ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroCarregar}</p>
            <Link
              href="/dashboard/contabil/conciliacao"
              className="mt-2 inline-block text-sm font-medium text-sky-700 hover:underline"
            >
              Voltar para Conciliação Bancária
            </Link>
          </section>
        ) : null}

        {!erroCarregar && isLoadingConciliacao ? (
          <div className="flex items-center gap-3 p-5 text-sm text-zinc-600">
            <Spinner />
            <span>Carregando conciliação...</span>
          </div>
        ) : null}

        {!erroCarregar && !isLoadingConciliacao ? (
          <>
            {erroAcaoPar ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {erroAcaoPar}
              </p>
            ) : null}

            <section className="rounded-xl border border-emerald-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-emerald-900">✅ Automático</h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    {pares.automatico.length} match{pares.automatico.length === 1 ? '' : 'es'} automático
                    {pares.automatico.length === 1 ? '' : 's'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setAutomaticoAberto((atual) => !atual)}
                  aria-expanded={automaticoAberto}
                  className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
                >
                  {automaticoAberto ? 'Ocultar' : 'Ver matches'}
                </button>
              </header>

              {automaticoAberto ? (
                pares.automatico.length > 0 ? (
                  <TabelaPares pares={pares.automatico} mostrarAcoes={false} />
                ) : (
                  <p className="p-5 text-sm text-zinc-600">Nenhum match automático.</p>
                )
              ) : null}
            </section>

            <section className="rounded-xl border border-amber-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 p-5">
                <h2 className="text-lg font-semibold text-amber-900">⚠️ Provável</h2>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                  {provaveisRestantes} sem decisão
                </span>
              </header>

              {pares.provavel.length > 0 ? (
                <TabelaPares
                  pares={pares.provavel}
                  mostrarAcoes
                  onConfirmar={handleConfirmar}
                  onRejeitar={handleRejeitar}
                  pareEmAcao={pareEmAcao}
                />
              ) : (
                <p className="p-5 text-sm text-zinc-600">Nenhum par provável pendente de decisão.</p>
              )}
            </section>

            <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
              <header className="border-b border-zinc-100 p-5">
                <h2 className="text-lg font-semibold text-zinc-900">❌ Sem par</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Leitura apenas — resolva fora do sistema (lance ou ignore).
                </p>
              </header>

              <div className="space-y-6 p-5">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-700">
                    Transações sem lançamento ({transacoesSemLancamento.length})
                  </h3>

                  {transacoesSemLancamento.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-zinc-200 text-sm">
                        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          <tr>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Descrição banco</th>
                            <th className="px-4 py-3">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {transacoesSemLancamento.map((par) => (
                            <tr key={par.id}>
                              <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                                {formatarData(par.transacao?.data_lancamento)}
                              </td>
                              <td className="px-4 py-3 text-zinc-700">
                                {par.transacao?.descricao || '-'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                                {formatarValor(par.transacao?.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Nenhuma transação sem lançamento.</p>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-700">
                    Lançamentos sem transação ({lancamentosSemTransacao.length})
                  </h3>

                  {lancamentosSemTransacao.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-zinc-200 text-sm">
                        <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          <tr>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Descrição</th>
                            <th className="px-4 py-3">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {lancamentosSemTransacao.map((par) => (
                            <tr key={par.id}>
                              <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                                {formatarData(par.lancamento?.data_lancamento)}
                              </td>
                              <td className="px-4 py-3 text-zinc-700">
                                {par.lancamento?.descricao || '-'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                                {formatarValor(par.lancamento?.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">Nenhum lançamento sem transação.</p>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>

      {isConcluirModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Concluir conciliação</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Deseja realmente concluir esta conciliação? Essa ação marca as transações e
              lançamentos conciliados como definitivos.
            </p>

            {erroConcluir ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {erroConcluir}
              </p>
            ) : null}

            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConcluirModalAberto(false)}
                disabled={isConcluindo}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarConclusao}
                disabled={isConcluindo}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConcluindo ? <Spinner /> : null}
                {isConcluindo ? 'Concluindo...' : 'Concluir conciliação'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default function ConciliacaoDetalhePage({ params }) {
  return (
    <Suspense fallback={<p className="p-6">Carregando...</p>}>
      <ConciliacaoDetalheContent id={params.id} />
    </Suspense>
  );
}
