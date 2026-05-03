'use client';

import { useCallback, useEffect, useState } from 'react';
import { getStatusLicencaClienteLogado } from '../../services/licencas.service';

const STATUS_LABELS = {
  active: 'Ativa',
  expired: 'Expirada',
  suspended: 'Inativa',
};

const STATUS_BADGE_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-rose-100 text-rose-700',
  suspended: 'bg-zinc-200 text-zinc-800',
};

function formatarData(data) {
  if (!data) {
    return 'Sem data definida';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return 'Data invalida';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

function formatarErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Nao foi possivel carregar o status da licenca.'
  );
}

export default function StatusLicenca() {
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
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Status da Licenca</h2>
        <p className="mt-2 text-sm text-zinc-500">Carregando informacoes da licenca...</p>
      </section>
    );
  }

  if (erro) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-900">Status da Licenca</h2>
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

  const badgeStyle = STATUS_BADGE_STYLES[statusLicenca.status] || 'bg-zinc-200 text-zinc-800';
  const badgeLabel = STATUS_LABELS[statusLicenca.status] || 'Desconhecido';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Status da Licenca</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>{badgeLabel}</span>
      </div>

      <dl className="mt-4 grid gap-4 text-sm text-zinc-700 md:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Cliente</dt>
          <dd className="font-medium text-zinc-900">{statusLicenca.clienteId}</dd>
        </div>

        <div>
          <dt className="text-zinc-500">Validade</dt>
          <dd className="font-medium text-zinc-900">{formatarData(statusLicenca.validade)}</dd>
        </div>

        <div>
          <dt className="text-zinc-500">Ativa no backend</dt>
          <dd className="font-medium text-zinc-900">{statusLicenca.ativa ? 'Sim' : 'Nao'}</dd>
        </div>
      </dl>
    </section>
  );
}
