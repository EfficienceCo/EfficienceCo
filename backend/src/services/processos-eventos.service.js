import { criar as criarNotificacaoPadrao } from "./notificacoes.service.js";

/**
 * Monta a descrição do evento de etapa (mesmo contrato do agente / QA-D).
 */
export function montarDescricaoEventoEtapa({
  acao,
  nomeEmpresa,
  sucesso,
  erro,
} = {}) {
  const empresa =
    typeof nomeEmpresa === "string" && nomeEmpresa.trim()
      ? nomeEmpresa.trim()
      : "empresa";
  const acaoEtapa = acao || "desconhecida";

  if (!sucesso) {
    const detalhe =
      typeof erro === "string" && erro.trim() ? erro.trim() : "erro desconhecido";
    return `Falha ao processar etapa ${acaoEtapa} (${empresa}): ${detalhe}`;
  }

  if (acaoEtapa === "criar_pastas") {
    return `Estrutura de pastas criada para ${empresa}`;
  }
  if (acaoEtapa === "gerar_contrato_social") {
    return `Contrato social gerado para ${empresa}`;
  }
  return `Etapa ${acaoEtapa} concluída para ${empresa}`;
}

/**
 * Persiste evento (+ notificação) ligado à conclusão/falha de uma etapa.
 * Não propaga falha — o caller já commitou o status da etapa.
 *
 * @returns {{ registrado: boolean, descricao?: string }}
 */
export async function registrarEventoEtapa(
  supabase,
  { clienteId, acao, nomeEmpresa, sucesso, erro },
  { criarNotificacao = criarNotificacaoPadrao } = {},
) {
  const descricao = montarDescricaoEventoEtapa({
    acao,
    nomeEmpresa,
    sucesso,
    erro,
  });

  const { error: erroEvento } = await supabase.from("eventos").insert({
    cliente_id: clienteId,
    descricao,
    sucesso: Boolean(sucesso),
  });

  if (erroEvento) {
    console.error(
      "[processos-eventos.service] Erro ao inserir evento de etapa:",
      erroEvento.message,
    );
    return { registrado: false, descricao };
  }

  const tipoNotificacao = sucesso ? "arquivo_processado" : "arquivo_erro";
  await criarNotificacao(clienteId, tipoNotificacao, descricao);

  return { registrado: true, descricao };
}
