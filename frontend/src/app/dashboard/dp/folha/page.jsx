'use client';

import Link from 'next/link';

function IconBase({ children }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {children}
    </svg>
  );
}

function UploadIcon() {
  return (
    <IconBase>
      <path d="M12 20V10" />
      <path d="m8 14 4-4 4 4" />
      <path d="M5 4h14" />
    </IconBase>
  );
}

function StatusIcon() {
  return (
    <IconBase>
      <path d="M5 6.5h9" />
      <path d="M5 11.5h6" />
      <path d="M5 16.5h5" />
      <path d="m14 16.4 1.8 1.8 3.7-4.2" />
    </IconBase>
  );
}

export default function FolhaLandingPage() {
  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Folha de pagamento mensal</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Envie a planilha da folha ou acompanhe o status do processamento mensal.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/folha/upload"
          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <UploadIcon />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Upload da folha</h2>
            <p className="mt-1 text-sm text-zinc-500">Envie a planilha preenchida para iniciar o processamento.</p>
          </div>
        </Link>

        <Link
          href="/dashboard/folha/status"
          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <StatusIcon />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Status da folha</h2>
            <p className="mt-1 text-sm text-zinc-500">Acompanhe o processamento da folha enviada.</p>
          </div>
        </Link>
      </section>
    </main>
  );
}
