import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  dispararApuracao,
  listarApuracoes,
  detalharApuracao,
  editarApuracao,
  aprovarApuracao,
} from "../controllers/apuracoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
// Disparar cálculo, editar valor e aprovar são ações que geram/alteram uma guia
// de imposto — mesmo padrão de obrigacoes.routes.js (admins), não abertas a funcionario.
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.post("/", admins, dispararApuracao);
router.get("/", todos, listarApuracoes);
router.get("/:id", todos, detalharApuracao);
router.patch("/:id", admins, editarApuracao);
router.patch("/:id/aprovar", admins, aprovarApuracao);

console.log("[apuracoes.routes] Rotas de apurações registradas");

export default router;
