import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  buscarRegras,
  listarRegras,
  criarRegra,
  atualizarRegra,
  deletarRegra,
} from "../controllers/regras.controller.js";

const router = express.Router();

const admins = exigirPerfil("admin_efficience", "admin_cliente");

// Rotas admin — autenticadas via JWT
router.get("/", admins, listarRegras);
router.post("/", admins, criarRegra);
router.patch("/:id", admins, atualizarRegra);
router.delete("/:id", admins, deletarRegra);

// Rota do agente — autenticada via x-licenca-token (mantida para compatibilidade)
router.get("/:clienteId", buscarRegras);

console.log("[regras.routes] Rotas de regras registradas");

export default router;
