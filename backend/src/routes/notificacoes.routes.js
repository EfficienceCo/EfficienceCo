import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { listarNotificacoes, marcarComoLida } from "../controllers/notificacoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

router.get("/", todos, listarNotificacoes);
router.patch("/:id/lida", todos, marcarComoLida);

console.log("[notificacoes.routes] Rotas de notificações registradas");

export default router;
