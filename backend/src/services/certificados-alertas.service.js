import supabasePadrao from "../config/database.js";
import { criar as criarNotificacaoPadrao } from "./notificacoes.service.js";
import { calcularDiasRestantes } from "../utils/certificado-prazo.util.js";

export const MARCOS_ALERTA_CERTIFICADO = Object.freeze([60, 30, 7]);

function montarMensagemAlerta(certificadoId, diasRestantes) {
  return `Certificado digital [${certificadoId}] vence em ${diasRestantes} dia(s).`;
}

/**
 * Varre certificados ativos e emite evento + notificação nos marcos 60/30/7.
 * Idempotente via claim atômico em `ultimo_marco_alertado`.
 *
 * @returns {{ alertados: number, erros: number }}
 */
export async function varrearAlertasCertificados({
  supabase = supabasePadrao,
  criarNotificacao = criarNotificacaoPadrao,
  hoje = new Date(),
} = {}) {
  const { data: certificados, error: erroLista } = await supabase
    .from("certificados_digitais")
    .select("id, cliente_id, validade, titular, ultimo_marco_alertado")
    .eq("status", "ativo");

  if (erroLista) {
    console.error(
      "[certificados-alertas.service] Erro ao listar certificados:",
      erroLista.message,
    );
    return { alertados: 0, erros: 1 };
  }

  let alertados = 0;
  let erros = 0;

  for (const certificado of certificados ?? []) {
    const diasRestantes = calcularDiasRestantes(certificado.validade, hoje);

    if (!MARCOS_ALERTA_CERTIFICADO.includes(diasRestantes)) {
      continue;
    }

    if (certificado.ultimo_marco_alertado === diasRestantes) {
      continue;
    }

    const marcoAnterior = certificado.ultimo_marco_alertado ?? null;
    const mensagem = montarMensagemAlerta(certificado.id, diasRestantes);

    const { data: reivindicado, error: erroClaim } = await supabase
      .from("certificados_digitais")
      .update({ ultimo_marco_alertado: diasRestantes })
      .eq("id", certificado.id)
      .eq("status", "ativo")
      .or(`ultimo_marco_alertado.is.null,ultimo_marco_alertado.neq.${diasRestantes}`)
      .select("id");

    if (erroClaim) {
      console.error(
        `[certificados-alertas.service] Erro ao reivindicar alerta ${certificado.id}:`,
        erroClaim.message,
      );
      erros++;
      continue;
    }

    if (!reivindicado || reivindicado.length === 0) {
      continue;
    }

    const { error: erroEvento } = await supabase.from("eventos").insert({
      cliente_id: certificado.cliente_id,
      descricao: mensagem,
      sucesso: true,
    });

    if (erroEvento) {
      console.error(
        `[certificados-alertas.service] Erro ao inserir evento ${certificado.id}:`,
        erroEvento.message,
      );
      await supabase
        .from("certificados_digitais")
        .update({ ultimo_marco_alertado: marcoAnterior })
        .eq("id", certificado.id);
      erros++;
      continue;
    }

    await criarNotificacao(certificado.cliente_id, "certificado_vencendo", mensagem);
    alertados++;
  }

  return { alertados, erros };
}
