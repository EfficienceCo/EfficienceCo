'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';

const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

function formatarMesReferencia(valor) {
  if (!REGEX_MES_REFERENCIA.test(valor || '')) {
    return '-';
  }

  const [anoTexto, mesTexto] = valor.split('-');
  const data = new Date(Number.parseInt(anoTexto, 10), Number.parseInt(mesTexto, 10) - 1, 1);

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(data);
}

function StatusFolhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  const processamentoId = searchParams.get('processamento_id') || '';
  const mesReferencia = searchParams.get('mes_referencia') || '';
  const clienteNome = searchParams.get('cliente_nome') || '';

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  const mesFormatado = useMemo(() => formatarMesReferencia(mesReferencia), [mesReferencia]);

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
          <h1 className="text-2xl font-semibold text-zinc-900">Status da folha</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe o processamento iniciado pelo upload da planilha.
          </p>
        </div>

        <Link
          href="/dashboard/folha/upload"
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
        >
          Novo upload
        </Link>
      </header>

      {!processamentoId ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            Nenhum processamento foi informado para consulta.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Processamento
                </p>
                <p className="mt-2 break-all text-lg font-semibold text-zinc-900">
                  {processamentoId}
                </p>
              </div>

              <span className="self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Pendente
              </span>
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Mês
                </dt>
                <dd className="mt-1 text-sm font-medium text-zinc-800">{mesFormatado}</dd>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Cliente
                </dt>
                <dd className="mt-1 text-sm font-medium text-zinc-800">
                  {clienteNome || 'Cliente vinculado ao usuário'}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-900">
                Upload aceito. A planilha foi validada e registrada para processamento.
              </p>
            </div>
          </article>

          <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Próximas etapas
            </p>
            <ol className="mt-4 space-y-3 text-sm text-zinc-700">
              <li className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                Planilha recebida
              </li>
              <li className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                Processamento pendente
              </li>
              <li className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                Resultado da folha
              </li>
            </ol>
          </aside>
        </section>
      )}
    </main>
  );
}

export default function StatusFolhaPage() {
  return (
    <Suspense fallback={<p>Carregando status...</p>}>
      <StatusFolhaContent />
    </Suspense>
  );
}
