import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";

function resolverClienteId(req) {
  if (req.usuario?.perfil === "admin_efficience") {
    return req.body.cliente_id || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

export async function listarRegras(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  console.log("[regras.controller] Listando regras para cliente:", clienteId);

  const { data, error } = await supabase
    .from("regras")
    .select("*")
    .eq("cliente_id", clienteId);

  if (error) {
    console.error("[regras.controller] Erro ao listar regras:", error.message);
    return res.status(500).json({ erro: "Erro ao listar regras" });
  }

  return res.status(200).json(data);
}

export async function criarRegra(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { pasta_origem, pasta_destino, condicao, acao, ativa } = req.body;

  console.log("[regras.controller] Criando regra para cliente:", clienteId);

  const { data, error } = await supabase
    .from("regras")
    .insert({ cliente_id: clienteId, pasta_origem, pasta_destino, condicao, acao, ativa })
    .select()
    .single();

  if (error) {
    console.error("[regras.controller] Erro ao criar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao criar regra" });
  }

  return res.status(201).json(data);
}

export async function atualizarRegra(req, res) {
  const { id } = req.params;

  const { data: regra, error: erroBusca } = await supabase
    .from("regras")
    .select("cliente_id")
    .eq("id", id)
    .single();

  if (erroBusca || !regra) {
    return res.status(404).json({ erro: "Regra não encontrada" });
  }

  if (
    req.usuario.perfil !== "admin_efficience" &&
    regra.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para alterar esta regra" });
  }

  const { pasta_origem, pasta_destino, condicao, acao, ativa } = req.body;
  const updates = {};
  if (pasta_origem !== undefined) updates.pasta_origem = pasta_origem;
  if (pasta_destino !== undefined) updates.pasta_destino = pasta_destino;
  if (condicao !== undefined) updates.condicao = condicao;
  if (acao !== undefined) updates.acao = acao;
  if (ativa !== undefined) updates.ativa = ativa;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  console.log("[regras.controller] Atualizando regra:", id);

  const { data, error } = await supabase
    .from("regras")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[regras.controller] Erro ao atualizar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar regra" });
  }

  return res.status(200).json(data);
}

export async function deletarRegra(req, res) {
  const { id } = req.params;

  const { data: regra, error: erroBusca } = await supabase
    .from("regras")
    .select("cliente_id")
    .eq("id", id)
    .single();

  if (erroBusca || !regra) {
    return res.status(404).json({ erro: "Regra não encontrada" });
  }

  if (
    req.usuario.perfil !== "admin_efficience" &&
    regra.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para remover esta regra" });
  }

  console.log("[regras.controller] Deletando regra:", id);

  const { error } = await supabase.from("regras").delete().eq("id", id);

  if (error) {
    console.error("[regras.controller] Erro ao deletar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar regra" });
  }

  return res.status(204).send();
}

export async function buscarRegras(req, res) {
  const { clienteId } = req.params;
  const token = req.headers["x-licenca-token"];

  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res
      .status(401)
      .json({ erro: "Token de licença inválido ou expirado" });
  }

  console.log('clienteId da URL:', clienteId);
  console.log('licenca.cliente_id:', licenca?.cliente_id);
  console.log('são iguais?', licenca?.cliente_id === clienteId);

  if (licenca.cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Token não pertence a este cliente" });
  }

  console.log("[regras.controller] Buscando regras para cliente:", clienteId);

  const { data, error } = await supabase
    .from("regras")
    .select("*")
    .eq("cliente_id", clienteId);

  if (error) {
    console.error("[regras.controller] Erro ao buscar regras:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar regras" });
  }

  return res.status(200).json(data);
}
