'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import { listarClientes } from '../../../../services/clientes.service';
import { baixarTemplateFolha, uploadFolha } from '../../../../services/folha.service';

const PERFIL_ADMIN_EFFICIENCE = 'admin_efficience';
const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const REGEX_ARQUIVO_XLSX = /\.xlsx$/i;
const INPUT_CLASSES =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_PRIMARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_SECONDARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60';
// Precisa espelhar o limite do multer em backend/src/routes/folha.routes.js —
// sem essa checagem no cliente, um arquivo grande demais só falha depois do
// upload completo (desperdiçando banda e tempo do usuário).
const TAMANHO_MAXIMO_ARQUIVO_BYTES = 10 * 1024 * 1024;
const MENSAGEM_ARQUIVO_MUITO_GRANDE = 'Planilha excede o tamanho máximo permitido (10MB).';

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
      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600"
    />
  );
}

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
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}

function DownloadIcon() {
  return (
    <IconBase>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </IconBase>
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

function FileIcon() {
  return (
    <IconBase>
      <path d="M7 3.5h7l3.5 3.5v13.5H7z" />
      <path d="M14 3.5V7h3.5" />
      <path d="M9.5 12h5" />
      <path d="M9.5 15.5h5" />
    </IconBase>
  );
}

function CheckIcon() {
  return (
    <IconBase>
      <path d="m5 12 4 4L19 6" />
    </IconBase>
  );
}

function AlertIcon() {
  return (
    <IconBase>
      <path d="M12 8v5" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.5 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.5a2 2 0 0 0-3.4 0Z" />
    </IconBase>
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

    if (arquivoSelecionado.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
      event.target.value = '';
      setArquivo(null);
      setErroUpload(MENSAGEM_ARQUIVO_MUITO_GRANDE);
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

    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
      setErroUpload(MENSAGEM_ARQUIVO_MUITO_GRANDE);
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
    return <p className="p-6 text-sm text-slate-500">Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const bloquearEnvio =
    isUploading ||
    isLoadingClientes ||
    (isAdminEfficience && (!clientesOrdenados.length || Boolean(erroClientes)));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Folha de pagamento
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Upload da folha
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Envie a planilha preenchida para iniciar o processamento mensal.
          </p>
        </div>

        <button
          type="button"
          onClick={handleBaixarTemplate}
          disabled={isBaixandoTemplate}
          className={BUTTON_SECONDARY_CLASSES}
        >
          {isBaixandoTemplate ? <Spinner /> : <DownloadIcon />}
          {isBaixandoTemplate ? 'Baixando...' : 'Baixar planilha modelo'}
        </button>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <form
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                <FileIcon />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Dados do envio</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  O arquivo deve seguir o modelo oficial e ter ate 10 MB.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {isAdminEfficience ? (
              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Cliente</span>
                <select
                  value={clienteId}
                  onChange={(event) => setClienteId(event.target.value)}
                  disabled={isUploading || isLoadingClientes || Boolean(erroClientes)}
                  className={INPUT_CLASSES}
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
                <span className="text-sm font-semibold text-slate-700">Cliente</span>
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Cliente vinculado ao seu usuário
                </p>
              </div>
            )}

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Mês de referência</span>
              <input
                type="month"
                value={mesReferencia}
                onChange={(event) => setMesReferencia(event.target.value)}
                disabled={isUploading}
                className={INPUT_CLASSES}
                required
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Planilha preenchida</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleArquivoChange}
                disabled={isUploading}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                required
              />
            </label>
          </div>

          {arquivo ? (
            <div className="mx-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-sky-700 ring-1 ring-slate-200">
                  <FileIcon />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{arquivo.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatarTamanhoArquivo(arquivo.size)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {erroClientes ? (
            <div className="mx-5 mt-4 flex gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertIcon />
              <p>{erroClientes}</p>
            </div>
          ) : null}

          {erroUpload ? (
            <section className="mx-5 mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
              <div className="flex gap-3 text-rose-800">
                <AlertIcon />
                <p className="text-sm font-semibold">{erroUpload}</p>
              </div>
              {colunasFaltando.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Colunas faltando
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {colunasFaltando.map((coluna) => (
                      <li
                        key={coluna}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
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
            <div className="mx-5 mt-4 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <CheckIcon />
              <p>{sucessoUpload}</p>
            </div>
          ) : null}

          <footer className="mt-5 flex justify-end border-t border-slate-100 px-5 py-4">
            <button
              type="submit"
              disabled={bloquearEnvio}
              className={BUTTON_PRIMARY_CLASSES}
            >
              {isUploading ? <Spinner /> : <UploadIcon />}
              {isUploading ? 'Enviando...' : 'Enviar planilha'}
            </button>
          </footer>
        </form>

        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            Validação esperada
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            A primeira linha da planilha precisa manter os cabeçalhos obrigatórios do modelo.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Se alguma coluna tiver sido removida ou renomeada, a tela mostra exatamente o que falta.
          </p>
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CheckIcon />
              Somente arquivos .xlsx
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CheckIcon />
              Limite de 10 MB
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CheckIcon />
              Cabeçalhos do modelo oficial
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
