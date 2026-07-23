'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import { baixarTemplateFolha, uploadFolha } from '../../../../services/folha.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';
const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const REGEX_ARQUIVO_XLSX = /\.xlsx$/i;

function obterMesAtual() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function obterMensagemErro(error, fallback = 'Não foi possível enviar a planilha.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function extrairColunasFaltando(error) {
  const faltando = error?.response?.data?.faltando;
  return Array.isArray(faltando) ? faltando.filter(Boolean) : [];
}

function normalizarClientes(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.clientes)) {
    return payload.clientes;
  }

  return [];
}

function obterIdCliente(cliente) {
  return cliente?.id || cliente?.cliente_id || cliente?.clienteId || '';
}

function obterNomeCliente(cliente) {
  return cliente?.nome || cliente?.razao_social || cliente?.email || obterIdCliente(cliente);
}

function formatarTamanhoArquivo(bytes) {
  if (!Number.isFinite(bytes)) {
    return '';
  }

  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function arquivoEhXlsx(arquivo) {
  if (!arquivo) {
    return false;
  }

  return REGEX_ARQUIVO_XLSX.test(arquivo.name || '');
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

export default function UploadFolhaPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [arquivo, setArquivo] = useState(null);
  const [mesReferencia, setMesReferencia] = useState(obterMesAtual);
  const [clienteId, setClienteId] = useState('');

  const [clientes, setClientes] = useState([]);
  const [isLoadingClientes, setIsLoadingClientes] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [erroUpload, setErroUpload] = useState('');
  const [colunasFaltando, setColunasFaltando] = useState([]);
  const [sucessoUpload, setSucessoUpload] = useState('');

  const [isBaixandoTemplate, setIsBaixandoTemplate] = useState(false);

  const isAdminEfficience = user?.perfil === PERFIL_ADMIN_EFFICIENCE;

  const carregarClientes = useCallback(async () => {
    setIsLoadingClientes(true);
    setErroClientes('');

    try {
      const data = await listarClientes();
      setClientes(normalizarClientes(data));
    } catch (error) {
      setErroClientes(obterMensagemErro(error, 'Não foi possível carregar os clientes.'));
    } finally {
      setIsLoadingClientes(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdminEfficience) {
      carregarClientes();
    }
  }, [carregarClientes, isAdminEfficience, isAuthenticated, isLoading]);

  const clientesOrdenados = useMemo(
    () =>
      [...clientes].sort((clienteA, clienteB) =>
        obterNomeCliente(clienteA).localeCompare(obterNomeCliente(clienteB), 'pt-BR', {
          sensitivity: 'base',
        }),
      ),
    [clientes],
  );

  const clienteSelecionado = useMemo(
    () => clientesOrdenados.find((cliente) => String(obterIdCliente(cliente)) === String(clienteId)),
    [clienteId, clientesOrdenados],
  );

  function handleArquivoChange(event) {
    const arquivoSelecionado = event.target.files?.[0] || null;

    setSucessoUpload('');
    setColunasFaltando([]);

    if (!arquivoSelecionado) {
      setArquivo(null);
      return;
    }

    if (!arquivoEhXlsx(arquivoSelecionado)) {
      event.target.value = '';
      setArquivo(null);
      setErroUpload('Envie uma planilha no formato .xlsx.');
      return;
    }

    setErroUpload('');
    setArquivo(arquivoSelecionado);
  }

  async function handleBaixarTemplate() {
    setIsBaixandoTemplate(true);
    setErroUpload('');

    try {
      const blob = await baixarTemplateFolha({
        clienteId: isAdminEfficience ? clienteId || undefined : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'modelo_folha_pagamento.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErroUpload(obterMensagemErro(error, 'Não foi possível baixar o modelo da folha.'));
    } finally {
      setIsBaixandoTemplate(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setErroUpload('');
    setColunasFaltando([]);
    setSucessoUpload('');

    if (!arquivo) {
      setErroUpload('Selecione a planilha preenchida antes de enviar.');
      return;
    }

    if (!arquivoEhXlsx(arquivo)) {
      setErroUpload('Envie uma planilha no formato .xlsx.');
      return;
    }

    if (!REGEX_MES_REFERENCIA.test(mesReferencia)) {
      setErroUpload('Selecione o mês de referência no formato AAAA-MM.');
      return;
    }

    if (isAdminEfficience && !clienteId) {
      setErroUpload('Selecione o cliente antes de enviar a planilha.');
      return;
    }

    if (!isAdminEfficience && !user?.cliente_id) {
      setErroUpload('Seu usuário não possui cliente vinculado para processar a folha.');
      return;
    }

    setIsUploading(true);

    try {
      const data = await uploadFolha({
        arquivo,
        mesReferencia,
        clienteId: isAdminEfficience ? clienteId : undefined,
      });
      const processamentoId = data?.processamento_id || data?.processamentoId || data?.id;

      if (!processamentoId) {
        setSucessoUpload('Upload recebido, mas a API não retornou o processamento_id.');
        return;
      }

      const params = new URLSearchParams({
        processamento_id: String(processamentoId),
        mes_referencia: mesReferencia,
      });

      if (isAdminEfficience && clienteId) {
        params.set('cliente_id', clienteId);
      }

      const nomeCliente = clienteSelecionado ? obterNomeCliente(clienteSelecionado) : '';
      if (nomeCliente) {
        params.set('cliente_nome', nomeCliente);
      }

      router.push(`/dashboard/folha/status?${params.toString()}`);
    } catch (error) {
      const faltando = extrairColunasFaltando(error);
      setColunasFaltando(faltando);
      setErroUpload(obterMensagemErro(error));
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const bloquearEnvio =
    isUploading ||
    isLoadingClientes ||
    (isAdminEfficience && (!clientesOrdenados.length || Boolean(erroClientes)));

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Upload da folha</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Envie a planilha preenchida para iniciar o processamento mensal.
          </p>
        </div>

        <button
          type="button"
          onClick={handleBaixarTemplate}
          disabled={isBaixandoTemplate}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBaixandoTemplate ? <Spinner /> : null}
          {isBaixandoTemplate ? 'Baixando...' : 'Baixar planilha modelo'}
        </button>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <form
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {isAdminEfficience ? (
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-zinc-700">Cliente</span>
                <select
                  value={clienteId}
                  onChange={(event) => setClienteId(event.target.value)}
                  disabled={isUploading || isLoadingClientes || Boolean(erroClientes)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                >
                  <option value="">
                    {isLoadingClientes ? 'Carregando clientes...' : 'Selecione um cliente'}
                  </option>
                  {clientesOrdenados.map((cliente) => {
                    const id = obterIdCliente(cliente);
                    return (
                      <option key={id} value={id}>
                        {obterNomeCliente(cliente)}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-zinc-700">Cliente</span>
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                  Cliente vinculado ao seu usuário
                </p>
              </div>
            )}

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Mês de referência</span>
              <input
                type="month"
                value={mesReferencia}
                onChange={(event) => setMesReferencia(event.target.value)}
                disabled={isUploading}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700">Planilha preenchida</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleArquivoChange}
                disabled={isUploading}
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                required
              />
            </label>
          </div>

          {arquivo ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-sm font-medium text-zinc-800">{arquivo.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatarTamanhoArquivo(arquivo.size)}</p>
            </div>
          ) : null}

          {erroClientes ? (
            <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {erroClientes}
            </p>
          ) : null}

          {erroUpload ? (
            <section className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-800">{erroUpload}</p>
              {colunasFaltando.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Colunas faltando
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {colunasFaltando.map((coluna) => (
                      <li
                        key={coluna}
                        className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
                      >
                        {coluna}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {sucessoUpload ? (
            <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {sucessoUpload}
            </p>
          ) : null}

          <footer className="mt-5 flex justify-end border-t border-zinc-100 pt-4">
            <button
              type="submit"
              disabled={bloquearEnvio}
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <Spinner /> : null}
              {isUploading ? 'Enviando...' : 'Enviar planilha'}
            </button>
          </footer>
        </form>

        <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Validação esperada
          </p>
          <p className="mt-3 text-sm text-zinc-700">
            A primeira linha da planilha precisa manter os cabeçalhos obrigatórios do modelo.
          </p>
          <p className="mt-3 text-sm text-zinc-700">
            Se alguma coluna tiver sido removida ou renomeada, a tela mostra exatamente o que falta.
          </p>
        </aside>
      </section>
    </main>
  );
}
