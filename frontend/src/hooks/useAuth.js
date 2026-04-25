'use client';

import { useEffect, useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = window.localStorage.getItem('token');
    setToken(savedToken);
    setIsLoading(false);

    const handleStorage = (event) => {
      if (event.key === 'token') {
        setToken(event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return {
    token,
    isAuthenticated: Boolean(token),
    isLoading,
  };
}
