'use client';

import { useCallback, useEffect, useState } from 'react';
import { listarProximasObrigacoes } from '../../services/obrigacoes.service';
import WidgetCard from './WidgetCard';

const DIAS_PADRAO = 7;
const LIMITE_VISUAL = 5;

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Não foi possível carregar as obrigações.'
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

function obterTituloObrigacao(obrigacao, index) {
  return (
    obrigacao?.titulo ||
    obrigacao?.nome ||
    obrigacao?.descricao ||
    obrigacao?.tipo ||
    `Obrigação ${index + 1}`
  );
}

function obterDataVencimento(obrigacao) {
  return (
    obrigacao?.vencimento ||
    obrigacao?.data_vencimento ||
    obrigacao?.prazo ||
    obrigacao?.data
  );
}

function obterStatus(obrigacao) {
  return obrigacao?.status || obrigacao?.situacao || '';
}

function formatarData(data) {
  if (!data) {
    return 'Sem vencimento';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return 'Data inválida';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(valor);
}

export default function ProximasObrigacoesWidget() {
  const [obrigacoes, setObrigacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarObrigacoes = useCallback(async () => {
    setIsLoading(true);
    setErro('');

    try {
      const payload = await listarProximasObrigacoes({ dias: DIAS_PADRAO });
      setObrigacoes(normalizarObrigacoes(payload));
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarObrigacoes();
  }, [carregarObrigacoes]);

  return (
    <WidgetCard
      title="Próximas obrigações"
      description={`Vencimentos dos próximos ${DIAS_PADRAO} dias.`}
      href="/dashboard/obrigacoes"
    >
      {isLoading ? (
        <p className="text-sm text-zinc-500">Carregando vencimentos...</p>
      ) : null}

      {!isLoading && erro ? (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{erro}</p>
          <button
            type="button"
            onClick={carregarObrigacoes}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-800"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!isLoading && !erro && obrigacoes.length === 0 ? (
        <p className="text-sm text-zinc-600">Nenhuma obrigação para os próximos dias.</p>
      ) : null}

      {!isLoading && !erro && obrigacoes.length > 0 ? (
        <ul className="space-y-2">
          {obrigacoes.slice(0, LIMITE_VISUAL).map((obrigacao, index) => {
            const titulo = obterTituloObrigacao(obrigacao, index);
            const vencimento = formatarData(obterDataVencimento(obrigacao));
            const status = obterStatus(obrigacao);

            return (
              <li
                key={obrigacao?.id || `${titulo}-${vencimento}-${index}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-900">{titulo}</p>
                  {status ? (
                    <span className="whitespace-nowrap rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-zinc-600">Vence em: {vencimento}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </WidgetCard>
  );
}
