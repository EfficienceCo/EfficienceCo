import express from "express";
import { exigirPerfil, PERFIS } from "../middlewares/permissao.middleware.js";
import { buscarEficiencia } from "../controllers/eficiencia.controller.js";

const router = express.Router();

const todos = exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE, PERFIS.FUNCIONARIO);

router.get("/", todos, buscarEficiencia);

console.log("[eficiencia.routes] Rotas de eficiência registradas");

export default router;
