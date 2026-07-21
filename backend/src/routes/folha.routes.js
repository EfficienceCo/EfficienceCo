import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { exigirLicencaAtiva } from "../middlewares/licenca.middleware.js";
import { baixarTemplate } from "../controllers/folha.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

router.get("/template", todos, exigirLicencaAtiva, baixarTemplate);

console.log("[folha.routes] Rotas de folha registradas");

export default router;
