'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../context/AuthContext';
import {
  baixarArquivoFolha,
  obterProcessamentoFolha,
} from '../../../../services/folha.service';

const STORAGE_KEY = 'efficience:folha:processamentos';
const POLLING_INTERVAL_MS = 5000;
const LIMITE_PROCESSAMENTOS = 25;

const REGEX_MES_REFERENCIA = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;
const BUTTON_PRIMARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60';
const BUTTON_SECONDARY_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60';

const STATUS_META = {
  pendente: {
    label: 'Pendente',
    classes: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  processando: {
    label: 'Processando',
    classes: 'bg-sky-100 text-sky-800 ring-sky-200',
  },
  concluido: {
    label: 'Concluído',
    classes: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
  erro: {
    label: 'Erro',
    classes: 'bg-rose-100 text-rose-800 ring-rose-200',
  },
};

function obterMensagemErro(error, fallback = 'Não foi possível atualizar o processamento.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

const REGEX_MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function removerAcentos(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(REGEX_MARCAS_DIACRITICAS, '');
}

function normalizarStatus(valor) {
  const status = removerAcentos(valor).trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (!status) {
    return '';
  }

  if (status.includes('process')) {
    return 'processando';
  }

  if (status.includes('concl')) {
    return 'concluido';
  }

  if (status.includes('erro') || status.includes('falha')) {
    return 'erro';
  }

  if (status.includes('pend')) {
    return 'pendente';
  }

  return status;
}

function obterStatusMeta(status) {
  const chave = normalizarStatus(status) || 'pendente';
  return STATUS_META[chave] || {
    label: chave,
    classes: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
}

function statusEmAndamento(status) {
  const statusNormalizado = normalizarStatus(status);
  return !statusNormalizado || statusNormalizado === 'pendente' || statusNormalizado === 'processando';
}

function normalizarMesReferencia(valor) {
  if (!valor) {
    return '';
  }

  const texto = String(valor).trim();
  if (REGEX_MES_REFERENCIA.test(texto)) {
    return texto.slice(0, 7);
  }

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) {
    return '';
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function formatarMesReferencia(valor) {
  const mesReferencia = normalizarMesReferencia(valor);

  if (!mesReferencia) {
    return '-';
  }

  const [anoTexto, mesTexto] = mesReferencia.split('-');
  const data = new Date(Number.parseInt(anoTexto, 10), Number.parseInt(mesTexto, 10) - 1, 1);

  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(data);
}

function obterNomeArquivo(caminho) {
  const texto = String(caminho || '').trim();

  if (!texto) {
    return '';
  }

  return texto.split(/[\\/]/).filter(Boolean).pop() || texto;
}

function normalizarTipoArquivo(tipo, nome) {
  const texto = removerAcentos(`${tipo || ''} ${nome || ''}`).trim().toLowerCase();

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
    item?.nome ||
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

function formatarDataHora(valor) {
  if (!valor) {
    return '-';
  }

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data);
}

function obterReferenciaArquivo(arquivo) {
  if (arquivo.tipo === 'holerite') {
    return [arquivo.funcionario, arquivo.empresa].filter(Boolean).join(' · ') || '-';
  }

  return arquivo.empresa || '-';
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

function desembrulharPayload(payload) {
  if (Array.isArray(payload)) {
    return payload[0] || {};
  }

  return payload?.processamento || payload?.data?.processamento || payload?.data || payload || {};
}

function obterIdProcessamento(processamento) {
  return (
    processamento?.id ||
    processamento?.processamento_id ||
    processamento?.processamentoId ||
    processamento?.folha_processamento_id ||
    ''
  );
}

function obterNomeCliente(processamento) {
  return (
    processamento?.cliente_nome ||
    processamento?.nome_cliente ||
    processamento?.cliente?.nome ||
    processamento?.cliente?.razao_social ||
    processamento?.empresa ||
    processamento?.cliente_id ||
    processamento?.clienteId ||
    ''
  );
}

function normalizarProcessamento(payload, fallback = {}) {
  const processamento = desembrulharPayload(payload);
  const id = String(obterIdProcessamento(processamento) || obterIdProcessamento(fallback) || '').trim();

  if (!id) {
    return null;
  }

  return {
    id,
    cliente_id: processamento?.cliente_id || processamento?.clienteId || fallback.cliente_id || '',
    cliente_nome: obterNomeCliente(processamento) || fallback.cliente_nome || '',
    mes_referencia:
      normalizarMesReferencia(processamento?.mes_referencia || processamento?.mesReferencia) ||
      fallback.mes_referencia ||
      '',
    status: normalizarStatus(processamento?.status) || fallback.status || '',
    motivo_erro:
      processamento?.motivo_erro ||
      processamento?.motivoErro ||
      processamento?.erro ||
      processamento?.mensagem_erro ||
      fallback.motivo_erro ||
      '',
    criado_em:
      processamento?.criado_em ||
      processamento?.created_at ||
      processamento?.createdAt ||
      fallback.criado_em ||
      '',
    atualizado_em:
      processamento?.atualizado_em ||
      processamento?.updated_at ||
      processamento?.updatedAt ||
      fallback.atualizado_em ||
      fallback.ultima_consulta_em ||
      '',
    ultima_consulta_em: fallback.ultima_consulta_em || new Date().toISOString(),
    erro_consulta: fallback.erro_consulta || '',
    arquivos: normalizarArquivos(processamento),
  };
}

function compararProcessamentos(a, b) {
  const dataA = new Date(a.atualizado_em || a.criado_em || `${a.mes_referencia || '1900-01'}-01`);
  const dataB = new Date(b.atualizado_em || b.criado_em || `${b.mes_referencia || '1900-01'}-01`);
  return dataB.getTime() - dataA.getTime();
}

function mesclarProcessamento(atual, novo) {
  if (!atual) {
    return novo;
  }

  return {
    ...atual,
    ...novo,
    cliente_id: novo.cliente_id || atual.cliente_id,
    cliente_nome: novo.cliente_nome || atual.cliente_nome,
    mes_referencia: novo.mes_referencia || atual.mes_referencia,
    status: novo.status || atual.status,
    motivo_erro: novo.motivo_erro || atual.motivo_erro,
    criado_em: novo.criado_em || atual.criado_em,
    atualizado_em: novo.atualizado_em || atual.atualizado_em,
    arquivos: novo.arquivos?.length ? novo.arquivos : atual.arquivos || [],
  };
}

function mesclarProcessamentos(processamentosAtuais, novosProcessamentos) {
  const mapa = new Map();

  processamentosAtuais.filter(Boolean).forEach((processamento) => {
    mapa.set(String(processamento.id), processamento);
  });

  novosProcessamentos.filter(Boolean).forEach((processamento) => {
    const id = String(processamento.id);
    mapa.set(id, mesclarProcessamento(mapa.get(id), processamento));
  });

  return Array.from(mapa.values())
    .sort(compararProcessamentos)
    .slice(0, LIMITE_PROCESSAMENTOS);
}

function chaveArmazenamento(userId) {
  return `${STORAGE_KEY}:${userId}`;
}

function lerProcessamentosSalvos(userId) {
  if (typeof window === 'undefined' || !userId) {
    return [];
  }

  try {
    const bruto = window.localStorage.getItem(chaveArmazenamento(userId));
    const dados = JSON.parse(bruto || '[]');

    if (!Array.isArray(dados)) {
      return [];
    }

    return dados
      .map((processamento) => normalizarProcessamento(processamento, processamento))
      .filter(Boolean)
      .sort(compararProcessamentos)
      .slice(0, LIMITE_PROCESSAMENTOS);
  } catch {
    return [];
  }
}

function salvarProcessamentos(userId, processamentos) {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  const dadosPersistidos = processamentos.map(({ erro_consulta, ...processamento }) => processamento);

  try {
    window.localStorage.setItem(chaveArmazenamento(userId), JSON.stringify(dadosPersistidos));
  } catch {
    // Falha de storage não deve bloquear a tela de acompanhamento.
  }
}

function obterProcessamentoDaUrl(searchParams) {
  const id = searchParams.get('processamento_id') || searchParams.get('id') || '';

  if (!id) {
    return null;
  }

  return normalizarProcessamento(
    {
      id,
      processamento_id: id,
      cliente_id: searchParams.get('cliente_id') || '',
      cliente_nome: searchParams.get('cliente_nome') || '',
      mes_referencia: searchParams.get('mes_referencia') || '',
      status: '',
    },
    {
      criado_em: new Date().toISOString(),
    },
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600"
    />
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12A8 8 0 0 1 17.7 6.4" />
      <path d="M18 3.8v3h-3" />
      <path d="M6 20.2v-3h3" />
    </svg>
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

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function StatusDot({ status }) {
  const statusNormalizado = normalizarStatus(status) || 'pendente';
  const classes = {
    pendente: 'bg-amber-500',
    processando: 'bg-sky-500',
    concluido: 'bg-emerald-500',
    erro: 'bg-rose-500',
  };

  return (
    <span
      aria-hidden="true"
      className={`h-2 w-2 rounded-full ${classes[statusNormalizado] || 'bg-slate-500'}`}
    />
  );
}

function ArquivosDownload({ processamentoId, arquivos, baixandoArquivo, onBaixar }) {
  if (!arquivos.length) {
    return <span className="text-sm text-slate-400">-</span>;
  }

  return (
    <ul className="space-y-1.5">
      {arquivos.map((arquivo) => {
        const chaveDownload = `${processamentoId}:${arquivo.chave}`;
        const isBaixando = baixandoArquivo === chaveDownload;
        const detalheTamanho = formatarTamanho(arquivo.tamanho);

        return (
          <li key={arquivo.chave} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800" title={arquivo.nome}>
                {arquivo.nome}
              </p>
              <p className="text-xs text-slate-500">
                {formatarTipoArquivo(arquivo.tipo)}
                {detalheTamanho ? ` · ${detalheTamanho}` : ''}
                {' · '}
                {obterReferenciaArquivo(arquivo)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onBaixar(processamentoId, arquivo)}
              disabled={isBaixando}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-sky-400 bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBaixando ? <Spinner /> : <DownloadIcon />}
              {isBaixando ? 'Baixando...' : 'Baixar'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function StatusFolhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parametrosUrl = searchParams.toString();
  const { isAuthenticated, isLoading, user } = useAuth();
  const userId = user?.id || user?.email || '';

  const [processamentos, setProcessamentos] = useState([]);
  const [isAtualizando, setIsAtualizando] = useState(false);
  const [erroLista, setErroLista] = useState('');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState('');
  const [baixandoArquivo, setBaixandoArquivo] = useState('');
  const [erroDownload, setErroDownload] = useState('');

  const processamentoDaUrl = useMemo(() => {
    const params = new URLSearchParams(parametrosUrl);
    return obterProcessamentoDaUrl(params);
  }, [parametrosUrl]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setProcessamentos(userId ? lerProcessamentosSalvos(userId) : []);
  }, [isLoading, userId]);

  useEffect(() => {
    if (!processamentoDaUrl || !userId) {
      return;
    }

    setProcessamentos((valorAtual) => {
      const mesclado = mesclarProcessamentos(valorAtual, [processamentoDaUrl]);
      salvarProcessamentos(userId, mesclado);
      return mesclado;
    });
  }, [processamentoDaUrl, userId]);

  const idsChave = useMemo(
    () => processamentos.map((processamento) => processamento.id).join('|'),
    [processamentos],
  );

  const temProcessamentosEmAndamento = useMemo(
    () => processamentos.some((processamento) => statusEmAndamento(processamento.status)),
    [processamentos],
  );

  const contadores = useMemo(() => {
    const totais = {
      pendente: 0,
      processando: 0,
      concluido: 0,
      erro: 0,
    };

    processamentos.forEach((processamento) => {
      const status = normalizarStatus(processamento.status) || 'pendente';
      if (totais[status] === undefined) {
        return;
      }

      totais[status] += 1;
    });

    return totais;
  }, [processamentos]);

  const carregarProcessamentos = useCallback(
    async ({ silencioso = false } = {}) => {
      const ids = idsChave ? idsChave.split('|').filter(Boolean) : [];

      if (!isAuthenticated || ids.length === 0) {
        return;
      }

      if (!silencioso) {
        setIsAtualizando(true);
      }

      const consultadoEm = new Date().toISOString();

      try {
        const resultados = await Promise.all(
          ids.map(async (id) => {
            try {
              const payload = await obterProcessamentoFolha(id);
              return {
                ok: true,
                processamento: normalizarProcessamento(payload, {
                  id,
                  ultima_consulta_em: consultadoEm,
                }),
              };
            } catch (error) {
              return {
                ok: false,
                erro: obterMensagemErro(error),
                processamento: normalizarProcessamento(
                  { id, processamento_id: id },
                  {
                    id,
                    erro_consulta: obterMensagemErro(error),
                    ultima_consulta_em: consultadoEm,
                  },
                ),
              };
            }
          }),
        );

        const processamentosAtualizados = resultados
          .map((resultado) => resultado.processamento)
          .filter(Boolean);

        setProcessamentos((valorAtual) => {
          const mesclado = mesclarProcessamentos(valorAtual, processamentosAtualizados);
          salvarProcessamentos(userId, mesclado);
          return mesclado;
        });

        setUltimaAtualizacao(consultadoEm);

        const falhas = resultados.filter((resultado) => !resultado.ok);
        if (falhas.length === resultados.length && falhas.length > 0) {
          setErroLista(falhas[0].erro);
        } else if (falhas.length > 0) {
          setErroLista('Alguns processamentos não puderam ser atualizados agora.');
        } else {
          setErroLista('');
        }
      } finally {
        if (!silencioso) {
          setIsAtualizando(false);
        }
      }
    },
    [idsChave, isAuthenticated, userId],
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated || !idsChave) {
      return;
    }

    carregarProcessamentos({ silencioso: true });
  }, [carregarProcessamentos, idsChave, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !idsChave || !temProcessamentosEmAndamento) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      carregarProcessamentos({ silencioso: true });
    }, POLLING_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    carregarProcessamentos,
    idsChave,
    isAuthenticated,
    isLoading,
    temProcessamentosEmAndamento,
  ]);

  const handleBaixarArquivo = useCallback(async (processamentoId, arquivo) => {
    const chaveDownload = `${processamentoId}:${arquivo.chave}`;
    setErroDownload('');
    setBaixandoArquivo(chaveDownload);

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
  }, []);

  if (isLoading) {
    return <p className="p-6 text-sm text-slate-500">Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Folha de pagamento
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Status da folha
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Acompanhe os processamentos por mês e empresa e baixe os arquivos finais quando estiverem prontos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => carregarProcessamentos()}
            disabled={processamentos.length === 0 || isAtualizando}
            className={BUTTON_SECONDARY_CLASSES}
          >
            {isAtualizando ? <Spinner /> : <RefreshIcon />}
            {isAtualizando ? 'Atualizando...' : 'Atualizar lista'}
          </button>

          <Link
            href="/dashboard/folha/upload"
            className={BUTTON_PRIMARY_CLASSES}
          >
            <PlusIcon />
            Novo upload
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendente</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-amber-700">
            {contadores.pendente}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Processando
          </p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-sky-700">
            {contadores.processando}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Concluído
          </p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-emerald-700">
            {contadores.concluido}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erro</p>
          <p className="mt-2 text-3xl font-semibold leading-none tracking-tight text-rose-700">
            {contadores.erro}
          </p>
        </article>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
        <p>
          {temProcessamentosEmAndamento
            ? 'Atualização automática ativa para processamentos em andamento.'
            : 'Nenhum processamento em andamento no momento.'}
        </p>
        <p>Última atualização: {formatarDataHora(ultimaAtualizacao)}</p>
      </section>

      {erroLista ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroLista}</p>
        </section>
      ) : null}

      {erroDownload ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-rose-800">{erroDownload}</p>
        </section>
      ) : null}

      {processamentos.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <PlusIcon />
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">
            Nenhum processamento de folha encontrado.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Assim que uma planilha for enviada, o status dela aparece aqui.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Mês
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Motivo do erro
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Arquivos
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Atualizado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {processamentos.map((processamento) => {
                  const statusMeta = obterStatusMeta(processamento.status);
                  const statusNormalizado = normalizarStatus(processamento.status) || 'pendente';
                  const mostrarMotivoErro =
                    statusNormalizado === 'erro' && Boolean(processamento.motivo_erro);
                  const arquivosDisponiveis =
                    statusNormalizado === 'concluido' ? processamento.arquivos : [];

                  return (
                    <tr key={processamento.id} className="align-top transition hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <p className="max-w-xs text-sm font-semibold text-slate-900">
                          {processamento.cliente_nome || 'Empresa não informada'}
                        </p>
                        <p className="mt-1 max-w-xs break-all font-mono text-xs text-slate-500">
                          {processamento.id}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                        {formatarMesReferencia(processamento.mes_referencia)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusMeta.classes}`}
                          aria-live="polite"
                        >
                          <StatusDot status={statusNormalizado} />
                          {statusMeta.label}
                        </span>
                        {processamento.arquivos?.length ? (
                          <p className="mt-2 text-xs text-slate-500">
                            {processamento.arquivos.length} arquivo
                            {processamento.arquivos.length > 1 ? 's' : ''} gerado
                            {processamento.arquivos.length > 1 ? 's' : ''}
                          </p>
                        ) : null}
                      </td>
                      <td className="max-w-sm px-4 py-4">
                        {mostrarMotivoErro ? (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {processamento.motivo_erro}
                          </p>
                        ) : processamento.erro_consulta ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            {processamento.erro_consulta}
                          </p>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-4">
                        {statusNormalizado === 'concluido' ? (
                          <ArquivosDownload
                            processamentoId={processamento.id}
                            arquivos={arquivosDisponiveis}
                            baixandoArquivo={baixandoArquivo}
                            onBaixar={handleBaixarArquivo}
                          />
                        ) : (
                          <span className="text-sm text-slate-400">
                            Disponível após conclusão
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {formatarDataHora(
                          processamento.atualizado_em || processamento.ultima_consulta_em,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
