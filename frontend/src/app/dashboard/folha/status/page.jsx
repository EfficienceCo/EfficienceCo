'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import {
  baixarArquivoFolha,
  obterProcessamentoFolha,
} from '../../../../services/folha.service';

const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])/;
const INTERVALO_POLLING_MS = 12000;

const STATUS_CONFIG = {
  pendente: {
    label: 'Pendente',
    badge: 'bg-amber-100 text-amber-800',
    etapa: 'Aguardando processamento',
  },
  processando: {
    label: 'Processando',
    badge: 'bg-sky-100 text-sky-800',
    etapa: 'Processando folha',
  },
  concluido: {
    label: 'Concluído',
    badge: 'bg-emerald-100 text-emerald-800',
    etapa: 'Arquivos disponíveis',
  },
  erro: {
    label: 'Erro',
    badge: 'bg-rose-100 text-rose-800',
    etapa: 'Falha no processamento',
  },
  desconhecido: {
    label: 'Consultando',
    badge: 'bg-zinc-100 text-zinc-700',
    etapa: 'Consultando status',
  },
};

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function normalizarStatus(status) {
  const valor = normalizarTexto(status);

  if (valor.includes('conclu')) {
    return 'concluido';
  }

  if (valor.includes('process')) {
    return 'processando';
  }

  if (valor.includes('erro') || valor.includes('falha')) {
    return 'erro';
  }

  if (valor.includes('pend') || valor.includes('aguard')) {
    return 'pendente';
  }

  return 'desconhecido';
}

function obterConfigStatus(status) {
  return STATUS_CONFIG[normalizarStatus(status)] || STATUS_CONFIG.desconhecido;
}

function formatarMesReferencia(valor) {
  const texto = String(valor || '').slice(0, 7);

  if (!REGEX_MES_REFERENCIA.test(texto)) {
    return '-';
  }

  const [anoTexto, mesTexto] = texto.split('-');
  const data = new Date(Number.parseInt(anoTexto, 10), Number.parseInt(mesTexto, 10) - 1, 1);

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(data);
}

function obterMensagemErro(error, fallback = 'Não foi possível consultar o processamento da folha.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function obterNomeArquivo(caminho) {
  const texto = String(caminho || '').trim();

  if (!texto) {
    return '';
  }

  return texto.split(/[\\/]/).filter(Boolean).pop() || texto;
}

function normalizarTipoArquivo(tipo, nome) {
  const texto = normalizarTexto(`${tipo || ''} ${nome || ''}`);

  if (texto.includes('relatorio') || texto.includes('fechamento')) {
    return 'relatorio';
  }

  if (texto.includes('holerite') || texto.includes('contracheque')) {
    return 'holerite';
  }

  return 'arquivo';
}

function formatarTipoArquivo(tipo) {
  if (tipo === 'relatorio') {
    return 'Relatório';
  }

  if (tipo === 'holerite') {
    return 'Holerite';
  }

  return 'Arquivo';
}

function obterIdentificadorArquivo(item) {
  if (typeof item === 'string') {
    return item;
  }

  return (
    item?.arquivo ||
    item?.arquivo_id ||
    item?.download_id ||
    item?.downloadId ||
    item?.chave ||
    item?.key ||
    item?.slug ||
    item?.nome_arquivo ||
    item?.nomeArquivo ||
    item?.filename ||
    item?.caminho ||
    item?.path ||
    item?.storage_path ||
    item?.storagePath ||
    item?.arquivo_path ||
    item?.arquivoPath ||
    item?.relatorio_path ||
    item?.relatorioPath ||
    item?.holerite_path ||
    item?.holeritePath ||
    item?.id ||
    item?.nome ||
    ''
  );
}

