'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import StatusLicenca from '../../components/dashboard/StatusLicenca';

export default function Dashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Acompanhe os dados da sua conta e da sua licenca.</p>
      </header>

      <StatusLicenca />
    </main>
  );
}
