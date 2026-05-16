import supabase from "../config/database.js";

function resolverClienteId(req) {
  if (req.usuario?.perfil === "admin_efficience") {
    return req.query.cliente_id || req.body.cliente_id;
  }
  return req.usuario?.cliente_id;
}

export async function listarNotificacoes(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const todas = req.query.todas === "true";

  let query = supabase
    .from("notificacoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });

  if (!todas) {
    query = query.eq("lida", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[notificacoes.controller] Erro ao listar:", error.message);
    return res.status(500).json({ erro: "Erro ao listar notificações" });
  }

  return res.status(200).json(data);
}

export async function marcarComoLida(req, res) {
  const { id } = req.params;

  const { data: notificacao, error: erroBusca } = await supabase
    .from("notificacoes")
    .select("id, cliente_id, lida")
    .eq("id", id)
    .single();

  if (erroBusca || !notificacao) {
    return res.status(404).json({ erro: "Notificação não encontrada" });
  }

  if (
    req.usuario.perfil !== "admin_efficience" &&
    notificacao.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para esta notificação" });
  }

  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("id", id);

  if (error) {
    console.error("[notificacoes.controller] Erro ao marcar como lida:", error.message);
    return res.status(500).json({ erro: "Erro ao marcar notificação como lida" });
  }

  return res.status(200).json({ lida: true });
}
