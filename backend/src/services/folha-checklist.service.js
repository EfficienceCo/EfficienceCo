// FOLHA-8 (#748): liga o pipeline da folha ao checklist do processo folha_pagamento.
// Decisão: efficience-vault/decisoes/2026-11-20-folha-8-checklist-automatico.md.
//
// - O checklist é por escritório (cliente_id) + mês. A planilha tem a coluna `empresa` em
//   texto livre: o painel não sabe se todas as empresas do mês foram enviadas.
// - Os marcos vêm de eventos do pipeline (upload aceito, cálculo concluído, saída gerada
//   com 200), não do nome do status do processamento (FOLHA-3 pode renomeá-lo).
// - Uma etapa só vai de pendente para concluída. Um marco conclui também as automáticas
//   anteriores (catch-up): se o gancho de um marco falhar, o seguinte, ou o retry, recupera.
// - Nunca lança: o checklist é efeito colateral e não pode derrubar o upload nem o pipeline.
import supabase from "../config/database.js";
import {
  ACOES_FOLHA,
  concluirProcessoSeTodasEtapasConcluidas,
  criarProcessoComEtapas,
} from "./processos.service.js";

const CODIGO_VIOLACAO_UNICA = "23505";

export const MARCOS_FOLHA = Object.freeze({
  RECEBIDA: "recebida",
  CALCULADA: "calculada",
  HOLERITES: "holerites",
});

const ACOES_ATE_MARCO = {
  [MARCOS_FOLHA.RECEBIDA]: [ACOES_FOLHA.PLANILHA_RECEBIDA],
  [MARCOS_FOLHA.CALCULADA]: [ACOES_FOLHA.PLANILHA_RECEBIDA, ACOES_FOLHA.CALCULADA],
  [MARCOS_FOLHA.HOLERITES]: [
    ACOES_FOLHA.PLANILHA_RECEBIDA,
    ACOES_FOLHA.CALCULADA,
    ACOES_FOLHA.HOLERITES_GERADOS,
  ],
};

/** Mês corrente no formato de processos.mes_referencia (YYYY-MM-01), como o job do dia 1. */
export function mesReferenciaAtual(agora = new Date()) {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
}

async function buscarProcessoFolha(clienteId, mesReferencia) {
  return supabase
    .from("processos")
    .select("id, cliente_id, tipo, status, mes_referencia")
    .eq("cliente_id", clienteId)
    .eq("tipo", "folha_pagamento")
    .eq("mes_referencia", mesReferencia)
    .maybeSingle();
}

/**
 * Busca o processo folha_pagamento do cliente no mês; cria (com as etapas padrão) se não
 * existir. A corrida com outro upload ou com o job do dia 1 é fechada pelo índice único
 * parcial da migration 111: quem perde recebe 23505 e busca de novo.
 * @param {string} clienteId
 * @param {string} mesReferencia - YYYY-MM-01
 * @returns {{ processo, etapas?, criado: boolean } | { erro: string }}
 */
export async function garantirProcessoFolha(clienteId, mesReferencia) {
  const { data: existente, error: erroBusca } = await buscarProcessoFolha(clienteId, mesReferencia);
  if (erroBusca) return { erro: erroBusca.message };
  if (existente) return { processo: existente, criado: false };

  const resultado = await criarProcessoComEtapas(clienteId, "folha_pagamento", {
    mes_referencia: mesReferencia,
  });

  if (!resultado.erro) {
    return { processo: resultado.processo, etapas: resultado.etapas, criado: true };
  }

  if (resultado.codigo !== CODIGO_VIOLACAO_UNICA) return { erro: resultado.erro };

  const { data: vencedor, error: erroRebusca } = await buscarProcessoFolha(clienteId, mesReferencia);
  if (erroRebusca) return { erro: erroRebusca.message };
  if (!vencedor) return { erro: "processo da folha não encontrado após violação de unicidade" };
  return { processo: vencedor, criado: false };
}

/**
 * Conclui as etapas automáticas do checklist até o marco, no processo do mesmo cliente e
 * mês do processamento. O cliente vem sempre do processamento, nunca de quem chama.
 * @param {string} processamentoId
 * @param {"recebida"|"calculada"|"holerites"} marco
 * @returns {Promise<{ processoId?: string, etapasConcluidas: number, processoConcluido: boolean, erro?: string }>}
 */
export async function avancarChecklistFolha(processamentoId, marco) {
  const vazio = { etapasConcluidas: 0, processoConcluido: false };

  try {
    const acoes = ACOES_ATE_MARCO[marco];
    if (!acoes) throw new Error(`marco desconhecido: ${marco}`);

    const { data: processamento, error: erroProcessamento } = await supabase
      .from("processamentos_folha")
      .select("cliente_id, mes_referencia")
      .eq("id", processamentoId)
      .maybeSingle();

    if (erroProcessamento) throw new Error(erroProcessamento.message);
    if (!processamento) throw new Error("processamento não encontrado");

    const garantido = await garantirProcessoFolha(
      processamento.cliente_id,
      processamento.mes_referencia,
    );
    if (garantido.erro) throw new Error(garantido.erro);

    const { processo } = garantido;
    // Processo concluído ou cancelado não volta a mexer. Processo antigo (5 etapas
    // manuais) não tem etapa com essas ações e o UPDATE abaixo não afeta nada.
    if (processo.status !== "em_andamento") return { ...vazio, processoId: processo.id };

    const { data: concluidas, error: erroUpdate } = await supabase
      .from("etapas")
      .update({
        status: "concluida",
        concluida: true,
        concluida_em: new Date().toISOString(),
      })
      .eq("processo_id", processo.id)
      .eq("tipo", "automatizada")
      .in("acao", acoes)
      .eq("concluida", false)
      .select("id");

    if (erroUpdate) throw new Error(erroUpdate.message);

    const fechamento = await concluirProcessoSeTodasEtapasConcluidas(processo.id);
    if (fechamento.erro) throw new Error(fechamento.erro);

    return {
      processoId: processo.id,
      etapasConcluidas: concluidas?.length ?? 0,
      processoConcluido: Boolean(fechamento.todasConcluidas && fechamento.processo),
    };
  } catch (err) {
    console.error(
      `[folha-checklist] Falha ao avançar o checklist (marco ${marco}) do processamento ${processamentoId}:`,
      err.message,
    );
    return { ...vazio, erro: err.message };
  }
}
