import { criar as criarNotificacaoPadrao } from "./notificacoes.service.js";
import { montarDescricaoConclusao } from "./folha-status.helpers.js";

export * from "./folha-status.helpers.js";

/**
 * Registra evento + notificação de conclusão uma única vez por processamento.
 * Usa claim atômico em evento_conclusao_registrado para idempotência.
 *
 * @returns {{ registrado: boolean, descricao?: string }}
 */
export async function registrarEventoConclusaoFolha(
  supabase,
  { processamentoId, clienteId, totalFuncionarios, totalEmpresas },
  { criarNotificacao = criarNotificacaoPadrao } = {},
) {
  const descricao = montarDescricaoConclusao(totalFuncionarios, totalEmpresas);

  const { data: reivindicado, error: erroClaim } = await supabase
    .from("processamentos_folha")
    .update({ evento_conclusao_registrado: true })
    .eq("id", processamentoId)
    .eq("evento_conclusao_registrado", false)
    .select("id");

  if (erroClaim) {
    console.error(
      "[folha-status.service] Erro ao reivindicar evento de conclusão:",
      erroClaim.message,
    );
    return { registrado: false };
  }

  if (!reivindicado || reivindicado.length === 0) {
    return { registrado: false };
  }

  const { error: erroEvento } = await supabase.from("eventos").insert({
    cliente_id: clienteId,
    descricao,
    sucesso: true,
  });

  if (erroEvento) {
    console.error(
      "[folha-status.service] Erro ao inserir evento de conclusão:",
      erroEvento.message,
    );
    await supabase
      .from("processamentos_folha")
      .update({ evento_conclusao_registrado: false })
      .eq("id", processamentoId);
    return { registrado: false };
  }

  await criarNotificacao(clienteId, "arquivo_processado", descricao);

  return { registrado: true, descricao };
}
