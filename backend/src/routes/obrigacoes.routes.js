import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  listarObrigacoes,
  criarObrigacao,
  atualizarObrigacao,
  deletarObrigacao,
  proximasObrigacoes,
} from "../controllers/obrigacoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
const admins = exigirPerfil("admin_efficience", "admin_cliente");

// /proximas deve vir antes de /:id para não ser capturado como parâmetro
router.get("/proximas", todos, proximasObrigacoes);
router.get("/", todos, listarObrigacoes);
router.post("/", admins, criarObrigacao);
router.patch("/:id", admins, atualizarObrigacao);
router.delete("/:id", admins, deletarObrigacao);

console.log("[obrigacoes.routes] Rotas de obrigações registradas");

export default router;
