import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  criarLancamentoContabil,
  listarLancamentosContabeis,
  atualizarLancamentoContabil,
  deletarLancamentoContabil,
} from "../controllers/lancamentos-contabeis.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");

router.post("/", todos, criarLancamentoContabil);
router.get("/", todos, listarLancamentosContabeis);
router.patch("/:id", todos, atualizarLancamentoContabil);
router.delete("/:id", todos, deletarLancamentoContabil);

console.log("[lancamentos-contabeis.routes] Rotas de lançamentos contábeis registradas");

export default router;
