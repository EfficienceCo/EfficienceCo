'use client';

import Link from 'next/link';
import { useState } from 'react';
import { baixarTemplateFolha } from '../../services/folha.service';
import WidgetCard from './WidgetCard';

function obterMensagemErro(error, fallback = 'Não foi possível baixar a planilha modelo.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function FolhaManualWidget() {
  const [isBaixando, setIsBaixando] = useState(false);
  const [erro, setErro] = useState('');

  async function handleBaixarTemplate() {
    setIsBaixando(true);
    setErro('');

    try {
      const blob = await baixarTemplateFolha();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'modelo_folha_pagamento.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErro(obterMensagemErro(error));
    } finally {
      setIsBaixando(false);
    }
  }

  return (
    <WidgetCard
      title="Folha de pagamento"
      description="Fluxo manual para clientes sem agente instalado."
      href="/dashboard/folha/upload"
      linkLabel="Enviar planilha"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-medium text-zinc-800">Planilha modelo</p>
          <p className="mt-1 text-sm text-zinc-600">
            Baixe o arquivo padrão, preencha os dados e envie pela tela de folha.
          </p>
        </div>

        {erro ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {erro}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBaixarTemplate}
            disabled={isBaixando}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBaixando ? <Spinner /> : null}
            {isBaixando ? 'Baixando...' : 'Baixar planilha modelo'}
          </button>

          <Link
            href="/dashboard/folha/upload"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Abrir upload
          </Link>
        </div>
      </div>
    </WidgetCard>
  );
}
