'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { listarClientes } from '../../../services/clientes.service';
import { buscarMetricas } from '../../../services/eficiencia.service';
import { getStatusLicencaClienteLogado } from '../../../services/licencas.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';

// Placeholder até existir um valor/hora configurável por escritório.
const VALOR_HORA_REAIS = 80;

const PERIODOS = [
  { value: '7', label: '7 dias' },
  { value: '15', label: '15 dias' },
  { value: '30', label: '30 dias' },
];

const STATUS_LICENCA_META = {
  active: { label: 'Ativa', classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  expired: { label: 'Vencida', classes: 'bg-rose-100 text-rose-800 ring-rose-200' },
  suspended: { label: 'Suspensa', classes: 'bg-amber-100 text-amber-800 ring-amber-200' },
};

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
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

function formatarHoras(horas) {
  const numero = Number(horas);
  if (!Number.isFinite(numero)) {
    return '-';
  }
  return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;
}

function formatarValor(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '-';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarData(data) {
  if (!data) {
    return '-';
  }
  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function obterStatusLicencaMeta(status) {
  return (
    STATUS_LICENCA_META[status] || {
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

function CardKpi({ titulo, valor, isLoading }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{titulo}</p>
      {isLoading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded bg-zinc-100" />
      ) : (
        <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-zinc-900">
          {valor}
        </p>
      )}
    </article>
  );
}

export default function EfficiencePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const [periodo, setPeriodo] = useState('30');

  const [metricas, setMetricas] = useState(null);
  const [isLoadingMetricas, setIsLoadingMetricas] = useState(true);
  const [erroMetricas, setErroMetricas] = useState('');

  const [licenca, setLicenca] = useState(null);
  const [isLoadingLicenca, setIsLoadingLicenca] = useState(true);
  const [erroLicenca, setErroLicenca] = useState('');

  const [mensagemPagamento, setMensagemPagamento] = useState('');

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

    setIsLoadingMetricas(true);
    setErroMetricas('');
    setIsLoadingLicenca(true);
    setErroLicenca('');

    const parametrosClienteId = isAdminEfficience ? clienteId : undefined;

    const [resultadoMetricas, resultadoLicenca] = await Promise.allSettled([
      buscarMetricas({ periodo, clienteId: parametrosClienteId }),
      getStatusLicencaClienteLogado({ clienteId: parametrosClienteId }),
    ]);

    if (idRequisicao !== requisicaoIdRef.current) {
      return;
    }

    if (resultadoMetricas.status === 'fulfilled') {
      setMetricas(resultadoMetricas.value);
    } else {
      setErroMetricas(
        obterMensagemErro(resultadoMetricas.reason, 'Não foi possível carregar as métricas de eficiência.'),
      );
      setMetricas(null);
    }

    if (resultadoLicenca.status === 'fulfilled') {
      setLicenca(resultadoLicenca.value);
    } else {
      setErroLicenca(obterMensagemErro(resultadoLicenca.reason, 'Não foi possível carregar a licença.'));
      setLicenca(null);
    }

    setIsLoadingMetricas(false);
    setIsLoadingLicenca(false);
  }, [clienteId, isAdminEfficience, periodo]);

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

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    if (isAdminEfficience && !clienteId) {
      requisicaoIdRef.current += 1;
      setMetricas(null);
      setIsLoadingMetricas(false);
      setErroMetricas('');
      setLicenca(null);
      setIsLoadingLicenca(false);
      setErroLicenca('');
      return;
    }

    carregarDados();
  }, [carregarDados, clienteId, isAdminEfficience, isAuthenticated, isLoading]);

  function handlePagar() {
    setMensagemPagamento('Pagamento online chega em breve — fale com o time Efficience Co para regularizar sua licença.');
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-zinc-500">Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const aguardandoSelecaoCliente = isAdminEfficience && !clienteId;
  const equivalenteReais = (Number(metricas?.total_horas) || 0) * VALOR_HORA_REAIS;
  const statusLicencaMeta = obterStatusLicencaMeta(licenca?.status);

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Efficience — seu escritório em números</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Quanto tempo as automações economizaram do seu time nos últimos dias.
          </p>
        </div>

        <div className="inline-flex rounded-md border border-zinc-300 bg-white p-1 shadow-sm">
          {PERIODOS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriodo(item.value)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                periodo === item.value
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {isAdminEfficience ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700">Cliente</span>
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              disabled={isLoadingClientes || Boolean(erroClientes)}
              className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
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
        </section>
      ) : null}

      {erroClientes ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroClientes}</p>
        </section>
      ) : null}

      {aguardandoSelecaoCliente ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-sm text-sky-900">Selecione um cliente para ver as métricas.</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && erroMetricas ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroMetricas}</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroMetricas ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <CardKpi
            titulo="Horas economizadas"
            valor={formatarHoras(metricas?.total_horas ?? 0)}
            isLoading={isLoadingMetricas}
          />
          <CardKpi
            titulo="Automações executadas"
            valor={metricas?.total_execucoes ?? 0}
            isLoading={isLoadingMetricas}
          />
          <CardKpi
            titulo="Equivalente em R$"
            valor={formatarValor(equivalenteReais)}
            isLoading={isLoadingMetricas}
          />
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroMetricas ? (
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <header className="border-b border-zinc-100 p-5">
            <h2 className="text-lg font-semibold text-zinc-900">Detalhamento por automação</h2>
          </header>

          {isLoadingMetricas ? (
            <div className="flex items-center gap-3 p-5 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando...</span>
            </div>
          ) : (metricas?.breakdown || []).length === 0 ? (
            <p className="p-5 text-sm text-zinc-600">Nenhuma automação executada no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  <tr>
                    <th className="px-4 py-3">Automação</th>
                    <th className="px-4 py-3">Execuções</th>
                    <th className="px-4 py-3">Horas economizadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {metricas.breakdown.map((linha, index) => (
                    <tr key={linha?.tipo || index}>
                      <td className="px-4 py-3 text-zinc-700">{linha?.tipo || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{linha?.quantidade ?? 0}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                        {formatarHoras(linha?.horas ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Licença</h2>

        {erroLicenca ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {erroLicenca}
          </p>
        ) : isLoadingLicenca ? (
          <div className="mt-4 flex items-center gap-3 text-sm text-zinc-600">
            <Spinner />
            <span>Carregando...</span>
          </div>
        ) : !aguardandoSelecaoCliente && licenca ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Plano</dt>
                <dd className="mt-1 font-medium text-zinc-900">Efficience Co</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Vencimento</dt>
                <dd className="mt-1 font-medium text-zinc-900">{formatarData(licenca.validade)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusLicencaMeta.classes}`}
                  >
                    {statusLicencaMeta.label}
                  </span>
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={handlePagar}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Pagar licença
            </button>
          </div>
        ) : null}

        {mensagemPagamento ? (
          <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {mensagemPagamento}
          </p>
        ) : null}
      </section>
    </main>
  );
}
