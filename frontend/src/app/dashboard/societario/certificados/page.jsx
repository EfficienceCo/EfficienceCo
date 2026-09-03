'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import {
  atualizarItemRenovacao,
  criarCertificado,
  iniciarRenovacao,
  listarCertificados,
} from '../../../../services/certificados.service';
import { EscudoIcon } from '../../../../components/icons/AutomacaoIcons';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';
const PERFIS_GERENCIAM = new Set(['admin_efficience', 'admin_cliente']);

// ---------------------------------------------------------------------------
// Helpers (mesmo vocabulário de fiscal/apuracao/esocial page.jsx)
// ---------------------------------------------------------------------------

function obterMensagemErro(error, fallback = 'Não foi possível processar a solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function normalizarClientes(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.clientes)) return payload.clientes;
  return [];
}

function normalizarLista(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.certificados)) return payload.certificados;
  return [];
}

function normalizarItens(checklist) {
  if (Array.isArray(checklist)) return checklist;
  if (Array.isArray(checklist?.itens)) return checklist.itens;
  if (Array.isArray(checklist?.items)) return checklist.items;
  return [];
}

function obterIdCliente(cliente) {
  return cliente?.id || cliente?.cliente_id || cliente?.clienteId || '';
}

function obterNomeCliente(cliente) {
  return cliente?.nome || cliente?.razao_social || cliente?.email || obterIdCliente(cliente);
}