function normalizarArquivo(item, index, tipoPadrao = '') {
  const identificador = String(obterIdentificadorArquivo(item) || '').trim();

  if (!identificador) {
    return null;
  }

  const nomeBase =
    typeof item === 'string'
      ? obterNomeArquivo(item)
      : item?.nome_exibicao ||
        item?.display_name ||
        item?.nome ||
        item?.label ||
        item?.nome_arquivo ||
        item?.nomeArquivo ||
        item?.filename ||
        obterNomeArquivo(identificador);
  const tipo = normalizarTipoArquivo(
    typeof item === 'string'
      ? tipoPadrao
      : item?.tipo || item?.tipo_arquivo || item?.tipoArquivo || item?.categoria || tipoPadrao,
    `${nomeBase} ${identificador}`,
  );

  return {
    chave: `${tipo}-${identificador}-${index}`,
    identificador,
    nome: nomeBase || `Arquivo ${index + 1}`,
    tipo,
    empresa: typeof item === 'string' ? '' : item?.empresa || item?.razao_social || '',
    funcionario:
      typeof item === 'string'
        ? ''
        : item?.funcionario || item?.funcionario_nome || item?.nome_funcionario || '',
    tamanho: typeof item === 'string' ? null : item?.tamanho || item?.size || item?.bytes || null,
    criadoEm:
      typeof item === 'string'
        ? ''
        : item?.criado_em ||
          item?.criadoEm ||
          item?.created_at ||
          item?.createdAt ||
          item?.gerado_em ||
          item?.geradoEm ||
          item?.updated_at ||
          item?.updatedAt ||
          '',
  };
}

function normalizarArquivos(payload) {
  const arquivos = [];

  function adicionarFonte(valor, tipoPadrao = '') {
    if (Array.isArray(valor)) {
      valor.forEach((item) => arquivos.push({ item, tipoPadrao }));
      return;
    }

    if (!valor || typeof valor !== 'object') {
      return;
    }

    adicionarFonte(valor.arquivos, tipoPadrao);
    adicionarFonte(valor.arquivos_disponiveis || valor.arquivosDisponiveis, tipoPadrao);
    adicionarFonte(valor.lista_arquivos || valor.listaArquivos, tipoPadrao);
    adicionarFonte(valor.files, tipoPadrao);
    adicionarFonte(valor.items, tipoPadrao);
    adicionarFonte(valor.resultados, tipoPadrao);
    adicionarFonte(valor.downloads, tipoPadrao);
    adicionarFonte(valor.holerites, 'holerite');
    adicionarFonte(valor.relatorios || valor.relatórios, 'relatorio');
    adicionarFonte(valor.relatorios_fechamento || valor.relatoriosFechamento, 'relatorio');
  }

  adicionarFonte(payload?.arquivos);
  adicionarFonte(payload?.arquivos_disponiveis || payload?.arquivosDisponiveis);
  adicionarFonte(payload?.lista_arquivos || payload?.listaArquivos);
  adicionarFonte(payload?.files);
  adicionarFonte(payload?.resultados);
  adicionarFonte(payload?.downloads);
  adicionarFonte(payload?.holerites, 'holerite');
  adicionarFonte(payload?.relatorios || payload?.relatórios, 'relatorio');
  adicionarFonte(payload?.relatorios_fechamento || payload?.relatoriosFechamento, 'relatorio');

  const vistos = new Set();

  return arquivos
    .map(({ item, tipoPadrao }, index) => normalizarArquivo(item, index, tipoPadrao))
    .filter((arquivo) => {
      if (!arquivo || vistos.has(arquivo.identificador)) {
        return false;
      }

      vistos.add(arquivo.identificador);
      return true;
    });
}

function normalizarProcessamento(payload, fallback = {}) {
  const raiz = payload?.data || payload || {};
  const processamento = raiz.processamento || raiz;
  const dados = { ...raiz, ...processamento };

  return {
    id: dados.id || dados.processamento_id || fallback.id || '',
    status: dados.status || dados.situacao || fallback.status || '',
    mesReferencia:
      dados.mes_referencia || dados.mesReferencia || dados.referencia || fallback.mesReferencia || '',
    clienteNome:
      dados.cliente_nome ||
      dados.clienteNome ||
      dados.cliente?.nome ||
      dados.cliente?.razao_social ||
      fallback.clienteNome ||
      '',
    motivoErro: dados.motivo_erro || dados.erro || dados.message || '',
    arquivos: normalizarArquivos(dados),
  };
}

