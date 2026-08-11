import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  criarLancamentoFiscal,
  listarLancamentosFiscais,
  resumoLancamentosFiscais,
} from "../controllers/lancamentos-fiscais.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

// Agente — autenticado via x-licenca-token no controller
router.post("/", criarLancamentoFiscal);

router.get("/resumo", todos, resumoLancamentosFiscais);
router.get("/", todos, listarLancamentosFiscais);

console.log("[lancamentos-fiscais.routes] Rotas de lançamentos fiscais registradas");

export default router;
