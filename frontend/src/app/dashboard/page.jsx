'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import StatusLicenca from '../../components/dashboard/StatusLicenca';
import ProximasObrigacoesWidget from '../../components/dashboard/ProximasObrigacoesWidget';
import ProcessosWidget from '../../components/dashboard/ProcessosWidget';
import NotificacoesWidget from '../../components/dashboard/NotificacoesWidget';
import AgenteEventosWidget from '../../components/dashboard/AgenteEventosWidget';

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
        <p className="mt-1 text-sm text-zinc-500">
          Acompanhe os principais dados dos módulos em tempo real.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <StatusLicenca />
        <ProximasObrigacoesWidget />
        <ProcessosWidget />
        <NotificacoesWidget />
        <AgenteEventosWidget />
      </section>
    </main>
  );
}
