import express from "express";
import { exigirPerfil, PERFIS } from "../middlewares/permissao.middleware.js";
import {
  listarClientes,
  buscarCliente,
  criarCliente,
  atualizarCliente,
  deletarCliente,
} from "../controllers/clientes.controller.js";

const router = express.Router();

// Todas as rotas de clientes são exclusivas para admin_efficience —
// operações de gestão do painel interno da Efficience
router.get("/", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), listarClientes);
router.get("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), buscarCliente);
router.post("/", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), criarCliente);
router.patch("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), atualizarCliente);
router.delete("/:id", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), deletarCliente);

console.log("[clientes.routes] Rotas de clientes registradas");

export default router;
