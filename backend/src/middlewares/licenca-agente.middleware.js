import { validarTokenLicenca } from "../services/licenca.service.js";

// Autentica o agente local pelo x-licenca-token ANTES de qualquer parse de corpo (multipart):
// quem não tem licença válida recebe 401 sem que a planilha seja lida. A licença fica em
// req.licenca para o controller usar o cliente_id.
export async function exigirLicencaAgente(req, res, next) {
  const licenca = await validarTokenLicenca(req.headers["x-licenca-token"]);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  req.licenca = licenca;
  return next();
}
