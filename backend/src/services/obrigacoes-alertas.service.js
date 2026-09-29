import supabasePadrao from "../config/database.js";
import { criar as criarNotificacaoPadrao } from "./notificacoes.service.js";
import { calcularDiasRestantes } from "../utils/prazo.util.js";

/**
 * Marcos de alerta, em dias restantes até o vencimento.
 * 3 e 0 herdam o limiar fixo de <= 3 dias que existia em GET /obrigacoes/proximas
 * (#529): o aviso de antecedência curta e o do próprio dia do vencimento.
 */
export const MARCOS_ALERTA_OBRIGACAO = Object.freeze([60, 30, 7, 3, 0]);

const STATUS_ALERTAVEIS = Object.freeze(["pendente", "atrasada"]);

const MAIOR_MARCO = Math.max(...MARCOS_ALERTA_OBRIGACAO);

function emDias(hoje, n) {
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function montarMensagemAlerta(obrigacao, diasRestantes) {
  const prazo = diasRestantes === 0 ? "vence hoje" : `vence em ${diasRestantes} dia(s)`;
  return `Obrigação "${obrigacao.nome}" [${obrigacao.id}] ${prazo}.`;
}

/**
 * Varre obrigações em aberto e emite evento + notificação nos marcos 60/30/7/3/0.
 * Idempotente via claim atômico em `ultimo_marco_alertado` — roda uma vez por dia
 * no job, sem depender de alguém abrir o dashboard.
 *
 * @returns {{ alertados: number, erros: number }}
 */
export async function varrearAlertasObrigacoes({
  supabase = supabasePadrao,
  criarNotificacao = criarNotificacaoPadrao,
  hoje = new Date(),
} = {}) {
  const { data: obrigacoes, error: erroLista } = await supabase
    .from("obrigacoes")
    .select("id, cliente_id, nome, data_vencimento, status, ultimo_marco_alertado")
    .in("status", STATUS_ALERTAVEIS)
    .gte("data_vencimento", emDias(hoje, 0))
    .lte("data_vencimento", emDias(hoje, MAIOR_MARCO));

  if (erroLista) {
    console.error(
      "[obrigacoes-alertas.service] Erro ao listar obrigações:",
      erroLista.message,
    );
    return { alertados: 0, erros: 1 };
  }

  let alertados = 0;
  let erros = 0;

  for (const obrigacao of obrigacoes ?? []) {
    const diasRestantes = calcularDiasRestantes(obrigacao.data_vencimento, hoje);

    if (!MARCOS_ALERTA_OBRIGACAO.includes(diasRestantes)) {
      continue;
    }

    if (obrigacao.ultimo_marco_alertado === diasRestantes) {
      continue;
    }

    const marcoAnterior = obrigacao.ultimo_marco_alertado ?? null;
    const mensagem = montarMensagemAlerta(obrigacao, diasRestantes);

    const { data: reivindicado, error: erroClaim } = await supabase
      .from("obrigacoes")
      .update({ ultimo_marco_alertado: diasRestantes })
      .eq("id", obrigacao.id)
      .in("status", STATUS_ALERTAVEIS)
      .or(`ultimo_marco_alertado.is.null,ultimo_marco_alertado.neq.${diasRestantes}`)
      .select("id");

    if (erroClaim) {
      console.error(
        `[obrigacoes-alertas.service] Erro ao reivindicar alerta ${obrigacao.id}:`,
        erroClaim.message,
      );
      erros++;
      continue;
    }

    if (!reivindicado || reivindicado.length === 0) {
      continue;
    }

    const { error: erroEvento } = await supabase.from("eventos").insert({
      cliente_id: obrigacao.cliente_id,
      descricao: mensagem,
      sucesso: true,
    });

    if (erroEvento) {
      console.error(
        `[obrigacoes-alertas.service] Erro ao inserir evento ${obrigacao.id}:`,
        erroEvento.message,
      );
      await supabase
        .from("obrigacoes")
        .update({ ultimo_marco_alertado: marcoAnterior })
        .eq("id", obrigacao.id);
      erros++;
      continue;
    }

    await criarNotificacao(obrigacao.cliente_id, "obrigacao_vencendo", mensagem);
    alertados++;
  }

  return { alertados, erros };
}
