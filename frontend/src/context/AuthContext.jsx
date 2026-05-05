'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { limparToken, obterSessao, salvarToken } from '../services/session.service';

const AuthContext = createContext(null);

function obterEstadoAutenticacao() {
  const sessao = obterSessao();

  if (sessao.expirado && sessao.token) {
    limparToken();
    return { token: null, user: null };
  }

  return {
    token: sessao.token,
    user: sessao.usuario,
  };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const sincronizarSessao = useCallback(() => {
    const estado = obterEstadoAutenticacao();
    setToken(estado.token);
    setUser(estado.user);
    setIsLoading(false);
  }, []);

  const login = useCallback(
    (novoToken) => {
      salvarToken(novoToken);
      sincronizarSessao();
    },
    [sincronizarSessao],
  );

  const logout = useCallback(() => {
    limparToken();
    sincronizarSessao();
  }, [sincronizarSessao]);

  useEffect(() => {
    sincronizarSessao();

    const handleStorage = (event) => {
      if (event.key === 'token') {
        sincronizarSessao();
      }
    };

    const handleTokenChanged = () => {
      sincronizarSessao();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('auth-token-changed', handleTokenChanged);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('auth-token-changed', handleTokenChanged);
    };
  }, [sincronizarSessao]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      isLoading,
      login,
      logout,
    }),
    [token, user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de AuthProvider.');
  }

  return context;
}
