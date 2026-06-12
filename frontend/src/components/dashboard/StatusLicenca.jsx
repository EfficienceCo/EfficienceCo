'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getStatusLicencaClienteLogado } from '../../services/licencas.service';

const DIAS_AVISO_VENCIMENTO = 7;
const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS = {
  active: 'Ativa',
  expired: 'Expirada',
  suspended: 'Inativa',
};

const STATUS_BADGE_STYLES = {
  active: 'bg-amber-100 text-amber-800',
  expired: 'bg-rose-100 text-rose-700',
  suspended: 'bg-zinc-200 text-zinc-800',
};

const LINK_STYLES = {
  warning:
    'whitespace-nowrap rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100',
  danger:
    'whitespace-nowrap rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100',
  default:
    'whitespace-nowrap rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100',
};

function obterDataValidade(data) {
  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    const matchDataIso = data.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchDataIso) {
      const [, ano, mes, dia] = matchDataIso;
      return new Date(Number(ano), Number(mes) - 1, Number(dia));
    }
  }

  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? null : valor;
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function calcularDiasAteVencimento(dataValidade) {
  if (!dataValidade) {
    return null;
  }

  const hoje = inicioDoDia(new Date());
  const validade = inicioDoDia(dataValidade);

  return Math.round((validade.getTime() - hoje.getTime()) / UM_DIA_EM_MS);
}

function formatarData(data) {
  const valor = obterDataValidade(data);
  if (!valor) {
    return 'Data inválida';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function formatarErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Não foi possível carregar o status da licença.'
  );
}

function normalizarStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function obterStatusEfetivo(statusLicenca, diasAteVencimento) {
  if (typeof diasAteVencimento === 'number' && diasAteVencimento < 0) {
    return 'expired';
  }

  const status = normalizarStatus(statusLicenca?.status);
  if (status) {
    return status;
  }

  return statusLicenca?.ativa ? 'active' : 'suspended';
}

function licencaEstaAtiva(statusLicenca, statusEfetivo) {
  if (statusEfetivo === 'expired' || statusEfetivo === 'suspended') {
    return false;
  }

  return statusEfetivo === 'active' || statusLicenca?.ativa === true;
}

function formatarResumoVencimento(diasAteVencimento) {
  if (diasAteVencimento === 0) {
    return 'Expira hoje';
  }

  if (diasAteVencimento === 1) {
    return 'Expira amanhã';
  }

  return `Expira em ${diasAteVencimento} dias`;
}

function DetalhesLink({ href, variant = 'default' }) {
  if (!href) {
    return null;
  }

  return (
    <Link href={href} className={LINK_STYLES[variant] || LINK_STYLES.default}>
      Ver detalhes
    </Link>
  );
}

export default function StatusLicenca({ detalhesHref = '/admin/licencas' }) {
  const [statusLicenca, setStatusLicenca] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarStatus = useCallback(async () => {
    setIsLoading(true);
    setErro('');

    try {
      const data = await getStatusLicencaClienteLogado();
      setStatusLicenca(data);
    } catch (error) {
      setErro(formatarErro(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarStatus();
  }, [carregarStatus]);

  if (isLoading) {
    return null;
  }

  if (erro) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-lg font-semibold text-rose-900">Status da Licença</h2>
          <DetalhesLink href={detalhesHref} variant="danger" />
        </div>
        <p className="mt-2 text-sm text-rose-700">{erro}</p>
        <button
          type="button"
          onClick={carregarStatus}
          className="mt-4 rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-800"
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  if (!statusLicenca) {
    return null;
  }

  const dataValidade = obterDataValidade(statusLicenca.validade);
  const diasAteVencimento = calcularDiasAteVencimento(dataValidade);
  const statusEfetivo = obterStatusEfetivo(statusLicenca, diasAteVencimento);
  const estaAtiva = licencaEstaAtiva(statusLicenca, statusEfetivo);

  if (
    estaAtiva &&
    (diasAteVencimento === null || diasAteVencimento > DIAS_AVISO_VENCIMENTO)
  ) {
    return null;
  }

  if (estaAtiva && typeof diasAteVencimento === 'number' && diasAteVencimento >= 0) {
    const dataFormatada = formatarData(statusLicenca.validade);

    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-amber-950">Licença perto do vencimento</h2>
            <p className="mt-2 text-sm text-amber-900">
              Sua licença vence em {dataFormatada}. Regularize antes dessa data para evitar
              interrupções.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <DetalhesLink href={detalhesHref} variant="warning" />
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES.active}`}
            >
              {formatarResumoVencimento(diasAteVencimento)}
            </span>
          </div>
        </div>
      </section>
    );
  }

  const badgeStyle = STATUS_BADGE_STYLES[statusEfetivo] || 'bg-zinc-200 text-zinc-800';
  const badgeLabel = STATUS_LABELS[statusEfetivo] || 'Desconhecido';
  const isExpired = statusEfetivo === 'expired';
  const dataFormatada = statusLicenca.validade ? formatarData(statusLicenca.validade) : '';
  const titulo = isExpired ? 'Licença expirada' : 'Licença inativa';
  const mensagem = isExpired
    ? `A licença expirou${dataFormatada ? ` em ${dataFormatada}` : ''}.`
    : 'A licença está inativa no momento.';

  return (
    <section
      className={`rounded-xl border p-5 shadow-sm ${
        isExpired ? 'border-rose-200 bg-rose-50' : 'border-zinc-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${isExpired ? 'text-rose-900' : 'text-zinc-900'}`}>
            {titulo}
          </h2>
          <p className={`mt-2 text-sm ${isExpired ? 'text-rose-700' : 'text-zinc-600'}`}>
            {mensagem}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <DetalhesLink href={detalhesHref} variant={isExpired ? 'danger' : 'default'} />
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>
            {badgeLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