function formatarTamanho(bytes) {
  const numero = Number(bytes);

  if (!Number.isFinite(numero) || numero <= 0) {
    return '';
  }

  const megabytes = numero / (1024 * 1024);

  if (megabytes >= 1) {
    return `${megabytes.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(numero / 1024))} KB`;
}

function formatarDataHora(data) {
  if (!data) {
    return '';
  }

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(valor);
}

function obterReferenciaArquivo(arquivo) {
  if (arquivo.tipo === 'relatorio') {
    return arquivo.empresa || '-';
  }

  if (arquivo.tipo === 'holerite') {
    return [arquivo.funcionario, arquivo.empresa].filter(Boolean).join(' · ') || '-';
  }

  return [arquivo.funcionario, arquivo.empresa].filter(Boolean).join(' · ') || '-';
}

function obterNomeDownload(headers, fallback) {
  const contentDisposition = headers?.['content-disposition'] || headers?.['Content-Disposition'];

  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] || fallback;
}

function dispararDownload(blob, nomeArquivo) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </svg>
  );
}

function StatusFolhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  const processamentoId = searchParams.get('processamento_id') || '';
  const mesReferenciaBusca = searchParams.get('mes_referencia') || '';
  const clienteNomeBusca = searchParams.get('cliente_nome') || '';

  const [processamento, setProcessamento] = useState(null);
  const [isLoadingProcessamento, setIsLoadingProcessamento] = useState(false);
  const [erroProcessamento, setErroProcessamento] = useState('');
  const [baixandoArquivo, setBaixandoArquivo] = useState('');
  const [erroDownload, setErroDownload] = useState('');

  const fallbackProcessamento = useMemo(
    () => ({
      id: processamentoId,
      status: 'desconhecido',
      mesReferencia: mesReferenciaBusca,
      clienteNome: clienteNomeBusca,
      arquivos: [],
    }),
    [clienteNomeBusca, mesReferenciaBusca, processamentoId],
  );

  const processamentoExibido = processamento || fallbackProcessamento;
  const statusNormalizado = normalizarStatus(processamentoExibido.status);
  const statusConfig = obterConfigStatus(processamentoExibido.status);
  const statusConcluido = statusNormalizado === 'concluido';
  const statusErro = statusNormalizado === 'erro';
  const arquivosDisponiveis = statusConcluido ? processamentoExibido.arquivos : [];
  const mesFormatado = useMemo(
    () => formatarMesReferencia(processamentoExibido.mesReferencia),
    [processamentoExibido.mesReferencia],
  );

  const carregarProcessamento = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!processamentoId) {
        return;
      }

      if (!silencioso) {
        setIsLoadingProcessamento(true);
      }

      setErroProcessamento('');

      try {
        const data = await obterProcessamentoFolha(processamentoId);
        setProcessamento(normalizarProcessamento(data, fallbackProcessamento));
      } catch (error) {
        setErroProcessamento(obterMensagemErro(error));
      } finally {
        if (!silencioso) {
          setIsLoadingProcessamento(false);
        }
      }
    },
    [fallbackProcessamento, processamentoId],
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && processamentoId) {
      carregarProcessamento();
    }
  }, [carregarProcessamento, isAuthenticated, isLoading, processamentoId]);

  useEffect(() => {
    if (!isAuthenticated || !processamentoId || statusConcluido || statusErro) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      carregarProcessamento({ silencioso: true });
    }, INTERVALO_POLLING_MS);

    return () => window.clearInterval(intervalId);
  }, [carregarProcessamento, isAuthenticated, processamentoId, statusConcluido, statusErro]);

  async function handleBaixarArquivo(arquivo) {
    setErroDownload('');
    setBaixandoArquivo(arquivo.chave);

    try {
      const { blob, headers } = await baixarArquivoFolha({
        processamentoId,
        arquivo: arquivo.identificador,
      });
      const nomeDownload = obterNomeDownload(headers, arquivo.nome);
      dispararDownload(blob, nomeDownload);
    } catch (error) {
      setErroDownload(obterMensagemErro(error, 'Não foi possível baixar o arquivo selecionado.'));
    } finally {
      setBaixandoArquivo('');
    }
  }

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
            Acompanhe o processamento e baixe os arquivos finais quando estiverem prontos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {processamentoId ? (
            <button
              type="button"
              onClick={() => carregarProcessamento()}
              disabled={isLoadingProcessamento}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingProcessamento ? <Spinner /> : null}
              {isLoadingProcessamento ? 'Atualizando...' : 'Atualizar'}
            </button>
          ) : null}

          <Link
            href="/dashboard/folha/upload"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Novo upload
          </Link>
        </div>
      </header>

      {!processamentoId ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-900">
            Nenhum processamento foi informado para consulta.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Processamento
                  </p>
                  <p className="mt-2 break-all text-lg font-semibold text-zinc-900">
                    {processamentoExibido.id}
                  </p>
                </div>

                <span
                  className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${statusConfig.badge}`}
                >
                  {statusConfig.label}
                </span>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Mês
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-800">{mesFormatado}</dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Cliente
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-800">
                    {processamentoExibido.clienteNome || 'Cliente vinculado ao usuário'}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Arquivos
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-zinc-800">
                    {statusConcluido ? arquivosDisponiveis.length : '-'}
                  </dd>
                </div>
              </dl>

              {erroProcessamento ? (
                <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-800">{erroProcessamento}</p>
                </div>
              ) : null}

              {processamentoExibido.motivoErro ? (
                <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-800">
                    {processamentoExibido.motivoErro}
                  </p>
                </div>
              ) : null}

              {!erroProcessamento ? (
                <div
                  className={`mt-5 rounded-lg border p-4 ${
                    statusConcluido
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-zinc-200 bg-zinc-50'
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      statusConcluido ? 'text-emerald-900' : 'text-zinc-700'
                    }`}
                  >
                    {statusConcluido
                      ? 'Processamento concluído. Os holerites e relatórios já podem ser baixados.'
                      : 'Assim que o processamento terminar, os arquivos finais aparecem nesta tela.'}
                  </p>
                </div>
              ) : null}
            </article>

            <aside className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Etapa atual
              </p>
              <p className="mt-3 text-lg font-semibold text-zinc-900">{statusConfig.etapa}</p>
              <ol className="mt-4 space-y-3 text-sm text-zinc-700">
                <li className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                  Planilha recebida
                </li>
                <li
                  className={`rounded-lg border px-3 py-2 ${
                    statusConcluido
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  Processamento da folha
                </li>
                <li
                  className={`rounded-lg border px-3 py-2 ${
                    statusConcluido
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-zinc-200 bg-white'
                  }`}
                >
                  Resultado disponível
                </li>
              </ol>
            </aside>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Arquivos gerados</h2>
                <p className="text-sm text-zinc-500">
                  Holerites por funcionário e relatórios de fechamento por empresa.
                </p>
              </div>
              {statusConcluido ? (
                <span className="text-sm font-medium text-zinc-600">
                  {arquivosDisponiveis.length} disponível(is)
                </span>
              ) : null}
            </div>

            {erroDownload ? (
              <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
                <p className="text-sm font-medium text-rose-800">{erroDownload}</p>
              </section>
            ) : null}

            {!statusConcluido ? (
              <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-zinc-700">
                  Downloads liberados somente quando o status estiver concluído.
                </p>
              </section>
            ) : null}

            {statusConcluido && arquivosDisponiveis.length === 0 ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <p className="text-sm font-medium text-amber-900">
                  Processamento concluído, mas a API ainda não retornou arquivos para download.
                </p>
              </section>
            ) : null}

            {statusConcluido && arquivosDisponiveis.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-zinc-200">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Arquivo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Tipo
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Referência
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Gerado em
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Download
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                      {arquivosDisponiveis.map((arquivo) => {
                        const isBaixando = baixandoArquivo === arquivo.chave;
                        const detalheTamanho = formatarTamanho(arquivo.tamanho);
                        const detalheData = formatarDataHora(arquivo.criadoEm);

                        return (
                          <tr key={arquivo.chave} className="align-top">
                            <td className="px-4 py-3">
                              <p className="max-w-xs break-words text-sm font-medium text-zinc-900">
                                {arquivo.nome}
                              </p>
                              {detalheTamanho ? (
                                <p className="mt-1 text-xs text-zinc-500">{detalheTamanho}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                  arquivo.tipo === 'relatorio'
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-sky-100 text-sky-700'
                                }`}
                              >
                                {formatarTipoArquivo(arquivo.tipo)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600">
                              {obterReferenciaArquivo(arquivo)}
                            </td>
                            <td className="px-4 py-3 text-sm text-zinc-600">
                              {detalheData || '-'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleBaixarArquivo(arquivo)}
                                disabled={isBaixando}
                                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isBaixando ? <Spinner /> : <DownloadIcon />}
                                {isBaixando ? 'Baixando...' : 'Baixar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>
        </>
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
