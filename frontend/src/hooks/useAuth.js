'use client';

import { useEffect, useState } from 'react';
import { limparToken, obterSessao } from '../services/session.service';

export function useAuth() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const atualizarSessao = () => {
      const sessao = obterSessao();

      if (sessao.expirado && sessao.token) {
        limparToken();
        setToken(null);
        setUser(null);
      } else {
        setToken(sessao.token);
        setUser(sessao.usuario);
      }

      setIsLoading(false);
    };

    atualizarSessao();

    const handleStorage = (event) => {
      if (event.key === 'token') {
        atualizarSessao();
      }
    };

    const handleTokenChanged = () => {
      atualizarSessao();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('auth-token-changed', handleTokenChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('auth-token-changed', handleTokenChanged);
    };
  }, []);

  return {
    token,
    user,
    isAuthenticated: Boolean(token),
    isLoading,
    logout: limparToken,
  };
}
