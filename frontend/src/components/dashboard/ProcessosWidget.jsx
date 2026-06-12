'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarProcessosEmAndamento } from '../../services/processos.service';
import WidgetCard from './WidgetCard';

const LIMITE_VISUAL = 3;
const ROTULOS_PROCESSO = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  concluida: 'Concluída',
  atrasado: 'Atrasado',
  pendente: 'Pendente',
};

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

function extrairPrazo(processo) {
  return (
    processo?.prazo ||
    processo?.data_limite ||
    processo?.vencimento ||
    processo?.deadline
  );
}

function processoAtrasado(processo) {
  if (!processo) {
    return false;
  }

  if (processo.atrasado === true || processo.em_atraso === true) {
    return true;
  }

  const status = String(processo.status || processo.situacao || '').toLowerCase();
  if (status.includes('atras')) {
    return true;
  }

  const prazo = extrairPrazo(processo);
  if (!prazo) {
    return false;
  }

  const prazoDate = new Date(prazo);
  if (Number.isNaN(prazoDate.getTime())) {
    return false;
  }

  return prazoDate.getTime() < Date.now();
}

function obterTitulo(processo, index) {
  return processo?.titulo || processo?.nome || processo?.descricao || `Processo ${index + 1}`;
}

function obterStatus(processo) {
  return processo?.status || processo?.situacao || 'em_andamento';
}

function formatarStatus(status) {
  const chave = String(status || '').trim().toLowerCase().replace(/[-\s]+/g, '_');

  if (ROTULOS_PROCESSO[chave]) {
    return ROTULOS_PROCESSO[chave];
  }

  return String(status || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((parte) => `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`)
    .join(' ');
}

function calcularAtrasados(payload, processos) {
  if (typeof payload?.total_atrasados === 'number') {
    return payload.total_atrasados;
  }

  if (typeof payload?.atrasados === 'number') {
    return payload.atrasados;
  }

  if (typeof payload?.em_atraso === 'number') {
    return payload.em_atraso;
  }

  return processos.filter(processoAtrasado).length;
}

function calcularTotalEmAndamento(payload, processos) {
  if (typeof payload?.total_em_andamento === 'number') {
    return payload.total_em_andamento;
  }

  if (typeof payload?.total === 'number') {
    return payload.total;
  }

  if (typeof payload?.count === 'number') {
    return payload.count;
  }

  return processos.length;
}

export default function ProcessosWidget() {
  const [payload, setPayload] = useState(null);
  const [processos, setProcessos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarProcessos = useCallback(async () => {
    setIsLoading(true);
    setErro('');

    try {
      const data = await listarProcessosEmAndamento();
      setPayload(data);
      setProcessos(normalizarProcessos(data));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarProcessos();
  }, [carregarProcessos]);

  const totalEmAndamento = useMemo(
    () => calcularTotalEmAndamento(payload, processos),
    [payload, processos],
  );

  const totalAtrasados = useMemo(
    () => calcularAtrasados(payload, processos),
    [payload, processos],
  );

  return (
    <WidgetCard
      title="Processos"
      description="Visão consolidada dos processos ativos."
      href="/dashboard/processos"
    >
      {isLoading ? <p className="text-sm text-zinc-500">Carregando processos...</p> : null}

      {!isLoading && erro ? (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{erro}</p>
          <button
            type="button"
            onClick={carregarProcessos}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-800"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !erro ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Em andamento
              </dt>
              <dd className="mt-1 text-3xl font-bold leading-none text-zinc-900 sm:text-4xl">
                {totalEmAndamento}
              </dd>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Em atraso
              </dt>
              <dd className="mt-1 text-3xl font-bold leading-none text-amber-800 sm:text-4xl">
                {totalAtrasados}
              </dd>
            </div>
          </dl>

          {processos.length > 0 ? (
            <ul className="space-y-2">
              {processos.slice(0, LIMITE_VISUAL).map((processo, index) => (
                <li
                  key={processo?.id || `${obterTitulo(processo, index)}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <p className="text-sm font-medium text-zinc-800">{obterTitulo(processo, index)}</p>
                  <span className="whitespace-nowrap rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                    {formatarStatus(obterStatus(processo))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-600">Nenhum processo em andamento no momento.</p>
          )}
        </div>
      ) : null}
    </WidgetCard>
  );
}
