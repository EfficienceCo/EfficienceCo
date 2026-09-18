'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import {
  aprovarApuracao,
  buscarApuracao,
  calcularApuracao,
  editarApuracao,
  listarApuracoes,
} from '../../../../services/apuracao.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';
const REGIME_SIMPLES_NACIONAL = 'simples_nacional';

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

const MENSAGEM_ERRO_EDICAO =
  'Informe um valor válido e, se ele for diferente do calculado, um motivo para a edição.';

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function obterCodigoErro(error) {
  const mensagem = error?.response?.data?.erro;

  if (mensagem === 'FATOR_R_SEM_FOLHA') {
    return 'FATOR_R_SEM_FOLHA';
  }

  if (mensagem === 'REGIME_NAO_SUPORTADO' || mensagem === 'Regime tributário não suportado') {
    return 'REGIME_NAO_SUPORTADO';
  }

  return null;
}

function obterValorExibido(apuracao) {
  return apuracao?.valor_editado ?? apuracao?.valor_calculado;
}

// Registros antigos podem ter o UUID do usuário; os novos guardam o e-mail.
// Quando ainda for UUID do usuário logado, mostramos uma identificação legível.
function obterNomeAprovador(apuracao, user) {
  if (apuracao?.aprovado_por && apuracao.aprovado_por === user?.id) {
    return user?.nome || user?.email || apuracao.aprovado_por;
  }

  return apuracao?.aprovado_por;
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

function normalizarApuracoes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.data) ? payload.data : [];
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

