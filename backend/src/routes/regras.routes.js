import express from "express";
import { exigirPerfil, PERFIS } from "../middlewares/permissao.middleware.js";
import {
  buscarRegras,
  buscarVersaoRegras,
  listarRegras,
  criarRegra,
  atualizarRegra,
  deletarRegra,
} from "../controllers/regras.controller.js";

const router = express.Router();

const admins = exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE);

// Rotas admin — autenticadas via JWT
router.get("/", admins, listarRegras);
router.post("/", admins, criarRegra);
router.patch("/:id", admins, atualizarRegra);
router.delete("/:id", admins, deletarRegra);

// Rotas do agente — autenticadas via x-licenca-token
router.get("/:clienteId/versao", buscarVersaoRegras);
router.get("/:clienteId", buscarRegras);

console.log("[regras.routes] Rotas de regras registradas");

export default router;
