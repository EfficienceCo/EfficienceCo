'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import {
  concluirEtapa,
  criar,
  executarAcaoEtapa,
  listar,
} from '../../../services/processos.service';

function obterMensagemErro(error, fallback = 'Não foi possível processar sua solicitação.') {
  return (
    error?.response?.data?.erro ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function normalizarProcessos(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.processos)) {
    return payload.processos;
  }

  return [];
}

function obterIdProcesso(processo) {
  return processo?.id || processo?.processo_id || processo?.processoId || null;
}

function obterTipoProcesso(processo) {
  return (
    processo?.tipo ||
    processo?.tipo_processo ||
    processo?.categoria ||
    processo?.tipoProcesso ||
    ''
  );
}

function obterStatusProcesso(processo) {
  return processo?.status || processo?.situacao || 'em_andamento';
}

function obterCampoEtapas(processo) {
  if (Array.isArray(processo?.etapas)) {
    return 'etapas';
  }

  if (Array.isArray(processo?.checklist)) {
    return 'checklist';
  }

  if (Array.isArray(processo?.fases)) {
    return 'fases';
  }

  return 'etapas';
}

function obterEtapas(processo) {
  if (Array.isArray(processo?.etapas)) {
    return processo.etapas;
  }

  if (Array.isArray(processo?.checklist)) {
    return processo.checklist;
  }

  if (Array.isArray(processo?.fases)) {
    return processo.fases;
  }

  return [];
}

function obterIdEtapa(etapa) {
  if (typeof etapa === 'string') {
    return null;
  }

  return etapa?.id || etapa?.etapa_id || etapa?.etapaId || etapa?.codigo || null;
}

function obterTituloEtapa(etapa, index = 0) {
  if (typeof etapa === 'string') {
    return etapa;
  }

  return (
    etapa?.nome ||
    etapa?.titulo ||
    etapa?.descricao ||
    etapa?.etapa ||
    `Etapa ${index + 1}`
  );
}

function etapaConcluida(etapa) {
  if (typeof etapa === 'string') {
    return false;
  }

  if (
    etapa?.concluida === true ||
    etapa?.concluido === true ||
    etapa?.finalizada === true ||
    etapa?.done === true ||
    etapa?.completa === true
  ) {
    return true;
  }

  const status = String(etapa?.status || etapa?.situacao || '').trim().toLowerCase();
  return status.includes('conclu') || status.includes('finaliz');
}

function obterTipoEtapa(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return 'manual';
  }

  return String(etapa.tipo || etapa.tipo_etapa || etapa.tipoEtapa || 'manual')
    .trim()
    .toLowerCase();
}

function etapaAutomatizada(etapa) {
  const tipo = obterTipoEtapa(etapa);
  return tipo === 'automatizada' || tipo === 'automatica' || tipo === 'automatizado';
}

function obterAcaoEtapa(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return '';
  }

  return String(etapa.acao || etapa.ação || etapa.action || '')
    .trim()
    .toLowerCase();
}

function obterStatusEtapa(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return 'pendente';
  }

  return String(etapa.status || etapa.situacao || 'pendente')
    .trim()
    .toLowerCase();
}

function obterErroExecucaoEtapa(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return '';
  }

  const candidatos = [
    etapa.erro_execucao,
    etapa.erroExecucao,
    etapa.mensagem_erro,
    etapa.mensagemErro,
  ];
  const mensagem = candidatos.find(
    (candidato) => typeof candidato === 'string' && candidato.trim(),
  );

  if (mensagem) {
    return mensagem.trim();
  }

  return obterStatusEtapa(etapa).includes('erro')
    ? 'A execução não foi concluída. Revise os dados e tente novamente.'
    : '';
}

function etapaEmProcessamento(etapa) {
  if (!etapaAutomatizada(etapa) || etapaConcluida(etapa) || obterErroExecucaoEtapa(etapa)) {
    return false;
  }

  const status = obterStatusEtapa(etapa);
  return (
    status === 'pronta_para_execucao' ||
    status === 'processando' ||
    status === 'em_processamento' ||
    status === 'aguardando_execucao'
  );
}

function obterPayloadExecucao(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return {};
  }

  const payload = etapa.payload_execucao || etapa.payloadExecucao || etapa.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

function normalizarSocio(socio = {}) {
  return {
    nome: String(socio?.nome || ''),
    cpf: String(socio?.cpf || ''),
    participacao: String(
      socio?.participacao ?? socio?.participacao_percentual ?? socio?.quota_percentual ?? '',
    ),
  };
}

function criarFormularioContratoSocial(etapa, processo = {}) {
  const payloadEtapa = obterPayloadExecucao(etapa);
  const sociosRecebidos = Array.isArray(payloadEtapa.socios)
    ? payloadEtapa.socios
    : Array.isArray(processo?.socios)
      ? processo.socios
      : [];

  return {
    nome_empresa: String(payloadEtapa.nome_empresa ?? processo?.nome_empresa ?? ''),
    cenario: String(payloadEtapa.cenario ?? processo?.cenario ?? 'nova'),
    socios:
      sociosRecebidos.length > 0
        ? sociosRecebidos.map((socio) => normalizarSocio(socio))
        : [normalizarSocio()],
    capital_social: String(payloadEtapa.capital_social ?? processo?.capital_social ?? ''),
    objeto_social: String(payloadEtapa.objeto_social ?? processo?.objeto_social ?? ''),
    endereco: String(payloadEtapa.endereco ?? processo?.endereco ?? ''),
  };
}

function montarPayloadContratoSocial(formulario) {
  return {
    nome_empresa: formulario.nome_empresa.trim(),
    cenario: formulario.cenario ? formulario.cenario.trim() : 'nova',
    socios: formulario.socios.map((socio) => ({
      nome: socio.nome.trim(),
      cpf: socio.cpf.trim(),
      participacao: Number(socio.participacao),
    })),
    capital_social: Number(formulario.capital_social),
    objeto_social: formulario.objeto_social.trim(),
    endereco: formulario.endereco.trim(),
  };
}

