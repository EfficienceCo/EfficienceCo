import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { aplicarFiltroPeriodo } from "../utils/periodo.util.js";

const TIPOS_VALIDOS = new Set(["credito", "debito"]);

const CAMPOS_OBRIGATORIOS = [
  "cliente_id",
  "data_lancamento",
  "valor",
  "tipo",
  "descricao",
];

function camposFaltando(body) {
  return CAMPOS_OBRIGATORIOS.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

// GET usa clienteId (camelCase) — mesmo padrão do dashboard em lancamentos-fiscais.controller.js.
function resolverClienteIdQuery(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.query.clienteId;
  }
  return req.usuario?.cliente_id;
}

export async function criarLancamentoContabil(req, res) {
  const faltando = camposFaltando(req.body);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  const { cliente_id, data_lancamento, valor, tipo, descricao, categoria } = req.body;

  if (!TIPOS_VALIDOS.has(tipo)) {
    return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });
  }

  if (req.usuario.perfil !== PERFIS.ADMIN_EFFICIENCE && cliente_id !== req.usuario.cliente_id) {
    return res.status(403).json({ erro: "cliente_id não corresponde ao usuário autenticado" });
  }

  const { data, error } = await supabase
    .from("lancamentos_contabeis")
    .insert({
      cliente_id,
      data_lancamento,
      valor,
      tipo,
      descricao,
      categoria: categoria ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[lancamentos-contabeis.controller] Erro ao registrar lançamento:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar lançamento contábil" });
  }

  return res.status(201).json(data);
}

export async function listarLancamentosContabeis(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;

  let query = supabase
    .from("lancamentos_contabeis")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("data_lancamento", { ascending: false });

  query = aplicarFiltroPeriodo(query, "data_lancamento", mes, ano);

  const { data, error } = await query;

  if (error) {
    console.error("[lancamentos-contabeis.controller] Erro ao listar lançamentos:", error.message);
    return res.status(500).json({ erro: "Erro ao listar lançamentos contábeis" });
  }

  return res.status(200).json(data);
}

export async function atualizarLancamentoContabil(req, res) {
  const { id } = req.params;

  const { data: lancamento, error: erroBusca } = await supabase
    .from("lancamentos_contabeis")
    .select("cliente_id, conciliado")
    .eq("id", id)
    .single();

  if (erroBusca || !lancamento) {
    return res.status(404).json({ erro: "Lançamento contábil não encontrado" });
  }

  if (
    req.usuario.perfil !== PERFIS.ADMIN_EFFICIENCE &&
    lancamento.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para alterar este lançamento" });
  }

  if (lancamento.conciliado) {
    return res.status(409).json({ erro: "Lançamento já conciliado não pode ser alterado" });
  }

  const { data_lancamento, valor, tipo, descricao, categoria } = req.body;

  if (tipo !== undefined && !TIPOS_VALIDOS.has(tipo)) {
    return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });
  }

  const updates = {};
  if (data_lancamento !== undefined) updates.data_lancamento = data_lancamento;
  if (valor !== undefined) updates.valor = valor;
  if (tipo !== undefined) updates.tipo = tipo;
  if (descricao !== undefined) updates.descricao = descricao;
  if (categoria !== undefined) updates.categoria = categoria;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  const { data, error } = await supabase
    .from("lancamentos_contabeis")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[lancamentos-contabeis.controller] Erro ao atualizar lançamento:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar lançamento contábil" });
  }

  return res.status(200).json(data);
}

export async function deletarLancamentoContabil(req, res) {
  const { id } = req.params;

  const { data: lancamento, error: erroBusca } = await supabase
    .from("lancamentos_contabeis")
    .select("cliente_id, conciliado")
    .eq("id", id)
    .single();

  if (erroBusca || !lancamento) {
    return res.status(404).json({ erro: "Lançamento contábil não encontrado" });
  }

  if (
    req.usuario.perfil !== PERFIS.ADMIN_EFFICIENCE &&
    lancamento.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para remover este lançamento" });
  }

  if (lancamento.conciliado) {
    return res.status(409).json({ erro: "Lançamento já conciliado não pode ser removido" });
  }

  const { error } = await supabase.from("lancamentos_contabeis").delete().eq("id", id);

  if (error) {
    // 23503 = foreign_key_violation: lançamento é referenciado por
    // pares_conciliacao (participou de alguma conciliação, mesmo sem ter
    // ficado conciliado=true — ex.: um item que caiu em "sem par"). Não dá
    // pra remover sem quebrar o histórico da(s) conciliação(ões).
    if (error.code === "23503") {
      return res.status(409).json({
        erro: "Lançamento vinculado a uma conciliação não pode ser removido",
      });
    }

    console.error("[lancamentos-contabeis.controller] Erro ao deletar lançamento:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar lançamento contábil" });
  }

  return res.status(204).send();
}
