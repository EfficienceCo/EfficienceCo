'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { listarClientes } from '../../../services/clientes.service';
import { buscarResumoFiscal, listarLancamentos } from '../../../services/fiscal.service';

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

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function normalizarLancamentos(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.lancamentos)) {
    return payload.lancamentos;
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

  if (Array.isArray(payload?.items)) {
    return payload.items;
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

function formatarValor(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarCnpj(cnpj) {
  const digitos = String(cnpj || '').replace(/\D/g, '');

  if (digitos.length !== 14) {
    return cnpj || '-';
  }

  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

function truncarChaveNfe(chave) {
  const texto = String(chave || '');

  if (texto.length <= 16) {
    return texto || '-';
  }

  return `${texto.slice(0, 8)}…${texto.slice(-6)}`;
}

function formatarTipo(tipo) {
  if (tipo === 'entrada') {
    return 'Entrada';
  }

  if (tipo === 'saida') {
    return 'Saída';
  }

  return '-';
}

function classeBadgeTipo(tipo) {
  if (tipo === 'entrada') {
    return 'bg-sky-100 text-sky-700';
  }

  if (tipo === 'saida') {
    return 'bg-emerald-100 text-emerald-700';
  }

  return 'bg-zinc-100 text-zinc-700';
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

function CardResumo({ titulo, valor, isLoading }) {
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

export default function FiscalPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const [filtroMes, setFiltroMes] = useState(() => obterMesAnoAtual().mes);
  const [filtroAno, setFiltroAno] = useState(() => obterMesAnoAtual().ano);

  const [lancamentos, setLancamentos] = useState([]);
  const [isLoadingLancamentos, setIsLoadingLancamentos] = useState(true);
  const [erroLista, setErroLista] = useState('');

  const [resumo, setResumo] = useState(null);
  const [isLoadingResumo, setIsLoadingResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState('');

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
    setErroLista('');
    setIsLoadingResumo(true);
    setErroResumo('');

    try {
      const parametros = {
        clienteId: isAdminEfficience ? clienteId : undefined,
        mes: filtroMes,
        ano: filtroAno,
      };

      const [resultadoLancamentos, resultadoResumo] = await Promise.allSettled([
        listarLancamentos(parametros),
        buscarResumoFiscal(parametros),
      ]);

      if (idRequisicao !== requisicaoIdRef.current) {
        return;
      }

      if (resultadoLancamentos.status === 'fulfilled') {
        setLancamentos(normalizarLancamentos(resultadoLancamentos.value));
      } else {
        setErroLista(
          obterMensagemErro(
            resultadoLancamentos.reason,
            'Não foi possível carregar os lançamentos fiscais.',
          ),
        );
        setLancamentos([]);
      }

      if (resultadoResumo.status === 'fulfilled') {
        setResumo(resultadoResumo.value);
      } else {
        setErroResumo(
          obterMensagemErro(resultadoResumo.reason, 'Não foi possível carregar o resumo fiscal.'),
        );
        setResumo(null);
      }
    } catch (error) {
      if (idRequisicao === requisicaoIdRef.current) {
        setErroLista(obterMensagemErro(error, 'Não foi possível carregar os lançamentos fiscais.'));
        setErroResumo(obterMensagemErro(error, 'Não foi possível carregar o resumo fiscal.'));
        setLancamentos([]);
        setResumo(null);
      }
    } finally {
      if (idRequisicao === requisicaoIdRef.current) {
        setIsLoadingLancamentos(false);
        setIsLoadingResumo(false);
      }
    }
  }, [clienteId, filtroAno, filtroMes, isAdminEfficience]);

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
      setLancamentos([]);
      setIsLoadingLancamentos(false);
      setErroLista('');
      setResumo(null);
      setIsLoadingResumo(false);
      setErroResumo('');
      return;
    }

    carregarDados();
  }, [carregarDados, clienteId, isAdminEfficience, isAuthenticated, isLoading]);

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const aguardandoSelecaoCliente = isAdminEfficience && !clienteId;

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Fiscal</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Lançamentos de NFe registrados automaticamente pelo agente.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarDados}
          disabled={isLoadingLancamentos || aguardandoSelecaoCliente}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingLancamentos ? 'Atualizando...' : 'Atualizar lista'}
        </button>
      </header>

      {!aguardandoSelecaoCliente && erroResumo ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroResumo}</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroResumo ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            titulo="Total de NFes processadas"
            valor={resumo?.total_nfe ?? 0}
            isLoading={isLoadingResumo}
          />
          <CardResumo
            titulo="Valor total"
            valor={formatarValor(resumo?.valor_total ?? 0)}
            isLoading={isLoadingResumo}
          />
          <CardResumo
            titulo="ICMS total"
            valor={formatarValor(resumo?.icms ?? 0)}
            isLoading={isLoadingResumo}
          />
          <CardResumo
            titulo="PIS + COFINS total"
            valor={formatarValor((resumo?.pis ?? 0) + (resumo?.cofins ?? 0))}
            isLoading={isLoadingResumo}
          />
          {!isLoadingResumo && Number(resumo?.ipi) > 0 ? (
            <CardResumo titulo="IPI total" valor={formatarValor(resumo.ipi)} isLoading={false} />
          ) : null}
        </section>
      ) : null}

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
        <section className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-rose-800">{erroClientes}</p>
          <button
            type="button"
            onClick={carregarClientes}
            disabled={isLoadingClientes}
            className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingClientes ? 'Tentando...' : 'Tentar novamente'}
          </button>
        </section>
      ) : null}

      {aguardandoSelecaoCliente ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-sm text-sky-900">Selecione um cliente para ver os lançamentos.</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && erroLista ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroLista}</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroLista && isLoadingLancamentos ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <Spinner />
            <span>Carregando lançamentos...</span>
          </div>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroLista && !isLoadingLancamentos && lancamentos.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhum lançamento encontrado para o período.</p>
        </section>
      ) : null}

      {!aguardandoSelecaoCliente && !erroLista && !isLoadingLancamentos && lancamentos.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">Data emissão</th>
                <th className="px-4 py-3">Chave NFe</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">CNPJ emitente</th>
                <th className="px-4 py-3">CNPJ destinatário</th>
                <th className="px-4 py-3">Valor total</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {lancamentos.map((lancamento, index) => (
                <tr key={lancamento?.id || `${lancamento?.chave_nfe}-${index}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarData(lancamento?.data_emissao)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700"
                    title={lancamento?.chave_nfe || ''}
                  >
                    {truncarChaveNfe(lancamento?.chave_nfe)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${classeBadgeTipo(
                        lancamento?.tipo,
                      )}`}
                    >
                      {formatarTipo(lancamento?.tipo)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarCnpj(lancamento?.cnpj_emitente)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700">
                    {formatarCnpj(lancamento?.cnpj_destinatario)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                    {formatarValor(lancamento?.valor_total)}
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