function validarFormularioContratoSocial(formulario) {
  if (!formulario?.nome_empresa?.trim()) {
    return 'Informe o nome da empresa.';
  }

  if (!Array.isArray(formulario?.socios) || formulario.socios.length === 0) {
    return 'Adicione pelo menos um sócio.';
  }

  const socioInvalido = formulario.socios.some(
    (socio) =>
      !socio.nome.trim() ||
      !socio.cpf.trim() ||
      !Number.isFinite(Number(socio.participacao)) ||
      Number(socio.participacao) <= 0 ||
      Number(socio.participacao) > 100,
  );

  if (socioInvalido) {
    return 'Preencha nome, CPF e participação válida para todos os sócios.';
  }

  const participacaoTotal = formulario.socios.reduce(
    (total, socio) => total + Number(socio.participacao),
    0,
  );

  if (Math.abs(participacaoTotal - 100) > 0.01) {
    return 'A soma das participações dos sócios deve ser 100%.';
  }

  if (
    !formulario.capital_social ||
    !Number.isFinite(Number(formulario.capital_social)) ||
    Number(formulario.capital_social) <= 0
  ) {
    return 'Informe um capital social maior que zero.';
  }

  if (!formulario.objeto_social.trim() || !formulario.endereco.trim()) {
    return 'Preencha o objeto social e o endereço.';
  }

  return '';
}

function obterArquivoGerado(etapa) {
  if (!etapa || typeof etapa !== 'object') {
    return null;
  }

  const arquivo =
    etapa.arquivo_gerado ||
    etapa.arquivoGerado ||
    etapa.resultado?.arquivo ||
    etapa.resultado?.arquivo_gerado;

  if (!arquivo) {
    return null;
  }

  const caminho =
    typeof arquivo === 'string'
      ? arquivo
      : arquivo.url || arquivo.href || arquivo.caminho || arquivo.path || '';
  const nomeInformado = typeof arquivo === 'object' ? arquivo.nome || arquivo.name : '';
  const caminhoSemQuery = String(caminho).split(/[?#]/)[0];
  const nomeDoCaminho = caminhoSemQuery.split(/[\\/]/).filter(Boolean).pop();
  const nome = String(nomeInformado || nomeDoCaminho || 'Arquivo gerado');
  const urlDeclarada =
    etapa.arquivo_url ||
    etapa.download_url ||
    (typeof arquivo === 'object' && (arquivo.url || arquivo.href)) ||
    (typeof arquivo === 'string' && /^https?:\/\//i.test(arquivo) ? arquivo : '');
  const url = String(urlDeclarada || '');
  const possuiLinkSeguro = /^(https?:\/\/|\/(?!\/))/i.test(url);

  return { nome, url: possuiLinkSeguro ? url : '' };
}

function obterResumoEtapas(processo) {
  const etapas = obterEtapas(processo);
  const totalPorCampo =
    Number(processo?.total_etapas) ||
    Number(processo?.etapas_total) ||
    Number(processo?.qtd_etapas) ||
    Number(processo?.quantidade_etapas);

  const concluidasPorCampo =
    Number(processo?.etapas_concluidas) ||
    Number(processo?.qtd_concluidas) ||
    Number(processo?.concluidas);

  const totalEtapas = Number.isFinite(totalPorCampo) && totalPorCampo > 0 ? totalPorCampo : etapas.length;
  const etapasConcluidas =
    Number.isFinite(concluidasPorCampo) && concluidasPorCampo >= 0
      ? concluidasPorCampo
      : etapas.filter((etapa) => etapaConcluida(etapa)).length;

  const percentual =
    totalEtapas > 0 ? Math.round((Math.min(etapasConcluidas, totalEtapas) / totalEtapas) * 100) : 0;

  return {
    totalEtapas,
    etapasConcluidas: Math.min(etapasConcluidas, totalEtapas),
    percentual,
  };
}

const ROTULOS_PT_BR = {
  abertura_empresa: 'Abertura de empresa',
  admissao: 'Admissão',
  atrasado: 'Atrasado',
  automatizada: 'Automatizada',
  contabil: 'Contábil',
  concluida: 'Concluída',
  concluido: 'Concluído',
  em_andamento: 'Em andamento',
  fiscal: 'Fiscal',
  folha_pagamento: 'Folha de pagamento',
  pendente: 'Pendente',
  pronta_para_execucao: 'Processando',
  processando: 'Processando',
  rescisao: 'Rescisão',
  trabalhista: 'Trabalhista',
};

function formatarRotulo(valor) {
  if (!valor) {
    return '-';
  }

  const chave = String(valor).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (ROTULOS_PT_BR[chave]) {
    return ROTULOS_PT_BR[chave];
  }

  const texto = String(valor)
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  if (!texto) {
    return '-';
  }

  return texto
    .split(/\s+/)
    .map((parte) => `${parte.charAt(0).toUpperCase()}${parte.slice(1)}`)
    .join(' ');
}

function classeBadgeStatus(status) {
  const statusNormalizado = String(status || '').toLowerCase();

  if (statusNormalizado.includes('conclu')) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (statusNormalizado.includes('atras')) {
    return 'bg-rose-100 text-rose-700';
  }

  if (statusNormalizado.includes('andamento') || statusNormalizado.includes('and')) {
    return 'bg-sky-100 text-sky-700';
  }

  return 'bg-amber-100 text-amber-800';
}

function tituloProcesso(processo, index) {
  return processo?.titulo || processo?.nome || processo?.descricao || `Processo ${index + 1}`;
}

function calcularTotalProcessos(payload, processos) {
  if (typeof payload?.total === 'number') {
    return payload.total;
  }

  if (typeof payload?.count === 'number') {
    return payload.count;
  }

  if (typeof payload?.total_processos === 'number') {
    return payload.total_processos;
  }

  return processos.length;
}

function atualizarEtapaNaLista(lista, processoId, etapaId, atualizador) {
  return lista.map((processo) => {
    if (String(obterIdProcesso(processo)) !== String(processoId)) {
      return processo;
    }

    const campoEtapas = obterCampoEtapas(processo);
    const etapas = obterEtapas(processo);
    const etapasAtualizadas = etapas.map((etapa) => {
      if (String(obterIdEtapa(etapa)) !== String(etapaId)) {
        return etapa;
      }

      if (!etapa || typeof etapa !== 'object') {
        return etapa;
      }

      return atualizador(etapa);
    });

    const processoAtualizado = {
      ...processo,
      [campoEtapas]: etapasAtualizadas,
    };

    if (typeof processoAtualizado.total_etapas === 'number') {
      processoAtualizado.total_etapas = etapasAtualizadas.length;
    }

    const concluidas = etapasAtualizadas.filter((etapa) => etapaConcluida(etapa)).length;

    if (typeof processoAtualizado.etapas_concluidas === 'number') {
      processoAtualizado.etapas_concluidas = concluidas;
    }

    if (typeof processoAtualizado.concluidas === 'number') {
      processoAtualizado.concluidas = concluidas;
    }

    return processoAtualizado;
  });
}

function encontrarEtapaNaLista(lista, processoId, etapaId) {
  const processo = lista.find(
    (item) => String(obterIdProcesso(item)) === String(processoId),
  );

  return obterEtapas(processo).find(
    (etapa) => String(obterIdEtapa(etapa)) === String(etapaId),
  );
}

function aplicarAtualizacaoEtapaNaLista(lista, processoId, etapaId, concluida) {
  return atualizarEtapaNaLista(lista, processoId, etapaId, (etapa) => {
    const etapaAtualizada = {
      ...etapa,
      concluida,
    };

    if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'concluido')) {
      etapaAtualizada.concluido = concluida;
    }

    if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'finalizada')) {
      etapaAtualizada.finalizada = concluida;
    }

    if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'done')) {
      etapaAtualizada.done = concluida;
    }

    if (Object.prototype.hasOwnProperty.call(etapaAtualizada, 'completa')) {
      etapaAtualizada.completa = concluida;
    }

    if (typeof etapaAtualizada.status === 'string') {
      etapaAtualizada.status = concluida ? 'concluida' : 'pendente';
    }

    return etapaAtualizada;
  });
}

