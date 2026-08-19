import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { calcularSimplesNacional } from "../utils/simples-nacional.util.js";
import { ultimoDiaDoMes } from "../utils/periodo.util.js";

const REGIMES_SUPORTADOS = new Set(["simples_nacional"]);

// GET usa clienteId (camelCase) — mesmo padrão do dashboard em lancamentos-fiscais.controller.js.
function resolverClienteIdQuery(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.query.clienteId;
  }
  return req.usuario?.cliente_id;
}

// POST vem do dashboard (JWT), não do agente — payload usa clienteId (camelCase),
// espelhando a query string dos outros endpoints deste controller.
function resolverClienteIdBody(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.body.clienteId;
  }
  return req.usuario?.cliente_id;
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// RBT12 é o acumulado móvel de 12 meses TERMINANDO no mês de apuração (inclui
// o próprio mês) — ver referencias/apuracao-impostos-guia-reuniao.md: "se
// estamos em agosto, RBT12 = soma de setembro do ano passado até agosto deste
// ano". O Fator R usa a mesma janela (folha dos últimos 12 meses).
function calcularJanela12Meses(mes, ano) {
  const indiceFim = ano * 12 + (mes - 1);
  const indiceInicio = indiceFim - 11;
  const anoInicio = Math.floor(indiceInicio / 12);
  const mesInicio = (indiceInicio % 12) + 1;

  const inicio = `${anoInicio}-${String(mesInicio).padStart(2, "0")}-01`;
  const fim = ultimoDiaDoMes(ano, mes);

  return { inicio, fim };
}

export async function dispararApuracao(req, res) {
  const clienteId = resolverClienteIdBody(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano, regime } = req.body;
  if (!mes || !ano || !regime) {
    return res.status(400).json({ erro: "mes, ano e regime são obrigatórios" });
  }

  if (!REGIMES_SUPORTADOS.has(regime)) {
    return res.status(422).json({ erro: "Regime tributário não suportado" });
  }

  const mesNum = parseInt(mes, 10);
  const anoNum = parseInt(ano, 10);

  // Mesmos limites da CHECK constraint em database/migrations/71.sql — falhar aqui
  // com 400 em vez de deixar o Postgres rejeitar o insert com um 500 genérico.
  if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12 || !Number.isInteger(anoNum) || anoNum < 2020) {
    return res.status(400).json({ erro: "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020" });
  }

  const [{ data: existente, error: erroExistente }, { data: cliente, error: erroCliente }] = await Promise.all([
    supabase
      .from("apuracoes")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("periodo_mes", mesNum)
      .eq("periodo_ano", anoNum)
      .eq("regime", regime)
      .maybeSingle(),
    supabase.from("clientes").select("anexo_simples").eq("id", clienteId).maybeSingle(),
  ]);

  if (erroExistente) {
    console.error("[apuracoes.controller] Erro ao verificar apuração existente:", erroExistente.message);
    return res.status(500).json({ erro: "Erro ao verificar apuração existente" });
  }

  if (existente) {
    return res.status(409).json({ erro: "Já existe uma apuração para este cliente, período e regime" });
  }

  if (erroCliente) {
    console.error("[apuracoes.controller] Erro ao buscar cliente:", erroCliente.message);
    return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
  }

  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  const { inicio, fim } = calcularJanela12Meses(mesNum, anoNum);
  const mesReferenciaAtual = `${anoNum}-${String(mesNum).padStart(2, "0")}`;

  const { data: notas, error: erroNotas } = await supabase
    .from("lancamentos_fiscais")
    .select("valor_total, data_emissao")
    .eq("cliente_id", clienteId)
    .eq("tipo", "saida")
    .gte("data_emissao", inicio)
    .lte("data_emissao", fim);

  if (erroNotas) {
    console.error("[apuracoes.controller] Erro ao buscar lançamentos fiscais:", erroNotas.message);
    return res.status(500).json({ erro: "Erro ao buscar lançamentos fiscais" });
  }

  const linhasNotas = notas || [];
  const rbt12 = arredondar(
    linhasNotas.reduce((soma, linha) => soma + Number(linha.valor_total), 0),
  );
  const receitaMes = arredondar(
    linhasNotas
      .filter((linha) => linha.data_emissao.slice(0, 7) === mesReferenciaAtual)
      .reduce((soma, linha) => soma + Number(linha.valor_total), 0),
  );

  let folha12 = null;
  let semDadosFolha = false;

  if (cliente.anexo_simples === "V") {
    const { data: processamentos, error: erroProcessamentos } = await supabase
      .from("processamentos_folha")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("status", "concluido")
      .gte("mes_referencia", inicio)
      .lte("mes_referencia", fim);

    if (erroProcessamentos) {
      console.error("[apuracoes.controller] Erro ao buscar processamentos de folha:", erroProcessamentos.message);
      return res.status(500).json({ erro: "Erro ao buscar dados de folha" });
    }

    const idsProcessamentos = (processamentos || []).map((p) => p.id);

    if (idsProcessamentos.length === 0) {
      semDadosFolha = true;
    } else {
      const { data: calculos, error: erroCalculos } = await supabase
        .from("folha_calculos")
        .select("salario_bruto")
        .in("processamento_id", idsProcessamentos);

      if (erroCalculos) {
        console.error("[apuracoes.controller] Erro ao buscar cálculos de folha:", erroCalculos.message);
        return res.status(500).json({ erro: "Erro ao buscar dados de folha" });
      }

      folha12 = arredondar((calculos || []).reduce((soma, linha) => soma + Number(linha.salario_bruto), 0));
    }
  }

  const resultado = calcularSimplesNacional({
    rbt12,
    receita_mes: receitaMes,
    anexo: cliente.anexo_simples,
    folha12,
    semDadosFolha,
  });

  if (resultado.erro) {
    return res.status(422).json({ erro: resultado.erro });
  }

  const { data, error } = await supabase
    .from("apuracoes")
    .insert({
      cliente_id: clienteId,
      periodo_mes: mesNum,
      periodo_ano: anoNum,
      regime,
      rbt12_usado: resultado.rbt12_usado,
      receita_mes: resultado.receita_mes,
      anexo: resultado.anexo_efetivo,
      fator_r: resultado.fator_r,
      folha12,
      aliquota_efetiva: resultado.aliquota_efetiva,
      valor_calculado: resultado.valor_das,
      status: "rascunho",
    })
    .select()
    .single();

  if (error) {
    // unique_violation — corrida entre duas chamadas concorrentes pro mesmo período.
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Já existe uma apuração para este cliente, período e regime" });
    }
    console.error("[apuracoes.controller] Erro ao registrar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar apuração" });
  }

  return res.status(201).json(data);
}

