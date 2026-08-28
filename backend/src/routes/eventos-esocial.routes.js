import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  criarRascunho,
  listarEventos,
  detalharEvento,
  aprovarEvento,
  baixarXml,
} from "../controllers/eventos-esocial.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
// Criar e aprovar evento do eSocial geram/liberam uma obrigação legal —
// mesmo padrão de apuracoes.routes.js: admins, não abertas a 'funcionario'.
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.post("/", admins, criarRascunho);
router.get("/", todos, listarEventos);
router.get("/:id", todos, detalharEvento);
router.get("/:id/xml", todos, baixarXml);
router.patch("/:id/aprovar", admins, aprovarEvento);

console.log("[eventos-esocial.routes] Rotas de eventos do eSocial registradas");

export default router;