function extrairEtapaAtualizada(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidatos = [payload.etapa, payload.data?.etapa, payload.data, payload];
  return (
    candidatos.find(
      (candidato) =>
        candidato &&
        typeof candidato === 'object' &&
        !Array.isArray(candidato) &&
        (obterIdEtapa(candidato) || candidato.status || candidato.payload_execucao),
    ) || null
  );
}

function extrairProcessoAtualizado(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.processo && typeof payload.processo === 'object') {
    return payload.processo;
  }

  if (payload.data && typeof payload.data === 'object') {
    if (payload.data.processo && typeof payload.data.processo === 'object') {
      return payload.data.processo;
    }

    if (
      payload.data.id ||
      payload.data.status ||
      payload.data.situacao ||
      Array.isArray(payload.data.etapas) ||
      Array.isArray(payload.data.checklist)
    ) {
      return payload.data;
    }
  }

  if (payload.id || payload.status || payload.situacao || Array.isArray(payload.etapas)) {
    return payload;
  }

  return null;
}

function atualizarProcessoNaLista(lista, processoId, processoAtualizado) {
  return lista.map((processo) => {
    if (String(obterIdProcesso(processo)) !== String(processoId)) {
      return processo;
    }

    return {
      ...processo,
      ...processoAtualizado,
    };
  });
}

const PERFIS_PODEM_MARCAR_ETAPA = new Set(['funcionario', 'admin_cliente', 'admin_efficience']);
const PERFIL_PODE_CRIAR_PROCESSO = 'admin_cliente';
const INTERVALO_POLLING_ETAPAS_MS = 3000;
const STATUS_OPCOES = [
  { value: '', label: 'Todos' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'pendente', label: 'Pendente' },
];
const TIPOS_PADRAO = [
  'folha_pagamento',
  'rescisao',
  'admissao',
  'fiscal',
  'contabil',
  'trabalhista',
  'abertura_empresa',
];

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
    />
  );
}

