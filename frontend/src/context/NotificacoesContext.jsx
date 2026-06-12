'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listar, marcarLida } from '../services/notificacoes.service';
import { useAuth } from './AuthContext';

const NotificacoesContext = createContext(null);

function obterMensagemErro(error, fallback) {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function normalizarNotificacoes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.notificacoes)) {
    return payload.notificacoes;
  }

  return [];
}

export function obterDataNotificacao(notificacao) {
  return (
    notificacao?.criado_em ||
    notificacao?.created_at ||
    notificacao?.data ||
    notificacao?.timestamp
  );
}

function obterTimestamp(notificacao) {
  const data = obterDataNotificacao(notificacao);
  const valor = new Date(data || '');
  if (Number.isNaN(valor.getTime())) {
    return 0;
  }

  return valor.getTime();
}

function ordenarPorMaisRecente(notificacoes) {
  return [...notificacoes].sort((a, b) => obterTimestamp(b) - obterTimestamp(a));
}

export function notificacaoNaoLida(notificacao) {
  if (!notificacao) {
    return false;
  }

  if (notificacao.nao_lida === true) {
    return true;
  }

  if (notificacao.lida === false || notificacao.lido === false || notificacao.read === false) {
    return true;
  }

  const status = String(notificacao.status || '').toLowerCase();
  if (status === 'nao_lida' || status === 'nao lida' || status === 'unread') {
    return true;
  }

  return false;
}

function marcarComoLidaLocal(notificacao) {
  const statusNormalizado = String(notificacao?.status || '').toLowerCase();
  const statusNaoLido =
    statusNormalizado === 'nao_lida' ||
    statusNormalizado === 'nao lida' ||
    statusNormalizado === 'unread';

  return {
    ...notificacao,
    nao_lida: false,
    lida: true,
    lido: true,
    read: true,
    status: statusNaoLido ? 'lida' : notificacao?.status,
  };
}

export function NotificacoesProvider({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [notificacoes, setNotificacoes] = useState([]);
  const [isLoadingNotificacoes, setIsLoadingNotificacoes] = useState(false);
  const [erro, setErro] = useState('');
  const [isAtualizando, setIsAtualizando] = useState(false);

  const carregarNotificacoes = useCallback(async () => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoadingNotificacoes(true);
    setErro('');

    try {
      const payload = await listar();
      setNotificacoes(ordenarPorMaisRecente(normalizarNotificacoes(payload)));
    } catch (error) {
      setErro(obterMensagemErro(error, 'Não foi possível carregar as notificações.'));
    } finally {
      setIsLoadingNotificacoes(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      setNotificacoes([]);
      setErro('');
      setIsLoadingNotificacoes(false);
      setIsAtualizando(false);
      return;
    }

    carregarNotificacoes();
  }, [carregarNotificacoes, isAuthenticated, isLoading]);

  const marcarComoLida = useCallback(async (id) => {
    if (!id) {
      return;
    }

    setIsAtualizando(true);

    try {
      await marcarLida(id);
      setNotificacoes((currentValue) =>
        currentValue.map((notificacao) =>
          String(notificacao?.id) === String(id)
            ? marcarComoLidaLocal(notificacao)
            : notificacao,
        ),
      );
    } finally {
      setIsAtualizando(false);
    }
  }, []);

  const marcarTodasComoLidas = useCallback(async () => {
    const pendentes = notificacoes.filter(notificacaoNaoLida);
    if (pendentes.length === 0) {
      return;
    }

    setIsAtualizando(true);

    try {
      await Promise.all(
        pendentes.map((notificacao) =>
          notificacao?.id ? marcarLida(notificacao.id) : Promise.resolve(),
        ),
      );

      setNotificacoes((currentValue) =>
        currentValue.map((notificacao) =>
          notificacaoNaoLida(notificacao)
            ? marcarComoLidaLocal(notificacao)
            : notificacao,
        ),
      );
    } finally {
      setIsAtualizando(false);
    }
  }, [notificacoes]);

  const naoLidas = useMemo(
    () => notificacoes.filter(notificacaoNaoLida).length,
    [notificacoes],
  );

  const value = useMemo(
    () => ({
      notificacoes,
      naoLidas,
      isLoadingNotificacoes,
      erro,
      isAtualizando,
      carregarNotificacoes,
      marcarComoLida,
      marcarTodasComoLidas,
    }),
    [
      notificacoes,
      naoLidas,
      isLoadingNotificacoes,
      erro,
      isAtualizando,
      carregarNotificacoes,
      marcarComoLida,
      marcarTodasComoLidas,
    ],
  );

  return <NotificacoesContext.Provider value={value}>{children}</NotificacoesContext.Provider>;
}

export function useNotificacoes() {
  const context = useContext(NotificacoesContext);

  if (!context) {
    throw new Error('useNotificacoes precisa ser usado dentro de NotificacoesProvider.');
  }

  return context;
}