function formatarValor(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarValorInput(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : '';
}

function formatarPercentual(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return '-';
  }

  return `${(numero * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
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

function formatarReferencia(item) {
  const mesReferencia = Number(item?.mes);
  const anoReferencia = Number(item?.ano);

  if (mesReferencia >= 1 && mesReferencia <= 12 && Number.isInteger(anoReferencia)) {
    return `${MESES[mesReferencia - 1].label}/${anoReferencia}`;
  }

  return item?.referencia || '-';
}

function identificarNota(nota) {
  if (nota?.chave_nfe) {
    return `NF-e …${String(nota.chave_nfe).slice(-8)}`;
  }

  return nota?.id ? `NF-e ${nota.id}` : 'NF-e sem chave';
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function ApuracoesPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const [clienteId, setClienteId] = useState(null);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [apuracao, setApuracao] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [valorEditado, setValorEditado] = useState('');
  const [motivo, setMotivo] = useState('');

  const [erroEdicao, setErroEdicao] = useState('');
  const [isSalvandoEdicao, setIsSalvandoEdicao] = useState(false);

  const [showAprovarModal, setShowAprovarModal] = useState(false);
  const [isAprovando, setIsAprovando] = useState(false);
  const [erroAprovar, setErroAprovar] = useState('');

  const clienteIdEfetivo = isAdminEfficience ? clienteId : user?.cliente_id || null;

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

  const clienteSelecionadoNome = useMemo(() => {
    if (apuracao?.cliente_nome) {
      return apuracao.cliente_nome;
    }

    if (isAdminEfficience) {
      const encontrado = clientesOrdenados.find(
        (cliente) => obterIdCliente(cliente) === clienteIdEfetivo,
      );
      return encontrado ? obterNomeCliente(encontrado) : '';
    }

    return user?.cliente_nome || user?.nome || user?.email || '';
  }, [apuracao, clienteIdEfetivo, clientesOrdenados, isAdminEfficience, user]);

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

  function handleSelecionarCliente(event) {
    setClienteId(event.target.value || null);
    setApuracao(null);
    setErro(null);
    setShowAprovarModal(false);
  }

  function handleSelecionarMes(event) {
    setMes(Number(event.target.value));
    setApuracao(null);
    setErro(null);
    setShowAprovarModal(false);
  }

  function handleSelecionarAno(event) {
    setAno(Number(event.target.value));
    setApuracao(null);
    setErro(null);
    setShowAprovarModal(false);
  }

  async function handleCalcular() {
    if (!clienteIdEfetivo || loading) {
      return;
    }

    setLoading(true);
    setErro(null);
    setApuracao(null);
    setShowAprovarModal(false);

    try {
      const buscarExistente = async () => {
        const lista = normalizarApuracoes(
          await listarApuracoes({ clienteId: clienteIdEfetivo, mes, ano }),
        );
        const existente = lista.find((item) => item.regime === REGIME_SIMPLES_NACIONAL);
        return existente?.id ? buscarApuracao(existente.id) : null;
      };

      let resultado = await buscarExistente();

      if (!resultado) {
        try {
          resultado = await calcularApuracao({
            clienteId: clienteIdEfetivo,
            mes,
            ano,
            regime: REGIME_SIMPLES_NACIONAL,
          });
        } catch (error) {
          // Outra requisição pode ter criado a mesma competência entre o GET e
          // o POST. Nesse caso, abrimos o registro vencedor em vez de exibir 409.
          if (error?.response?.status !== 409) {
            throw error;
          }

          resultado = await buscarExistente();
          if (!resultado) throw error;
        }
      }

      setApuracao(resultado);
      setValorEditado(formatarValorInput(obterValorExibido(resultado)));
      setMotivo('');
      setErroEdicao('');
    } catch (error) {
      setErro({ codigo: obterCodigoErro(error), mensagem: obterMensagemErro(error) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSalvarEdicao() {
    const novo = Number(valorEditado);
    const anterior = Number(obterValorExibido(apuracao));

    if (!Number.isFinite(novo) || novo < 0) {
      setErroEdicao(MENSAGEM_ERRO_EDICAO);
      return;
    }

    if (novo === anterior) {
      setErroEdicao('Altere o valor antes de salvar uma nova edição.');
      return;
    }

    if (!motivo.trim()) {
      setErroEdicao(MENSAGEM_ERRO_EDICAO);
      return;
    }

    setIsSalvandoEdicao(true);
    setErroEdicao('');

    try {
      const atualizado = await editarApuracao(apuracao.id, {
        valor_editado: novo,
        motivo: motivo.trim(),
      });
      const resultadoCompleto = { ...apuracao, ...atualizado };
      setApuracao(resultadoCompleto);
      setValorEditado(formatarValorInput(obterValorExibido(resultadoCompleto)));
      setMotivo('');
    } catch (error) {
      setErroEdicao(obterMensagemErro(error, 'Não foi possível salvar a edição.'));
    } finally {
      setIsSalvandoEdicao(false);
    }
  }

  function handleAbrirAprovar() {
    setErroAprovar('');
    setShowAprovarModal(true);
  }

  function handleFecharAprovar() {
    if (isAprovando) {
      return;
    }

    setShowAprovarModal(false);
  }

  async function handleConfirmarAprovar() {
    if (!apuracao?.id) {
      return;
    }

    setIsAprovando(true);
    setErroAprovar('');

    try {
      const atualizado = await aprovarApuracao(apuracao.id);
      setApuracao((anterior) => ({ ...anterior, ...atualizado }));
      setShowAprovarModal(false);
    } catch (error) {
      setErroAprovar(obterMensagemErro(error, 'Não foi possível aprovar o DAS.'));
    } finally {
      setIsAprovando(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const aguardandoSelecaoCliente = isAdminEfficience && !clienteId;
  const podeCalcular = Boolean(clienteIdEfetivo) && !loading;
  const statusRascunho = apuracao?.status === 'rascunho';
  const statusAprovado = apuracao?.status === 'aprovado';
  const anexoEfetivo = apuracao?.anexo_efetivo || apuracao?.anexo;
  const anexoMigrado = Boolean(
    apuracao?.anexo_original && anexoEfetivo && apuracao.anexo_original !== anexoEfetivo,
  );
  const mostrarFatorR = Boolean(apuracao) && apuracao.fator_r !== null && apuracao.fator_r !== undefined;
  const historicoEdicoes = Array.isArray(apuracao?.historico_edicoes) ? apuracao.historico_edicoes : [];
  const rbt12Mensal = Array.isArray(apuracao?.rbt12_mensal) ? apuracao.rbt12_mensal : [];
  const notasConsideradas = Array.isArray(apuracao?.notas_fiscais?.consideradas)
    ? apuracao.notas_fiscais.consideradas
    : [];
  const notasExcluidas = Array.isArray(apuracao?.notas_fiscais?.excluidas)
    ? apuracao.notas_fiscais.excluidas
    : [];
  const competenciaLabel = `${MESES[mes - 1]?.label}/${ano}`;

  return (
    <>
      <main className="space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Apuração Fiscal</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Calcule, revise e aprove o DAS dos clientes no Simples Nacional.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros</p>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            {isAdminEfficience ? (
              <label className="min-w-[220px] flex-1 space-y-2">
                <span className="text-sm font-medium text-zinc-700">Cliente</span>
                <select
                  value={clienteId || ''}
                  onChange={handleSelecionarCliente}
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

            <label className="min-w-[160px] space-y-2">
              <span className="text-sm font-medium text-zinc-700">Mês</span>
              <select
                value={mes}
                onChange={handleSelecionarMes}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {MESES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-[120px] space-y-2">
              <span className="text-sm font-medium text-zinc-700">Ano</span>
              <select
                value={ano}
                onChange={handleSelecionarAno}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                {anosDisponiveis.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleCalcular}
              disabled={!podeCalcular}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Spinner /> : null}
              {loading ? 'Calculando...' : 'Calcular DAS'}
            </button>
          </div>
        </section>

        {erroClientes ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erroClientes}</p>
          </section>
        ) : null}

        {aguardandoSelecaoCliente && !apuracao && !erro ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
            <p className="text-sm text-sky-900">Selecione um cliente para calcular o DAS.</p>
          </section>
        ) : null}

        {!aguardandoSelecaoCliente && erro?.codigo === 'FATOR_R_SEM_FOLHA' ? (
          <section className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            >
              <path d="M12 9v4" />
              <path d="M12 16.5h.01" />
              <path d="M10.3 3.9 2.6 17a1.8 1.8 0 0 0 1.6 2.7h15.6a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" />
            </svg>
            <div>
              <p className="font-semibold text-amber-800">Não foi possível calcular o Fator R</p>
              <p className="mt-1 text-sm text-zinc-700">
                Importe as folhas de pagamento dos 12 meses anteriores à competência e tente
                calcular novamente.
              </p>
            </div>
          </section>
        ) : null}

        {!aguardandoSelecaoCliente && erro?.codigo === 'REGIME_NAO_SUPORTADO' ? (
          <section className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-5 w-5 shrink-0 text-rose-600"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M8 8l8 8M16 8l-8 8" />
            </svg>
            <div>
              <p className="font-semibold text-rose-800">Regime não suportado</p>
              <p className="mt-1 text-sm text-zinc-700">Este cliente não está no Simples Nacional.</p>
            </div>
          </section>
        ) : null}

        {!aguardandoSelecaoCliente &&
        erro &&
        erro.codigo !== 'FATOR_R_SEM_FOLHA' &&
        erro.codigo !== 'REGIME_NAO_SUPORTADO' ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erro.mensagem}</p>
          </section>
        ) : null}

        {apuracao ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900">Resultado do cálculo</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {clienteSelecionadoNome} · {competenciaLabel}
                </p>
              </div>

              {statusAprovado ? (
                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Aprovado
                </span>
              ) : (
                <span className="whitespace-nowrap rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700">
                  Rascunho
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Regime</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">Simples Nacional</div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Anexo efetivo
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  Anexo {anexoEfetivo || '-'}
                </div>
                {anexoMigrado ? (
                  <div className="mt-1 text-xs text-sky-700">
                    migrou do Anexo {apuracao.anexo_original} pelo Fator R
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">RBT12</div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  {formatarValor(apuracao.rbt12 ?? apuracao.rbt12_usado)}
                </div>
              </div>

              {mostrarFatorR ? (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Fator R
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                    {formatarPercentual(apuracao.fator_r)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Receita da competência
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  {formatarValor(apuracao.receita_mes)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Faixa de receita
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  Até {formatarValor(apuracao.faixa_limite)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Alíquota nominal
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  {formatarPercentual(apuracao.aliquota_nominal)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Parcela deduzida
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  {formatarValor(apuracao.parcela_deduzir ?? apuracao.parcela_deduzida)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Alíquota efetiva
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-zinc-700">
                  {formatarPercentual(apuracao.aliquota_efetiva)}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-5">
              <span className="text-xs font-semibold text-sky-800">Valor do DAS</span>
              <span className="font-mono text-3xl font-semibold tracking-tight text-sky-900">
                {formatarValor(obterValorExibido(apuracao))}
              </span>
            </div>
          </section>
        ) : null}

        {apuracao && rbt12Mensal.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <header className="border-b border-zinc-100 px-6 py-4">
              <h2 className="text-base font-bold text-zinc-900">Composição da RBT12</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Receitas dos 12 meses anteriores usadas no cálculo da alíquota.
              </p>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Competência</th>
                    <th className="px-6 py-3 text-right font-semibold">NF-es</th>
                    <th className="px-6 py-3 text-right font-semibold">Histórico informado</th>
                    <th className="px-6 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rbt12Mensal.map((item) => (
                    <tr key={item.referencia}>
                      <td className="px-6 py-3 font-medium text-zinc-700">{formatarReferencia(item)}</td>
                      <td className="px-6 py-3 text-right font-mono text-zinc-600">
                        {formatarValor(item.receita_nfes)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-zinc-600">
                        {formatarValor(item.receita_historico)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-semibold text-zinc-900">
                        {formatarValor(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right text-xs font-semibold uppercase text-zinc-500">
                      RBT12
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-bold text-zinc-900">
                      {formatarValor(apuracao.rbt12 ?? apuracao.rbt12_usado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

        {apuracao ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">Notas fiscais auditadas</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Confira quais NF-es foram consideradas ou excluídas e o motivo.
            </p>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-emerald-700">
                  Consideradas ({notasConsideradas.length})
                </h3>
                <div className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {notasConsideradas.length > 0 ? notasConsideradas.map((nota, index) => (
                    <div key={nota.id || nota.chave_nfe || index} className="p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-zinc-800">{identificarNota(nota)}</span>
                        <span className="font-mono font-semibold text-zinc-700">
                          {formatarValor(nota.valor_total)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {nota.data_emissao || 'Data não informada'} · {nota.motivo}
                      </p>
                    </div>
                  )) : (
                    <p className="p-3 text-sm text-zinc-500">Nenhuma NF-e de saída encontrada.</p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-rose-700">
                  Excluídas ({notasExcluidas.length})
                </h3>
                <div className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                  {notasExcluidas.length > 0 ? notasExcluidas.map((nota, index) => (
                    <div key={nota.id || nota.chave_nfe || index} className="p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-zinc-800">{identificarNota(nota)}</span>
                        <span className="font-mono font-semibold text-zinc-700">
                          {formatarValor(nota.valor_total)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {nota.data_emissao || 'Data não informada'} · {nota.motivo}
                      </p>
                    </div>
                  )) : (
                    <p className="p-3 text-sm text-zinc-500">Nenhuma NF-e foi excluída.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {apuracao && statusRascunho ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">Editar valor</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ajuste o valor do DAS caso discorde do cálculo automático.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Valor final</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorEditado}
                  onChange={(event) => {
                    setValorEditado(event.target.value);
                    setErroEdicao('');
                  }}
                  disabled={isSalvandoEdicao}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-zinc-700">Motivo da edição</span>
                <textarea
                  rows={1}
                  value={motivo}
                  onChange={(event) => {
                    setMotivo(event.target.value);
                    setErroEdicao('');
                  }}
                  disabled={isSalvandoEdicao}
                  placeholder="Obrigatório para registrar a alteração"
                  className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>

            {erroEdicao ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {erroEdicao}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSalvarEdicao}
                disabled={isSalvandoEdicao}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSalvandoEdicao ? <Spinner /> : null}
                {isSalvandoEdicao ? 'Salvando...' : 'Salvar edição'}
              </button>
            </div>
          </section>
        ) : null}

        {historicoEdicoes.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <header className="border-b border-zinc-100 px-6 py-4">
              <h2 className="text-base font-bold text-zinc-900">Histórico de edições</h2>
            </header>

            <div className="divide-y divide-zinc-100">
              {historicoEdicoes.map((item, index) => (
                <div
                  key={`${item?.editado_em || item?.data || index}`}
                  className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5"
                >
                  <div className="flex items-center gap-2 font-mono text-sm text-zinc-700">
                    <span className="text-zinc-400 line-through">
                      {formatarValor(item?.valor_anterior)}
                    </span>
                    <span>→</span>
                    <span className="font-semibold text-zinc-900">
                      {formatarValor(item?.valor_novo)}
                    </span>
                  </div>
                  <div className="flex-1 text-sm text-zinc-600">{item?.motivo}</div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{formatarDataHora(item?.editado_em || item?.data)}</div>
                    {item?.editado_por ? <div className="mt-0.5">por {item.editado_por}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {apuracao ? (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            {statusAprovado ? (
              <p className="text-sm font-semibold text-emerald-700">
                Aprovado por {obterNomeAprovador(apuracao, user)} em {formatarDataHora(apuracao.aprovado_em)}
              </p>
            ) : (
              <p className="text-sm text-zinc-500">Revise os dados acima antes de aprovar este DAS.</p>
            )}

            <button
              type="button"
              onClick={handleAbrirAprovar}
              disabled={statusAprovado}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 disabled:opacity-70"
            >
              Aprovar DAS
            </button>
          </section>
        ) : null}
      </main>

      {showAprovarModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Confirmar aprovação</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">
              Confirmar aprovação do DAS de <strong>{formatarValor(obterValorExibido(apuracao))}</strong>{' '}
              para <strong>{clienteSelecionadoNome}</strong> referente a{' '}
              <strong>{competenciaLabel}</strong>?
            </p>

            {erroAprovar ? (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {erroAprovar}
              </p>
            ) : null}

            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleFecharAprovar}
                disabled={isAprovando}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmarAprovar}
                disabled={isAprovando}
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAprovando ? <Spinner /> : null}
                {isAprovando ? 'Aprovando...' : 'Confirmar aprovação'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