function FormularioContratoSocial({
  idBase,
  formulario,
  disabled,
  onAdicionarSocio,
  onAlterarCampo,
  onAlterarSocio,
  onRemoverSocio,
}) {
  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
      <legend className="sr-only">Dados da empresa e contrato social</legend>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor={`${idBase}-nome-empresa`} className="space-y-1.5 block">
          <span className="block text-xs font-medium text-zinc-700">Nome da empresa</span>
          <input
            id={`${idBase}-nome-empresa`}
            type="text"
            value={formulario.nome_empresa || ''}
            onChange={(event) => onAlterarCampo('nome_empresa', event.target.value)}
            placeholder="Ex: Minha Empresa LTDA"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            required
          />
        </label>

        <label htmlFor={`${idBase}-cenario`} className="space-y-1.5 block">
          <span className="block text-xs font-medium text-zinc-700">Cenário</span>
          <select
            id={`${idBase}-cenario`}
            value={formulario.cenario || 'nova'}
            onChange={(event) => onAlterarCampo('cenario', event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="nova">Nova</option>
            <option value="cliente_existente">Cliente existente</option>
          </select>
        </label>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-zinc-800">Sócios</h4>
            <p className="text-xs text-zinc-500">Informe os dados e a participação de cada sócio.</p>
          </div>
          <button
            type="button"
            onClick={onAdicionarSocio}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed"
          >
            Adicionar sócio
          </button>
        </div>

        <div className="space-y-3">
          {formulario.socios.map((socio, socioIndex) => {
            const numeroSocio = socioIndex + 1;
            const idSocio = `${idBase}-socio-${numeroSocio}`;

            return (
              <article
                key={idSocio}
                className="rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Sócio {numeroSocio}
                  </h5>
                  <button
                    type="button"
                    onClick={() => onRemoverSocio(socioIndex)}
                    disabled={formulario.socios.length === 1}
                    aria-label={`Remover sócio ${numeroSocio}`}
                    className="text-xs font-medium text-rose-600 transition hover:text-rose-800 disabled:cursor-not-allowed disabled:text-zinc-300"
                  >
                    Remover
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label htmlFor={`${idSocio}-nome`} className="space-y-1.5">
                    <span className="block text-xs font-medium text-zinc-700">Nome</span>
                    <input
                      id={`${idSocio}-nome`}
                      type="text"
                      aria-label={`Nome do sócio ${numeroSocio}`}
                      value={socio.nome}
                      onChange={(event) =>
                        onAlterarSocio(socioIndex, 'nome', event.target.value)
                      }
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                      required
                    />
                  </label>

                  <label htmlFor={`${idSocio}-cpf`} className="space-y-1.5">
                    <span className="block text-xs font-medium text-zinc-700">CPF</span>
                    <input
                      id={`${idSocio}-cpf`}
                      type="text"
                      inputMode="numeric"
                      aria-label={`CPF do sócio ${numeroSocio}`}
                      value={socio.cpf}
                      onChange={(event) => onAlterarSocio(socioIndex, 'cpf', event.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                      required
                    />
                  </label>

                  <label htmlFor={`${idSocio}-participacao`} className="space-y-1.5">
                    <span className="block text-xs font-medium text-zinc-700">Participação (%)</span>
                    <input
                      id={`${idSocio}-participacao`}
                      type="number"
                      aria-label={`Participação (%) do sócio ${numeroSocio}`}
                      min="0"
                      max="100"
                      step="0.01"
                      value={socio.participacao}
                      onChange={(event) =>
                        onAlterarSocio(socioIndex, 'participacao', event.target.value)
                      }
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                      required
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor={`${idBase}-capital-social`} className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-700">Capital social (R$)</span>
          <input
            id={`${idBase}-capital-social`}
            type="number"
            min="0.01"
            step="0.01"
            value={formulario.capital_social}
            onChange={(event) => onAlterarCampo('capital_social', event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            required
          />
        </label>

        <label htmlFor={`${idBase}-endereco`} className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-700">Endereço</span>
          <textarea
            id={`${idBase}-endereco`}
            value={formulario.endereco}
            onChange={(event) => onAlterarCampo('endereco', event.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            required
          />
        </label>
      </div>

      <label htmlFor={`${idBase}-objeto-social`} className="space-y-1.5">
        <span className="block text-xs font-medium text-zinc-700">Objeto social</span>
        <textarea
          id={`${idBase}-objeto-social`}
          value={formulario.objeto_social}
          onChange={(event) => onAlterarCampo('objeto_social', event.target.value)}
          rows={4}
          className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          required
        />
      </label>
    </fieldset>
  );
}

function EtapaAutomatizada({
  acao,
  bloqueada,
  concluida,
  enviando,
  erro,
  formulario,
  idBase,
  processando,
  titulo,
  arquivo,
  onAdicionarSocio,
  onAlterarCampo,
  onAlterarSocio,
  onRemoverSocio,
  onSubmit,
}) {
  if (concluida) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700"
            >
              ✓
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-700">{titulo}</p>
              <p className="mt-1 text-xs text-emerald-700">Execução concluída com sucesso.</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            Concluída
          </span>
        </div>

        {arquivo ? (
          <div className="ml-8 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span className="font-medium">Arquivo gerado: </span>
            {arquivo.url ? (
              <a
                href={arquivo.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-emerald-400 underline-offset-2 hover:text-emerald-700"
              >
                {arquivo.nome}
              </a>
            ) : (
              <span>{arquivo.nome}</span>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (processando || enviando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3" role="status" aria-live="polite">
        <div>
          <p className="text-sm font-medium text-zinc-800">{titulo}</p>
          <p className="mt-1 text-xs text-zinc-500">
            A solicitação foi enviada. O resultado aparecerá automaticamente.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-700">
          <Spinner />
          Processando...
        </span>
      </div>
    );
  }

  if (acao !== 'gerar_contrato_social' && acao !== 'criar_pastas') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-zinc-800">{titulo}</p>
        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Ação automatizada não suportada: {acao || 'não informada'}.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} aria-label={`Executar ${titulo}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-900">{titulo}</p>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
              Automatizada
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {acao === 'gerar_contrato_social'
              ? 'Preencha os dados que serão usados para gerar o documento.'
              : 'Confirme para o agente criar a estrutura padrão de pastas.'}
          </p>
        </div>
        <span className="text-xs font-medium text-amber-700">Pendente</span>
      </div>

      {erro ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {erro}
        </p>
      ) : null}

      {acao === 'gerar_contrato_social' ? (
        <FormularioContratoSocial
          idBase={idBase}
          formulario={formulario}
          disabled={bloqueada}
          onAdicionarSocio={onAdicionarSocio}
          onAlterarCampo={onAlterarCampo}
          onAlterarSocio={onAlterarSocio}
          onRemoverSocio={onRemoverSocio}
        />
      ) : (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900">
          O agente criará as pastas padrão deste cliente. Nenhum dado adicional é necessário.
        </div>
      )}

      <div className="flex justify-end border-t border-zinc-200 pt-3">
        <button
          type="submit"
          disabled={bloqueada}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Concluir
        </button>
      </div>
    </form>
  );
}

export default function ProcessosPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();

  const [payload, setPayload] = useState(null);
  const [processos, setProcessos] = useState([]);
  const [isLoadingProcessos, setIsLoadingProcessos] = useState(true);
  const [erro, setErro] = useState('');

  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const [processosExpandidos, setProcessosExpandidos] = useState({});
  const [etapasEmAtualizacao, setEtapasEmAtualizacao] = useState({});
  const [etapasEmExecucao, setEtapasEmExecucao] = useState({});
  const [errosExecucaoEtapa, setErrosExecucaoEtapa] = useState({});
  const [formulariosEtapa, setFormulariosEtapa] = useState({});

  const [isNovoModalAberto, setIsNovoModalAberto] = useState(false);
  const [novoTipoProcesso, setNovoTipoProcesso] = useState(TIPOS_PADRAO[0]);
  const [novoFormularioAbertura, setNovoFormularioAbertura] = useState(() =>
    criarFormularioContratoSocial(null, null),
  );
  const [erroNovoProcesso, setErroNovoProcesso] = useState('');
  const [isCriandoProcesso, setIsCriandoProcesso] = useState(false);
  const ultimaRequisicaoProcessosRef = useRef(0);

  const perfilUsuario = String(user?.perfil || '').trim();
  const podeCriarProcesso = perfilUsuario === PERFIL_PODE_CRIAR_PROCESSO;
  const podeMarcarEtapa = PERFIS_PODEM_MARCAR_ETAPA.has(perfilUsuario);

  const carregarProcessos = useCallback(
    async ({ silencioso = false, reportarErro = true } = {}) => {
      const idRequisicao = ultimaRequisicaoProcessosRef.current + 1;
      ultimaRequisicaoProcessosRef.current = idRequisicao;

      if (!silencioso) {
        setIsLoadingProcessos(true);
      }

      if (reportarErro) {
        setErro('');
      }

      try {
        const data = await listar({
          ...(filtroStatus ? { status: filtroStatus } : {}),
          ...(filtroTipo ? { tipo: filtroTipo } : {}),
        });

        const processosNormalizados = normalizarProcessos(data);

        if (idRequisicao !== ultimaRequisicaoProcessosRef.current) {
          return null;
        }

        setPayload(data);
        setProcessos(processosNormalizados);
        return processosNormalizados;
      } catch (error) {
        if (reportarErro && idRequisicao === ultimaRequisicaoProcessosRef.current) {
          setErro(obterMensagemErro(error, 'Não foi possível carregar os processos.'));
        }
        return null;
      } finally {
        if (!silencioso && idRequisicao === ultimaRequisicaoProcessosRef.current) {
          setIsLoadingProcessos(false);
        }
      }
    },
    [filtroStatus, filtroTipo],
  );

  const possuiEtapaProcessando = useMemo(
    () =>
      processos.some((processo) =>
        obterEtapas(processo).some((etapa) => etapaEmProcessamento(etapa)),
      ),
    [processos],
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      carregarProcessos();
    }
  }, [carregarProcessos, isAuthenticated, isLoading]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !possuiEtapaProcessando) {
      return undefined;
    }

    let ativo = true;
    let timeoutId;

    async function consultarResultado() {
      await carregarProcessos({ silencioso: true, reportarErro: false });

      if (ativo) {
        timeoutId = window.setTimeout(consultarResultado, INTERVALO_POLLING_ETAPAS_MS);
      }
    }

    timeoutId = window.setTimeout(consultarResultado, INTERVALO_POLLING_ETAPAS_MS);

    return () => {
      ativo = false;
      window.clearTimeout(timeoutId);
    };
  }, [carregarProcessos, isAuthenticated, isLoading, possuiEtapaProcessando]);

  const tiposDisponiveis = useMemo(() => {
    const tipos = new Set(TIPOS_PADRAO);

    processos.forEach((processo) => {
      const tipo = String(obterTipoProcesso(processo) || '').trim();

      if (tipo) {
        tipos.add(tipo);
      }
    });

    return Array.from(tipos).sort((tipoA, tipoB) =>
      tipoA.localeCompare(tipoB, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [processos]);

  const totalProcessos = useMemo(() => calcularTotalProcessos(payload, processos), [payload, processos]);

  const totalConcluidos = useMemo(
    () =>
      processos.filter((processo) =>
        String(obterStatusProcesso(processo)).trim().toLowerCase().includes('conclu'),
      ).length,
    [processos],
  );

  function alternarExpansao(chave) {
    setProcessosExpandidos((valorAtual) => ({
      ...valorAtual,
      [chave]: !valorAtual[chave],
    }));
  }

  function abrirModalNovoProcesso() {
    setNovoTipoProcesso(tiposDisponiveis[0] || TIPOS_PADRAO[0]);
    setNovoFormularioAbertura(criarFormularioContratoSocial(null, null));
    setErroNovoProcesso('');
    setIsNovoModalAberto(true);
  }

  function fecharModalNovoProcesso() {
    if (isCriandoProcesso) {
      return;
    }

    setIsNovoModalAberto(false);
    setErroNovoProcesso('');
  }

  async function handleCriarProcesso(event) {
    event.preventDefault();

    if (!novoTipoProcesso) {
      setErroNovoProcesso('Selecione um tipo de processo.');
      return;
    }

    let payloadCriacao = { tipo: novoTipoProcesso };

    if (novoTipoProcesso === 'abertura_empresa') {
      const mensagemValidacao = validarFormularioContratoSocial(novoFormularioAbertura);
      if (mensagemValidacao) {
        setErroNovoProcesso(mensagemValidacao);
        return;
      }
      payloadCriacao = {
        ...payloadCriacao,
        ...montarPayloadContratoSocial(novoFormularioAbertura),
      };
    }

    setIsCriandoProcesso(true);
    setErroNovoProcesso('');

    try {
      await criar(payloadCriacao);
      setIsNovoModalAberto(false);
      await carregarProcessos();
    } catch (error) {
      setErroNovoProcesso(obterMensagemErro(error, 'Não foi possível criar o processo.'));
    } finally {
      setIsCriandoProcesso(false);
    }
  }

  async function handleToggleEtapa(processo, etapa, concluida) {
    if (!podeMarcarEtapa) {
      return;
    }

    const processoId = obterIdProcesso(processo);
    const etapaId = obterIdEtapa(etapa);

    if (processoId === null || processoId === undefined || processoId === '') {
      return;
    }

    if (etapaId === null || etapaId === undefined || etapaId === '') {
      return;
    }

    const chaveAtualizacao = `${processoId}::${etapaId}`;

    setEtapasEmAtualizacao((valorAtual) => ({
      ...valorAtual,
      [chaveAtualizacao]: true,
    }));

    setErro('');
    setProcessos((valorAtual) =>
      aplicarAtualizacaoEtapaNaLista(valorAtual, processoId, etapaId, concluida),
    );

    try {
      const retorno = await concluirEtapa(processoId, etapaId, { concluida });
      const processoAtualizado = extrairProcessoAtualizado(retorno);

      if (processoAtualizado) {
        setProcessos((valorAtual) =>
          atualizarProcessoNaLista(valorAtual, processoId, processoAtualizado),
        );
      }

      await carregarProcessos({ silencioso: true });
    } catch (error) {
      setErro(obterMensagemErro(error, 'Não foi possível atualizar a etapa.'));
      await carregarProcessos({ silencioso: true });
    } finally {
      setEtapasEmAtualizacao((valorAtual) => {
        const proximo = { ...valorAtual };
        delete proximo[chaveAtualizacao];
        return proximo;
      });
    }
  }

  function obterFormularioEtapa(chaveEtapa, etapa, processo) {
    return formulariosEtapa[chaveEtapa] || criarFormularioContratoSocial(etapa, processo);
  }

  function alterarCampoFormulario(chaveEtapa, etapa, processo, campo, valor) {
    setFormulariosEtapa((valorAtual) => {
      const formularioAtual =
        valorAtual[chaveEtapa] || criarFormularioContratoSocial(etapa, processo);

      return {
        ...valorAtual,
        [chaveEtapa]: {
          ...formularioAtual,
          [campo]: valor,
        },
      };
    });
  }

  function alterarSocioFormulario(chaveEtapa, etapa, processo, socioIndex, campo, valor) {
    setFormulariosEtapa((valorAtual) => {
      const formularioAtual =
        valorAtual[chaveEtapa] || criarFormularioContratoSocial(etapa, processo);

      return {
        ...valorAtual,
        [chaveEtapa]: {
          ...formularioAtual,
          socios: formularioAtual.socios.map((socio, index) =>
            index === socioIndex ? { ...socio, [campo]: valor } : socio,
          ),
        },
      };
    });
  }

  function adicionarSocioFormulario(chaveEtapa, etapa, processo) {
    setFormulariosEtapa((valorAtual) => {
      const formularioAtual =
        valorAtual[chaveEtapa] || criarFormularioContratoSocial(etapa, processo);

      return {
        ...valorAtual,
        [chaveEtapa]: {
          ...formularioAtual,
          socios: [...formularioAtual.socios, normalizarSocio()],
        },
      };
    });
  }

  function removerSocioFormulario(chaveEtapa, etapa, processo, socioIndex) {
    setFormulariosEtapa((valorAtual) => {
      const formularioAtual =
        valorAtual[chaveEtapa] || criarFormularioContratoSocial(etapa, processo);

      if (formularioAtual.socios.length === 1) {
        return valorAtual;
      }

      return {
        ...valorAtual,
        [chaveEtapa]: {
          ...formularioAtual,
          socios: formularioAtual.socios.filter((_, index) => index !== socioIndex),
        },
      };
    });
  }

  async function handleExecutarAcaoEtapa(
    event,
    processo,
    etapa,
    chaveEtapa,
    formulario,
  ) {
    event.preventDefault();

    if (!podeMarcarEtapa) {
      return;
    }

    const processoId = obterIdProcesso(processo);
    const etapaId = obterIdEtapa(etapa);
    const acao = obterAcaoEtapa(etapa);

    if (!processoId || !etapaId) {
      return;
    }

    let dadosExecucao = {};

    if (acao === 'gerar_contrato_social') {
      const mensagemValidacao = validarFormularioContratoSocial(formulario);

      if (mensagemValidacao) {
        setErrosExecucaoEtapa((valorAtual) => ({
          ...valorAtual,
          [chaveEtapa]: mensagemValidacao,
        }));
        return;
      }

      dadosExecucao = montarPayloadContratoSocial(formulario);
    }

    const dadosRequisicao = { ...dadosExecucao };
    const clienteId = processo?.cliente_id || processo?.clienteId;

    if (perfilUsuario === 'admin_efficience' && clienteId) {
      dadosRequisicao.cliente_id = clienteId;
    }

    setErrosExecucaoEtapa((valorAtual) => {
      const proximo = { ...valorAtual };
      delete proximo[chaveEtapa];
      return proximo;
    });
    setEtapasEmExecucao((valorAtual) => ({ ...valorAtual, [chaveEtapa]: true }));
    setProcessos((valorAtual) =>
      atualizarEtapaNaLista(valorAtual, processoId, etapaId, (etapaAtual) => ({
        ...etapaAtual,
        status: 'pronta_para_execucao',
        concluida: false,
        payload_execucao: dadosExecucao,
        erro_execucao: null,
      })),
    );

    try {
      const retorno = await executarAcaoEtapa(processoId, etapaId, dadosRequisicao);
      const etapaAtualizada = extrairEtapaAtualizada(retorno);

      setProcessos((valorAtual) =>
        atualizarEtapaNaLista(valorAtual, processoId, etapaId, (etapaAtual) => {
          if (etapaConcluida(etapaAtual) || obterErroExecucaoEtapa(etapaAtual)) {
            return etapaAtual;
          }

          return {
            ...etapaAtual,
            ...(etapaAtualizada || {}),
            status: etapaAtualizada?.status || 'pronta_para_execucao',
            payload_execucao: etapaAtualizada?.payload_execucao ?? dadosExecucao,
            erro_execucao: etapaAtualizada?.erro_execucao ?? null,
          };
        }),
      );
    } catch (error) {
      const processosReconciliados = await carregarProcessos({
        silencioso: true,
        reportarErro: false,
      });
      const etapaReconciliada = processosReconciliados
        ? encontrarEtapaNaLista(processosReconciliados, processoId, etapaId)
        : null;
      const servidorRecebeuExecucao =
        etapaReconciliada &&
        (etapaEmProcessamento(etapaReconciliada) ||
          etapaConcluida(etapaReconciliada) ||
          Boolean(obterErroExecucaoEtapa(etapaReconciliada)));

      if (!servidorRecebeuExecucao) {
        setProcessos((valorAtual) =>
          atualizarEtapaNaLista(valorAtual, processoId, etapaId, (etapaAtual) => ({
            ...etapaAtual,
            ...etapa,
          })),
        );
        setErrosExecucaoEtapa((valorAtual) => ({
          ...valorAtual,
          [chaveEtapa]: obterMensagemErro(
            error,
            'Não foi possível iniciar a execução. Tente novamente.',
          ),
        }));
      }
    } finally {
      setEtapasEmExecucao((valorAtual) => {
        const proximo = { ...valorAtual };
        delete proximo[chaveEtapa];
        return proximo;
      });
    }
  }

  if (isLoading) {
    return <p>Carregando...</p>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <main className="space-y-6 p-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Processos</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Checklist operacional para acompanhar o progresso em cada etapa.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {podeCriarProcesso ? (
              <button
                type="button"
                onClick={abrirModalNovoProcesso}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
              >
                Novo processo
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => carregarProcessos()}
              disabled={isLoadingProcessos}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingProcessos ? 'Atualizando...' : 'Atualizar lista'}
            </button>
          </div>
        </header>

        {perfilUsuario && !podeCriarProcesso ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="text-sm text-sky-900">
              Criação de novos processos disponível apenas para o perfil admin_cliente.
            </p>
          </section>
        ) : null}

        {perfilUsuario && !podeMarcarEtapa ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <p className="text-sm text-amber-900">
              Seu perfil está em modo leitura para etapas. Somente funcionários e administradores
              podem marcar progresso.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtros</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Tipo</span>
                <select
                  value={filtroTipo}
                  onChange={(event) => setFiltroTipo(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                >
                  <option value="">Todos</option>
                  {tiposDisponiveis.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {formatarRotulo(tipo)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-700">Status</span>
                <select
                  value={filtroStatus}
                  onChange={(event) => setFiltroStatus(event.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
                >
                  {STATUS_OPCOES.map((opcao) => (
                    <option key={opcao.value || 'todos'} value={opcao.value}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Total na lista
            </p>
            <p className="mt-2 text-4xl font-bold leading-none text-zinc-900">{totalProcessos}</p>
            <p className="mt-2 text-xs text-zinc-600">{totalConcluidos} concluídos nos filtros.</p>
          </article>
        </section>

        {erro ? (
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-medium text-rose-800">{erro}</p>
          </section>
        ) : null}

        {!erro && isLoadingProcessos ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <Spinner />
              <span>Carregando processos...</span>
            </div>
          </section>
        ) : null}

        {!erro && !isLoadingProcessos && processos.length === 0 ? (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">Nenhum processo encontrado para os filtros ativos.</p>
          </section>
        ) : null}

        {!erro && !isLoadingProcessos && processos.length > 0 ? (
          <section className="space-y-3">
            {processos.map((processo, index) => {
              const processoId = obterIdProcesso(processo);
              const chaveProcesso = processoId ? String(processoId) : `idx-${index}`;
              const statusProcesso = obterStatusProcesso(processo);
              const tipoProcesso = obterTipoProcesso(processo);
              const etapas = obterEtapas(processo);
              const { totalEtapas, etapasConcluidas, percentual } = obterResumoEtapas(processo);
              const expandido = Boolean(processosExpandidos[chaveProcesso]);
              const idEtapasProcesso = `etapas-processo-${chaveProcesso.replace(
                /[^a-zA-Z0-9_-]/g,
                '-',
              )}`;

              return (
                <article
                  key={chaveProcesso}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <h2 className="text-base font-semibold text-zinc-900">
                        {tituloProcesso(processo, index)}
                      </h2>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700">
                          Tipo: {formatarRotulo(tipoProcesso)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 font-medium ${classeBadgeStatus(
                            statusProcesso,
                          )}`}
                        >
                          Status: {formatarRotulo(statusProcesso)}
                        </span>
                      </div>

                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-medium text-zinc-600">
                          {etapasConcluidas} de {totalEtapas} etapas
                        </p>
                        <div className="flex items-center gap-3">
                          <div
                            className="h-2 w-full max-w-xl overflow-hidden rounded-full bg-zinc-200"
                            role="progressbar"
                            aria-label={`Progresso de ${tituloProcesso(processo, index)}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percentual}
                          >
                            <div
                              className="h-full rounded-full bg-zinc-800 transition-all"
                              style={{ width: `${percentual}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-zinc-600">{percentual}%</span>
                        </div>
                      </div>
                    </div>

                    {etapas.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => alternarExpansao(chaveProcesso)}
                        aria-expanded={expandido}
                        aria-controls={idEtapasProcesso}
                        className="self-start rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
                      >
                        {expandido ? 'Ocultar etapas' : 'Ver etapas'}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">Sem etapas cadastradas</span>
                    )}
                  </header>

                  {expandido ? (
                    <div id={idEtapasProcesso} className="mt-4 border-t border-zinc-100 pt-4">
                      <ul className="space-y-2">
                        {etapas.map((etapa, etapaIndex) => {
                          const etapaId = obterIdEtapa(etapa);
                          const tituloEtapa = obterTituloEtapa(etapa, etapaIndex);
                          const chaveEtapa = `${chaveProcesso}::${
                            etapaId || `etapa-${etapaIndex}`
                          }`;
                          const chaveAtualizacao = processoId ? `${processoId}::${etapaId}` : null;
                          const atualizandoEtapa = chaveAtualizacao
                            ? Boolean(etapasEmAtualizacao[chaveAtualizacao])
                            : false;
                          const enviandoEtapa = Boolean(etapasEmExecucao[chaveEtapa]);
                          const concluida = etapaConcluida(etapa);
                          const automatizada = etapaAutomatizada(etapa);
                          const tipoEtapa = obterTipoEtapa(etapa);
                          const tipoDesconhecido = tipoEtapa !== 'manual' && !automatizada;
                          const acao = obterAcaoEtapa(etapa);
                          const formulario = automatizada
                            ? obterFormularioEtapa(chaveEtapa, etapa, processo)
                            : null;
                          const erroEtapa =
                            errosExecucaoEtapa[chaveEtapa] || obterErroExecucaoEtapa(etapa);
                          const bloqueado =
                            !podeMarcarEtapa ||
                            !processoId ||
                            !etapaId ||
                            atualizandoEtapa ||
                            enviandoEtapa;
                          const idBase = `etapa-${String(etapaId || etapaIndex).replace(
                            /[^a-zA-Z0-9_-]/g,
                            '-',
                          )}`;

                          return (
                            <li
                              key={etapaId || `${chaveProcesso}-etapa-${etapaIndex}`}
                              data-testid={`etapa-${etapaId || etapaIndex}`}
                              className={`rounded-lg border px-3 py-3 ${
                                concluida && automatizada
                                  ? 'border-emerald-200 bg-emerald-50/40'
                                  : 'border-zinc-200 bg-zinc-50'
                              }`}
                            >
                              {automatizada ? (
                                <EtapaAutomatizada
                                  acao={acao}
                                  arquivo={obterArquivoGerado(etapa)}
                                  bloqueada={bloqueado}
                                  concluida={concluida}
                                  enviando={enviandoEtapa}
                                  erro={erroEtapa}
                                  formulario={formulario}
                                  idBase={idBase}
                                  processando={etapaEmProcessamento(etapa)}
                                  titulo={tituloEtapa}
                                  onAdicionarSocio={() =>
                                    adicionarSocioFormulario(chaveEtapa, etapa, processo)
                                  }
                                  onAlterarCampo={(campo, valor) =>
                                    alterarCampoFormulario(
                                      chaveEtapa,
                                      etapa,
                                      processo,
                                      campo,
                                      valor,
                                    )
                                  }
                                  onAlterarSocio={(socioIndex, campo, valor) =>
                                    alterarSocioFormulario(
                                      chaveEtapa,
                                      etapa,
                                      processo,
                                      socioIndex,
                                      campo,
                                      valor,
                                    )
                                  }
                                  onRemoverSocio={(socioIndex) =>
                                    removerSocioFormulario(
                                      chaveEtapa,
                                      etapa,
                                      processo,
                                      socioIndex,
                                    )
                                  }
                                  onSubmit={(event) =>
                                    handleExecutarAcaoEtapa(
                                      event,
                                      processo,
                                      etapa,
                                      chaveEtapa,
                                      formulario,
                                    )
                                  }
                                />
                              ) : tipoDesconhecido ? (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-zinc-800">{tituloEtapa}</p>
                                  <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Tipo de etapa não suportado: {tipoEtapa}.
                                  </p>
                                </div>
                              ) : (
                                <label className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={concluida}
                                      disabled={bloqueado}
                                      onChange={(event) =>
                                        handleToggleEtapa(processo, etapa, event.target.checked)
                                      }
                                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                    <span
                                      className={`text-sm ${
                                        concluida
                                          ? 'text-zinc-500 line-through'
                                          : 'text-zinc-800'
                                      }`}
                                    >
                                      {tituloEtapa}
                                    </span>
                                  </div>

                                  {atualizandoEtapa ? (
                                    <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                                      <Spinner />
                                      <span>Salvando...</span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-zinc-500">
                                      {concluida ? 'Concluída' : 'Pendente'}
                                    </span>
                                  )}
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : null}
      </main>

      {isNovoModalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <section className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl max-h-[90vh] flex flex-col">
            <header className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Novo processo</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Selecione o tipo para iniciar o checklist do processo.
                </p>
              </div>

              <button
                type="button"
                onClick={fecharModalNovoProcesso}
                disabled={isCriandoProcesso}
                className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Fechar modal"
              >
                X
              </button>
            </header>

            <form className="space-y-4 p-5 overflow-y-auto" onSubmit={handleCriarProcesso}>
              <label className="space-y-2 block">
                <span className="block text-sm font-medium text-zinc-700">Tipo de processo</span>
                <select
                  value={novoTipoProcesso}
                  onChange={(event) => setNovoTipoProcesso(event.target.value)}
                  disabled={isCriandoProcesso}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  required
                >
                  {tiposDisponiveis.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {formatarRotulo(tipo)}
                    </option>
                  ))}
                </select>
              </label>

              {novoTipoProcesso === 'abertura_empresa' ? (
                <div className="border-t border-zinc-100 pt-4">
                  <FormularioContratoSocial
                    idBase="modal-novo-processo"
                    formulario={novoFormularioAbertura}
                    disabled={isCriandoProcesso}
                    onAdicionarSocio={() =>
                      setNovoFormularioAbertura((prev) => ({
                        ...prev,
                        socios: [...prev.socios, normalizarSocio()],
                      }))
                    }
                    onAlterarCampo={(campo, valor) =>
                      setNovoFormularioAbertura((prev) => ({
                        ...prev,
                        [campo]: valor,
                      }))
                    }
                    onAlterarSocio={(index, campo, valor) =>
                      setNovoFormularioAbertura((prev) => ({
                        ...prev,
                        socios: prev.socios.map((s, i) =>
                          i === index ? { ...s, [campo]: valor } : s,
                        ),
                      }))
                    }
                    onRemoverSocio={(index) =>
                      setNovoFormularioAbertura((prev) => ({
                        ...prev,
                        socios: prev.socios.filter((_, i) => i !== index),
                      }))
                    }
                  />
                </div>
              ) : null}

              {erroNovoProcesso ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {erroNovoProcesso}
                </p>
              ) : null}

              <footer className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={fecharModalNovoProcesso}
                  disabled={isCriandoProcesso}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isCriandoProcesso}
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCriandoProcesso ? <Spinner /> : null}
                  {isCriandoProcesso ? 'Criando...' : 'Criar processo'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}