// validade chega como DATE ISO (YYYY-MM-DD). Meio-dia evita que o fuso empurre
// a contagem para o dia anterior/seguinte.
function calcularDias(certificado) {
  if (Number.isFinite(certificado?.dias_restantes)) return certificado.dias_restantes;
  const iso = String(certificado?.validade || '').slice(0, 10);
  const ms = Date.parse(`${iso}T12:00:00`);
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

// Faixas da ficha b3 / CD-2: verde > 60, âmbar 30–60, vermelho < 30, vencido ≤ 0.
function calcularFaixa(dias) {
  if (dias === null || dias === undefined) return 'desconhecida';
  if (dias <= 0) return 'vencido';
  if (dias < 30) return 'vermelho';
  if (dias <= 60) return 'ambar';
  return 'verde';
}

function formatarData(iso) {
  const partes = String(iso || '').slice(0, 10).split('-');
  if (partes.length !== 3 || !partes[0]) return iso ? String(iso) : '—';
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

// Checklist materializado localmente quando o back-end (CD-2) ainda não está no
// ambiente. Espelha o que o endpoint POST /certificados/:id/iniciar-renovacao
// devolve — A1 curto (2 passos), A3 com o passo extra de agendamento presencial.
function montarChecklistLocal(tipo) {
  const itens = [
    {
      id: 'confirmar_dados',
      titulo: 'Confirmar dados do titular e do certificado',
      concluido: false,
    },
  ];

  if (tipo === 'A3') {
    itens.push({
      id: 'agendar_presencial',
      titulo: 'Agendar comparecimento presencial',
      concluido: false,
      tipo: 'agendamento',
      dados: { data: '' },
    });
    itens.push({
      id: 'gerar_novo',
      titulo: 'Emitir o novo certificado no comparecimento e atualizar validade e serial',
      concluido: false,
    });
  } else {
    itens.push({
      id: 'gerar_novo',
      titulo: 'Gerar o novo certificado e atualizar validade e serial',
      concluido: false,
    });
  }

  return { itens };
}

const FAIXA_META = {
  verde: {
    anel: 'text-emerald-500',
    trilho: 'text-emerald-100',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rotulo: 'Em dia',
  },
  ambar: {
    anel: 'text-amber-500',
    trilho: 'text-amber-100',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    rotulo: 'Renovar em breve',
  },
  vermelho: {
    anel: 'text-rose-500',
    trilho: 'text-rose-100',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    rotulo: 'Urgente',
  },
  vencido: {
    anel: 'text-zinc-400',
    trilho: 'text-rose-100',
    badge: 'bg-zinc-100 text-rose-700 ring-rose-300',
    rotulo: 'Vencido',
  },
  desconhecida: {
    anel: 'text-zinc-300',
    trilho: 'text-zinc-100',
    badge: 'bg-zinc-50 text-zinc-500 ring-zinc-200',
    rotulo: 'Sem validade',
  },
};

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

// Anel de contagem regressiva (círculo tipo "bateria"). O arco se esvazia
// conforme a validade se aproxima, sobre um horizonte de referência de 1 ano.
function AnelContagem({ dias, faixa }) {
  const meta = FAIXA_META[faixa] || FAIXA_META.desconhecida;
  const raio = 52;
  const circunferencia = 2 * Math.PI * raio;
  const horizonteDias = 365;
  const proporcao =
    dias === null || dias === undefined
      ? 0
      : Math.max(0.02, Math.min(1, dias / horizonteDias));
  const offset = faixa === 'vencido' ? circunferencia : circunferencia * (1 - proporcao);

  const centro =
    dias === null || dias === undefined ? '—' : dias <= 0 ? 'vencido' : String(dias);
  const sub =
    dias === null || dias === undefined || dias <= 0 ? '' : dias === 1 ? 'dia' : 'dias';

  return (
    <div
      className="relative h-28 w-28 shrink-0"
      data-faixa={faixa}
      role="img"
      aria-label={
        dias === null || dias === undefined
          ? 'Sem data de validade'
          : dias <= 0
            ? 'Certificado vencido'
            : `${dias} dias até o vencimento`
      }
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={raio}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className={meta.trilho}
        />
        <circle
          cx="60"
          cy="60"
          r={raio}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          className={meta.anel}
          strokeDasharray={circunferencia}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-bold leading-none ${
            faixa === 'vencido'
              ? 'text-sm uppercase tracking-wide text-rose-700'
              : 'text-2xl text-zinc-900'
          }`}
        >
          {centro}
        </span>
        {sub ? <span className="mt-0.5 text-[11px] font-medium text-zinc-400">{sub}</span> : null}
      </div>
    </div>
  );
}

function CaminhoLocal({ valor }) {
  const [copiado, setCopiado] = useState(false);

  if (!valor) {
    return <p className="text-[11px] text-zinc-400">Caminho local do arquivo não informado.</p>;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (_erro) {
      // Área de transferência indisponível (permissão / contexto sem HTTPS).
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
      <code className="min-w-0 flex-1 truncate text-[11px] text-zinc-600" title={valor}>
        {valor}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100"
      >
        {copiado ? 'Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}

// Mesmo desenho visual do checklist de Abertura de Empresa (processos/page.jsx):
// lista de itens com checkbox, texto riscado quando concluído, status à direita.
function ChecklistRenovacao({
  certificadoId,
  tipo,
  itens,
  podeGerenciar,
  itensSalvando,
  onToggleItem,
  onAlterarDataItem,
}) {
  const total = itens.length;
  const feitos = itens.filter((item) => item.concluido).length;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Checklist de renovação — {tipo === 'A3' ? 'certificado A3 (token/cartão)' : 'certificado A1 (arquivo)'}
        </p>
        <span className="text-xs font-medium text-zinc-500">
          {feitos}/{total}
        </span>
      </div>

      <ul className="space-y-2">
        {itens.map((item, indice) => {
          const chave = `${certificadoId}::${item.id || indice}`;
          const isAgendamento = item.tipo === 'agendamento' || item.id === 'agendar_presencial';
          const dataAgendada = item?.dados?.data || '';
          const bloqueiaConclusao = isAgendamento && !dataAgendada;
          const salvando = Boolean(itensSalvando[chave]);

          return (
            <li
              key={item.id || indice}
              data-item={item.id}
              className={`rounded-lg border px-3 py-2 ${
                item.concluido ? 'border-emerald-200 bg-emerald-50/50' : 'border-zinc-200 bg-white'
              }`}
            >
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(item.concluido)}
                    disabled={!podeGerenciar || salvando || bloqueiaConclusao}
                    onChange={(evento) => onToggleItem(item, evento.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span
                    className={`text-sm ${
                      item.concluido ? 'text-zinc-500 line-through' : 'text-zinc-800'
                    }`}
                  >
                    {item.titulo}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {salvando ? 'Salvando…' : item.concluido ? 'Concluído' : 'Pendente'}
                </span>
              </label>

              {isAgendamento ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
                  <label
                    className="text-xs font-medium text-zinc-600"
                    htmlFor={`${chave}-data`}
                  >
                    Data do comparecimento presencial
                  </label>
                  <input
                    id={`${chave}-data`}
                    type="date"
                    value={dataAgendada}
                    disabled={!podeGerenciar}
                    onChange={(evento) => onAlterarDataItem(item, evento.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                  {bloqueiaConclusao ? (
                    <span className="text-[11px] text-amber-700">
                      Escolha a data para poder concluir este passo.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {total > 0 && feitos === total ? (
        <p className="text-xs font-medium text-emerald-700">
          Renovação concluída. Edite o certificado com a nova validade e o novo serial ao emitir.
        </p>
      ) : null}
    </div>
  );
}

function CertificadoCard({
  certificado,
  podeGerenciar,
  iniciando,
  itensSalvando,
  aviso,
  onIniciarRenovacao,
  onToggleItem,
  onAlterarDataItem,
}) {
  const dias = calcularDias(certificado);
  const faixa = certificado.faixa || calcularFaixa(dias);
  const meta = FAIXA_META[faixa] || FAIXA_META.desconhecida;
  const itens = normalizarItens(certificado.renovacao_checklist);
  const emRenovacao = certificado.status === 'renovacao_iniciada' || itens.length > 0;

  return (
    <article
      data-tipo={certificado.tipo}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex gap-4">
        <AnelContagem dias={dias} faixa={faixa} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="truncate text-base font-semibold text-zinc-900" title={certificado.titular}>
            {certificado.titular || 'Sem titular'}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-700">
              e-CNPJ {certificado.tipo || '—'}
            </span>
            <span className={`rounded-full px-2 py-0.5 ring-1 ${meta.badge}`}>{meta.rotulo}</span>
          </div>
          <p className="text-xs text-zinc-500">
            Validade:{' '}
            <span className="font-medium text-zinc-700">{formatarData(certificado.validade)}</span>
          </p>
          {certificado.serial ? (
            <p className="truncate text-[11px] text-zinc-400" title={certificado.serial}>
              Serial: {certificado.serial}
            </p>
          ) : null}
        </div>
      </div>

      <CaminhoLocal valor={certificado.caminho_local} />

      {emRenovacao ? (
        <ChecklistRenovacao
          certificadoId={certificado.id}
          tipo={certificado.tipo}
          itens={itens}
          podeGerenciar={podeGerenciar}
          itensSalvando={itensSalvando}
          onToggleItem={(item, concluido) => onToggleItem(certificado, item, concluido)}
          onAlterarDataItem={(item, data) => onAlterarDataItem(certificado, item, data)}
        />
      ) : podeGerenciar ? (
        <button
          type="button"
          onClick={() => onIniciarRenovacao(certificado)}
          disabled={iniciando}
          className="inline-flex items-center justify-center gap-2 self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {iniciando ? <Spinner /> : null}
          Iniciar Renovação
        </button>
      ) : null}

      {aviso ? <p className="text-[11px] text-amber-700">{aviso}</p> : null}
    </article>
  );
}

function ModalCadastro({ aberto, salvando, erro, onFechar, onSalvar }) {
  const [tipo, setTipo] = useState('A1');
  const [titular, setTitular] = useState('');
  const [serial, setSerial] = useState('');
  const [validade, setValidade] = useState('');
  const [caminhoLocal, setCaminhoLocal] = useState('');

  useEffect(() => {
    if (aberto) {
      setTipo('A1');
      setTitular('');
      setSerial('');
      setValidade('');
      setCaminhoLocal('');
    }
  }, [aberto]);

  if (!aberto) return null;

  const podeSalvar = Boolean(titular.trim()) && Boolean(validade) && !salvando;

  function handleSubmit(evento) {
    evento.preventDefault();
    if (!podeSalvar) return;
    onSalvar({
      tipo,
      titular: titular.trim(),
      serial: serial.trim() || undefined,
      validade,
      caminho_local: caminhoLocal.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Novo certificado"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-zinc-200 bg-white shadow-xl"
      >
        <header className="flex items-start justify-between border-b border-zinc-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Novo certificado</h2>
            <p className="mt-1 text-sm text-zinc-500">
              O arquivo do certificado permanece na máquina do escritório — o sistema guarda apenas
              tipo, titular, serial, validade e o caminho local.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            X
          </button>
        </header>

        <form className="space-y-4 overflow-y-auto p-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-zinc-700">Tipo</span>
              <select
                value={tipo}
                onChange={(evento) => setTipo(evento.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="A1">A1 — arquivo digital</option>
                <option value="A3">A3 — token / cartão físico</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-zinc-700">
                Validade <span aria-hidden="true" className="text-rose-500">*</span>
              </span>
              <input
                type="date"
                value={validade}
                onChange={(evento) => setValidade(evento.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="block text-xs font-medium text-zinc-700">
              Titular <span aria-hidden="true" className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              value={titular}
              onChange={(evento) => setTitular(evento.target.value)}
              placeholder="e-CPF ou e-CNPJ do titular"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="block text-xs font-medium text-zinc-700">Serial</span>
            <input
              type="text"
              value={serial}
              onChange={(evento) => setSerial(evento.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="block text-xs font-medium text-zinc-700">Caminho local do arquivo</span>
            <input
              type="text"
              value={caminhoLocal}
              onChange={(evento) => setCaminhoLocal(evento.target.value)}
              placeholder="C:\clientes\padaria-do-joao\certificado digital\"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </label>

          {erro ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {erro}
            </p>
          ) : null}

          <footer className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeSalvar}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? <Spinner /> : null}
              Cadastrar
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function CertificadosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;
  const podeGerenciar = PERFIS_GERENCIAM.has(user?.perfil);

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');
  const [clienteId, setClienteId] = useState(null);
  const clienteIdEfetivo = isAdminEfficience ? clienteId : user?.cliente_id || null;

  const [certificados, setCertificados] = useState([]);
  const [isLoadingCertificados, setIsLoadingCertificados] = useState(false);
  const [erroCertificados, setErroCertificados] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const [erroCadastro, setErroCadastro] = useState('');

  const [iniciandoId, setIniciandoId] = useState(null);
  const [itensSalvando, setItensSalvando] = useState({});
  const [avisos, setAvisos] = useState({});

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

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
    if (!isLoading && isAuthenticated && isAdminEfficience) {
      carregarClientes();
    }
  }, [carregarClientes, isAdminEfficience, isAuthenticated, isLoading]);

  const carregarCertificados = useCallback(async () => {
    if (!clienteIdEfetivo) {
      setCertificados([]);
      return;
    }
    setIsLoadingCertificados(true);
    setErroCertificados('');
    try {
      const data = await listarCertificados({ clienteId: clienteIdEfetivo });
      setCertificados(normalizarLista(data));
    } catch (error) {
      setCertificados([]);
      setErroCertificados(
        obterMensagemErro(error, 'Não foi possível carregar os certificados.'),
      );
    } finally {
      setIsLoadingCertificados(false);
    }
  }, [clienteIdEfetivo]);

  useEffect(() => {
    carregarCertificados();
  }, [carregarCertificados]);

  const certificadosOrdenados = useMemo(() => {
    return [...certificados].sort((a, b) => {
      const da = calcularDias(a);
      const db = calcularDias(b);
      return (da === null ? Infinity : da) - (db === null ? Infinity : db);
    });
  }, [certificados]);

  function atualizarCertificadoNoEstado(id, updater) {
    setCertificados((lista) => lista.map((cert) => (cert.id === id ? updater(cert) : cert)));
  }

  function aplicarItem(certId, itemId, updater) {
    atualizarCertificadoNoEstado(certId, (cert) => ({
      ...cert,
      renovacao_checklist: {
        itens: normalizarItens(cert.renovacao_checklist).map((item) =>
          item.id === itemId ? updater(item) : item,
        ),
      },
    }));
  }

  function definirAviso(certId, mensagem) {
    setAvisos((atual) => ({ ...atual, [certId]: mensagem }));
  }

  function limparAviso(certId) {
    setAvisos((atual) => {
      if (!(certId in atual)) return atual;
      const proximo = { ...atual };
      delete proximo[certId];
      return proximo;
    });
  }

  async function handleCadastrar(payload) {
    setSalvandoCadastro(true);
    setErroCadastro('');
    try {
      await criarCertificado(
        isAdminEfficience && clienteIdEfetivo
          ? { ...payload, cliente_id: clienteIdEfetivo }
          : payload,
      );
      setModalAberto(false);
      await carregarCertificados();
    } catch (error) {
      setErroCadastro(obterMensagemErro(error, 'Não foi possível cadastrar o certificado.'));
    } finally {
      setSalvandoCadastro(false);
    }
  }

  async function handleIniciarRenovacao(certificado) {
    setIniciandoId(certificado.id);
    limparAviso(certificado.id);
    try {
      const atualizado = await iniciarRenovacao(certificado.id);
      const checklist = atualizado?.renovacao_checklist
        ? { itens: normalizarItens(atualizado.renovacao_checklist) }
        : montarChecklistLocal(certificado.tipo);
      atualizarCertificadoNoEstado(certificado.id, (cert) => ({
        ...cert,
        ...atualizado,
        status: atualizado?.status || 'renovacao_iniciada',
        renovacao_checklist: checklist,
      }));
    } catch (error) {
      // Endpoint CD-2 ainda não disponível no ambiente: materializa localmente
      // para o fluxo continuar utilizável (padrão do esocial page com ES-5).
      atualizarCertificadoNoEstado(certificado.id, (cert) => ({
        ...cert,
        status: 'renovacao_iniciada',
        renovacao_checklist: montarChecklistLocal(certificado.tipo),
      }));
      definirAviso(
        certificado.id,
        obterMensagemErro(
          error,
          'Renovação iniciada localmente — o back-end de certificados ainda não está disponível neste ambiente.',
        ),
      );
    } finally {
      setIniciandoId(null);
    }
  }

  async function handleToggleItem(certificado, item, concluido) {
    const chave = `${certificado.id}::${item.id}`;
    setItensSalvando((atual) => ({ ...atual, [chave]: true }));
    aplicarItem(certificado.id, item.id, (it) => ({ ...it, concluido }));
    try {
      const atualizado = await atualizarItemRenovacao(certificado.id, item.id, { concluido });
      if (atualizado?.renovacao_checklist) {
        atualizarCertificadoNoEstado(certificado.id, (cert) => ({
          ...cert,
          ...atualizado,
          renovacao_checklist: { itens: normalizarItens(atualizado.renovacao_checklist) },
        }));
      }
    } catch (error) {
      definirAviso(
        certificado.id,
        obterMensagemErro(
          error,
          'Não foi possível salvar o item no servidor; alteração mantida localmente.',
        ),
      );
    } finally {
      setItensSalvando((atual) => {
        const proximo = { ...atual };
        delete proximo[chave];
        return proximo;
      });
    }
  }

  function handleAlterarDataItem(certificado, item, data) {
    const novosDados = { ...(item.dados || {}), data };
    aplicarItem(certificado.id, item.id, (it) => ({ ...it, dados: novosDados }));
    atualizarItemRenovacao(certificado.id, item.id, { dados: novosDados }).catch((error) => {
      definirAviso(
        certificado.id,
        obterMensagemErro(
          error,
          'Não foi possível salvar a data no servidor; alteração mantida localmente.',
        ),
      );
    });
  }

  if (isLoading) return <p className="p-6">Carregando...</p>;
  if (!isAuthenticated) return null;

  const aguardandoCliente = isAdminEfficience && !clienteIdEfetivo;

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-zinc-400">
            <EscudoIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Certificado Digital</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Contagem regressiva de vencimento por cliente e checklist de renovação. Verde acima de
              60 dias, âmbar entre 30 e 60, vermelho abaixo de 30, cinza quando vencido.
            </p>
          </div>
        </div>

        {podeGerenciar && !aguardandoCliente ? (
          <button
            type="button"
            onClick={() => {
              setErroCadastro('');
              setModalAberto(true);
            }}
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Novo certificado
          </button>
        ) : null}
      </header>

      {isAdminEfficience ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="min-w-[240px] max-w-md space-y-2 block">
            <span className="text-sm font-medium text-zinc-700">Cliente</span>
            <select
              value={clienteId || ''}
              onChange={(evento) => setClienteId(evento.target.value || null)}
              disabled={isLoadingClientes || Boolean(erroClientes)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {isLoadingClientes ? 'Carregando clientes...' : 'Selecione um cliente'}
              </option>
              {[...clientes]
                .sort((a, b) => obterNomeCliente(a).localeCompare(obterNomeCliente(b), 'pt-BR'))
                .map((cliente) => {
                  const id = obterIdCliente(cliente);
                  return (
                    <option key={id} value={id}>
                      {obterNomeCliente(cliente)}
                    </option>
                  );
                })}
            </select>
          </label>
          {erroClientes ? <p className="mt-2 text-sm text-rose-700">{erroClientes}</p> : null}
        </section>
      ) : null}

      {aguardandoCliente ? (
        <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-sm text-sky-900">Selecione um cliente para ver os certificados.</p>
        </section>
      ) : (
        <>
          {erroCertificados ? (
            <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-sm font-medium text-rose-800">{erroCertificados}</p>
            </section>
          ) : null}

          {isLoadingCertificados ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-zinc-600">Carregando certificados...</p>
            </section>
          ) : null}

          {!isLoadingCertificados && !erroCertificados && certificadosOrdenados.length === 0 ? (
            <section className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-zinc-600">
                Nenhum certificado cadastrado para este cliente ainda.
              </p>
              {podeGerenciar ? (
                <p className="mt-1 text-xs text-zinc-400">
                  Use “Novo certificado” para cadastrar o primeiro.
                </p>
              ) : null}
            </section>
          ) : null}

          {certificadosOrdenados.length > 0 ? (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {certificadosOrdenados.map((certificado) => (
                <CertificadoCard
                  key={certificado.id}
                  certificado={certificado}
                  podeGerenciar={podeGerenciar}
                  iniciando={iniciandoId === certificado.id}
                  itensSalvando={itensSalvando}
                  aviso={avisos[certificado.id] || ''}
                  onIniciarRenovacao={handleIniciarRenovacao}
                  onToggleItem={handleToggleItem}
                  onAlterarDataItem={handleAlterarDataItem}
                />
              ))}
            </section>
          ) : null}
        </>
      )}

      <ModalCadastro
        aberto={modalAberto}
        salvando={salvandoCadastro}
        erro={erroCadastro}
        onFechar={() => {
          if (!salvandoCadastro) setModalAberto(false);
        }}
        onSalvar={handleCadastrar}
      />
    </main>
  );
}
