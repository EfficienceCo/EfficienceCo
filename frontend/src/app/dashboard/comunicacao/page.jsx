'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  notificacaoNaoLida,
  obterDataNotificacao,
  useNotificacoes,
} from '../../../context/NotificacoesContext';
import { useAuth } from '../../../context/AuthContext';

function obterMensagemErro(error) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    'Não foi possível atualizar a notificação.'
  );
}

function obterTitulo(notificacao, index) {
  return (
    notificacao?.titulo ||
    notificacao?.assunto ||
    notificacao?.mensagem ||
    notificacao?.descricao ||
    `Notificação ${index + 1}`
  );
}

function obterDescricao(notificacao) {
  if (notificacao?.descricao) {
    return notificacao.descricao;
  }

  if (notificacao?.mensagem && notificacao?.mensagem !== notificacao?.titulo) {
    return notificacao.mensagem;
  }

  if (notificacao?.detalhe) {
    return notificacao.detalhe;
  }

  return '';
}

function formatarDataHora(data) {
  if (!data) {
    return '-';
  }

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(valor);
}

function obterTimestamp(notificacao) {
  const data = obterDataNotificacao(notificacao);
  const valor = new Date(data || '');

  if (Number.isNaN(valor.getTime())) {
    return 0;
  }

  return valor.getTime();
}

function obterTipoNotificacao(notificacao) {
  const campos = [
    notificacao?.tipo,
    notificacao?.categoria,
    notificacao?.origem,
    notificacao?.contexto,
    notificacao?.titulo,
    notificacao?.descricao,
    notificacao?.mensagem,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (campos.includes('obrig')) {
    return {
      chave: 'obrigacao',
      label: 'Obrigação',
      icon: ObrigacaoIcon,
      classes: 'bg-indigo-100 text-indigo-700',
    };
  }

  if (campos.includes('process')) {
    return {
      chave: 'processo',
      label: 'Processo',
      icon: ProcessoIcon,
      classes: 'bg-amber-100 text-amber-700',
    };
  }

  if (campos.includes('arquiv') || campos.includes('document')) {
    return {
      chave: 'arquivo',
      label: 'Arquivo',
      icon: ArquivoIcon,
      classes: 'bg-emerald-100 text-emerald-700',
    };
  }

  return {
    chave: 'geral',
    label: 'Geral',
    icon: GeralIcon,
    classes: 'bg-slate-100 text-slate-700',
  };
}

export default function ComunicacaoPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const {
    notificacoes,
    naoLidas,
    erro,
    isLoadingNotificacoes,
    isAtualizando,
    carregarNotificacoes,
    marcarComoLida,
    marcarTodasComoLidas,
  } = useNotificacoes();

  const [erroAcao, setErroAcao] = useState('');
  const [idAtualizando, setIdAtualizando] = useState(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  const notificacoesOrdenadas = useMemo(
    () => [...notificacoes].sort((a, b) => obterTimestamp(b) - obterTimestamp(a)),
    [notificacoes],
  );

  const totalLidas = useMemo(
    () => notificacoesOrdenadas.length - naoLidas,
    [notificacoesOrdenadas.length, naoLidas],
  );

  const handleMarcarComoLida = useCallback(
    async (id) => {
      if (!id) {
        return;
      }

      setErroAcao('');
      setIdAtualizando(id);

      try {
        await marcarComoLida(id);
      } catch (error) {
        setErroAcao(obterMensagemErro(error));
      } finally {
        setIdAtualizando(null);
      }
    },
    [marcarComoLida],
  );

  const handleMarcarTodas = useCallback(async () => {
    setErroAcao('');

    try {
      await marcarTodasComoLidas();
    } catch (error) {
      setErroAcao(obterMensagemErro(error));
    }
  }, [marcarTodasComoLidas]);

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Central de notificações</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe alertas de obrigações, processos e arquivos em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={carregarNotificacoes}
            disabled={isLoadingNotificacoes}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingNotificacoes ? 'Atualizando...' : 'Atualizar lista'}
          </button>
          <button
            type="button"
            onClick={handleMarcarTodas}
            disabled={naoLidas === 0 || isAtualizando}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAtualizando ? 'Processando...' : 'Marcar todas como lidas'}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Não lidas</p>
          <p className="mt-2 text-4xl font-bold leading-none text-sky-900">{naoLidas}</p>
        </article>
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lidas</p>
          <p className="mt-2 text-4xl font-bold leading-none text-zinc-900">{totalLidas}</p>
        </article>
      </section>

      {erro ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erro}</p>
        </section>
      ) : null}

      {erroAcao ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroAcao}</p>
        </section>
      ) : null}

      {!erro && isLoadingNotificacoes && notificacoesOrdenadas.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-500">Carregando notificações...</p>
        </section>
      ) : null}

      {!erro && !isLoadingNotificacoes && notificacoesOrdenadas.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">Nenhuma notificação encontrada.</p>
        </section>
      ) : null}

      {!erro && notificacoesOrdenadas.length > 0 ? (
        <section className="space-y-3">
          {notificacoesOrdenadas.map((notificacao, index) => {
            const naoLida = notificacaoNaoLida(notificacao);
            const tipo = obterTipoNotificacao(notificacao);
            const IconeTipo = tipo.icon;
            const titulo = obterTitulo(notificacao, index);
            const descricao = obterDescricao(notificacao);
            const data = formatarDataHora(obterDataNotificacao(notificacao));
            const aguardandoAtualizacao = idAtualizando === notificacao?.id;

            return (
              <article
                key={notificacao?.id || `${titulo}-${index}`}
                className={`rounded-xl border p-4 shadow-sm transition ${
                  naoLida
                    ? 'border-sky-200 bg-sky-50'
                    : 'border-zinc-200 bg-white opacity-75'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tipo.classes}`}
                      >
                        <IconeTipo />
                        {tipo.label}
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          naoLida
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {naoLida ? 'Não lida' : 'Lida'}
                      </span>

                      <span className="text-xs text-zinc-500">{data}</span>
                    </div>

                    <p className="text-base font-semibold text-zinc-900">{titulo}</p>
                    {descricao ? <p className="text-sm text-zinc-600">{descricao}</p> : null}
                  </div>

                  {naoLida ? (
                    <button
                      type="button"
                      onClick={() => handleMarcarComoLida(notificacao?.id)}
                      disabled={!notificacao?.id || aguardandoAtualizacao || isAtualizando}
                      className="shrink-0 rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {aguardandoAtualizacao ? 'Marcando...' : 'Marcar como lida'}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}

function IconeBase({ children }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-3.5 w-3.5"
    >
      {children}
    </svg>
  );
}

function ObrigacaoIcon() {
  return (
    <IconeBase>
      <path d="M7 3.5v3" />
      <path d="M17 3.5v3" />
      <rect x="4" y="6.5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
    </IconeBase>
  );
}

function ProcessoIcon() {
  return (
    <IconeBase>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </IconeBase>
  );
}

function ArquivoIcon() {
  return (
    <IconeBase>
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 12h6" />
      <path d="M9 15.5h6" />
    </IconeBase>
  );
}

function GeralIcon() {
  return (
    <IconeBase>
      <path d="M12 4.5a4.5 4.5 0 0 0-4.5 4.5v2.7L6 14v1h12v-1l-1.5-2.3V9A4.5 4.5 0 0 0 12 4.5Z" />
      <path d="M9.5 17.5a2.5 2.5 0 0 0 5 0" />
    </IconeBase>
  );
}
