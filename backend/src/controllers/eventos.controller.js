import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";

export async function listarEventos(req, res) {
  const { perfil, cliente_id: clienteIdJwt } = req.usuario;
  const clienteId = perfil === "admin_efficience" ? req.query.cliente_id : clienteIdJwt;

  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  console.log(
    `[eventos.controller] Listando eventos — cliente: ${clienteId} | limit: ${limit} | offset: ${offset}`,
  );

  const { data, count, error } = await supabase
    .from("eventos")
    .select("*", { count: "exact" })
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (error.message === "Requested range not satisfiable") {
      return res.status(200).json({ data: [], total: count ?? 0, limit, offset });
    }
    console.error("[eventos.controller] Erro ao listar eventos:", error.message);
    return res.status(500).json({ erro: "Erro ao listar eventos" });
  }

  return res.status(200).json({ data, total: count, limit, offset });
}

export async function registrarEvento(req, res) {
  const token = req.headers["x-licenca-token"];
  const { cliente_id, descricao, sucesso } = req.body;

  if (!cliente_id || !descricao || sucesso === undefined) {
    return res
      .status(400)
      .json({ erro: "Campos obrigatórios: cliente_id, descricao, sucesso" });
  }

  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res
      .status(401)
      .json({ erro: "Token de licença inválido ou expirado" });
  }

  if (licenca.cliente_id !== cliente_id) {
    return res.status(403).json({ erro: "Token não pertence a este cliente" });
  }

  console.log(
    "[eventos.controller] Registrando evento para cliente:",
    cliente_id,
  );

  const { data, error } = await supabase
    .from("eventos")
    .insert({ cliente_id, descricao, sucesso })
    .select()
    .single();

  if (error) {
    console.error(
      "[eventos.controller] Erro ao registrar evento:",
      error.message,
    );
    return res.status(500).json({ erro: "Erro ao registrar evento" });
  }

  return res.status(201).json(data);
}
