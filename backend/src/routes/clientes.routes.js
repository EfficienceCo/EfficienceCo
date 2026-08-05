import express from "express";
import { exigirPerfil, PERFIS } from "../middlewares/permissao.middleware.js";
import {
  listarClientes,
  buscarCliente,
  buscarClientePorCnpj,
  criarCliente,
  atualizarCliente,
  deletarCliente,
} from "../controllers/clientes.controller.js";

const router = express.Router();

// Rota do agente — auth via x-licenca-token no controller.
// Registrada antes de /:id para não capturar "por-cnpj" como UUID.
router.get("/por-cnpj", buscarClientePorCnpj);

// Todas as rotas de clientes são exclusivas para admin_efficience —
// operações de gestão do painel interno da Efficience
router.get("/", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), listarClientes);
router.get("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), buscarCliente);
router.post("/", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), criarCliente);
router.patch("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), atualizarCliente);
router.delete("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), deletarCliente);

console.log("[clientes.routes] Rotas de clientes registradas");

export default router;