export async function listarApuracoes(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;

  let query = supabase
    .from("apuracoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("periodo_ano", { ascending: false })
    .order("periodo_mes", { ascending: false });

  if (mes) query = query.eq("periodo_mes", parseInt(mes, 10));
  if (ano) query = query.eq("periodo_ano", parseInt(ano, 10));

  const { data, error } = await query;

  if (error) {
    console.error("[apuracoes.controller] Erro ao listar apurações:", error.message);
    return res.status(500).json({ erro: "Erro ao listar apurações" });
  }

  return res.status(200).json(data);
}

export async function detalharApuracao(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase.from("apuracoes").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  // Nunca revelar que o registro existe quando pertence a outro cliente — 404, não 403.
  if (!data || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && data.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  return res.status(200).json(data);
}

export async function editarApuracao(req, res) {
  const { id } = req.params;
  const { valor_editado: valorEditado, motivo } = req.body;

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status, valor_editado, valor_calculado, historico_edicoes")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser editada" });
  }

  if (!motivo) {
    return res.status(400).json({ erro: "motivo é obrigatório" });
  }

  if (valorEditado === undefined || valorEditado === null) {
    return res.status(400).json({ erro: "valor_editado é obrigatório" });
  }

  const valorAnterior = apuracao.valor_editado ?? apuracao.valor_calculado;
  const historicoAtualizado = [
    ...(apuracao.historico_edicoes || []),
    {
      valor_anterior: valorAnterior,
      valor_novo: valorEditado,
      motivo,
      editado_em: new Date().toISOString(),
    },
  ];

  const { data, error } = await supabase
    .from("apuracoes")
    .update({ valor_editado: valorEditado, historico_edicoes: historicoAtualizado })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[apuracoes.controller] Erro ao editar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao editar apuração" });
  }

  return res.status(200).json(data);
}

export async function aprovarApuracao(req, res) {
  const { id } = req.params;

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já está aprovada" });
  }

  const { data, error } = await supabase
    .from("apuracoes")
    .update({
      status: "aprovado",
      aprovado_por: req.usuario?.id,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[apuracoes.controller] Erro ao aprovar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao aprovar apuração" });
  }

  return res.status(200).json(data);
}
