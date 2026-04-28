import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";

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
