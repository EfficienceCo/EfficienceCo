// Middleware de licença.
// Protege rotas que só podem ser acessadas por clientes com licença ativa,
// ex. folha de pagamento. Deve ser usado depois de autenticar (exigirPerfil já embute autenticar).

import { PERFIS } from "../config/perfis.js";
import { licencaAtivaParaCliente } from "../services/licenca.service.js";
import { resolverClienteId } from "./permissao.middleware.js";

export async function exigirLicencaAtiva(req, res, next) {
  // admin_efficience é time interno, não vinculado a um cliente específico —
  // licença é do escritório contábil (cliente), não faz sentido travar staff nisso.
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return next();
  }

  const clienteId = resolverClienteId(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "Usuario sem cliente vinculado" });
  }

  const ativa = await licencaAtivaParaCliente(clienteId);

  if (!ativa) {
    console.log(
      `[licenca.middleware] Acesso negado — licença inativa ou expirada para cliente: ${clienteId}`,
    );
    return res.status(403).json({ erro: "Licença inativa ou expirada" });
  }

  return next();
}
