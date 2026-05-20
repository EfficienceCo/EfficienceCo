import express from "express";
import { exigirPerfil, PERFIS } from "../middlewares/permissao.middleware.js";
import { registrarEvento, listarEventos, listarEventosAgente } from "../controllers/eventos.controller.js";

const router = express.Router();

const admins = exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE);

// Rota do frontend — autenticada via JWT
router.get("/", admins, listarEventos);

// Rotas do agente — autenticadas via x-licenca-token
router.get("/agente", listarEventosAgente);
router.post("/", registrarEvento);

console.log("[eventos.routes] Rotas de eventos registradas");

export default router;
