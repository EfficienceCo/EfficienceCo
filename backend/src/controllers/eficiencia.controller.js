import supabase from "../config/database.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";

const PERIODOS_VALIDOS = new Set([7, 15, 30]);
const PERIODO_PADRAO_DIAS = 30;

// TODO(#358-followup): eventos não tem coluna tipo_evento — só "descricao" (texto
// livre, ex: "Estrutura de pastas criada para X") e "sucesso" (boolean). Sem uma
// categoria estável não dá pra agrupar por automação, então usamos uma média
// genérica de minutos por evento até essa migration existir.
const MINUTOS_POR_EVENTO = 30;

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

function resolverPeriodoDias(query) {
  const periodo = parseInt(query.periodo, 10);
  return PERIODOS_VALIDOS.has(periodo) ? periodo : PERIODO_PADRAO_DIAS;
}

export async function buscarEficiencia(req, res) {
  const clienteId = resolverClienteId(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const periodoDias = resolverPeriodoDias(req.query);
  const desde = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("eventos")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("sucesso", true)
    .gte("criado_em", desde);

  if (error) {
    console.error("[eficiencia.controller] Erro ao buscar eventos:", error.message);
    return res.status(500).json({ erro: "Erro ao calcular eficiência" });
  }

  const totalExecucoes = (data || []).length;
  const totalHoras = arredondar((totalExecucoes * MINUTOS_POR_EVENTO) / 60);

  // Breakdown por automação fica pendente (ver TODO acima) — por ora, um único
  // grupo agregado em vez de uma lista vazia, pra tabela do frontend não ficar em branco.
  const breakdown =
    totalExecucoes > 0
      ? [{ tipo: "Automações do agente", quantidade: totalExecucoes, horas: totalHoras }]
      : [];

  return res.status(200).json({ total_horas: totalHoras, total_execucoes: totalExecucoes, breakdown });
}
