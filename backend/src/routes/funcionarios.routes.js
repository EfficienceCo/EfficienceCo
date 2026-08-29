import express from "express";
import {
  criarFuncionario,
  listarFuncionarios,
  obterFuncionario,
  editarFuncionario,
  desligarFuncionario,
} from "../controllers/funcionarios.controller.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";

const router = express.Router();

// Todos os endpoints requerem autenticação (middleware resolverClienteId)
router.post("/", resolverClienteId, criarFuncionario);
router.get("/", resolverClienteId, listarFuncionarios);
router.get("/:id", resolverClienteId, obterFuncionario);
router.patch("/:id", resolverClienteId, editarFuncionario);
router.patch("/:id/desligar", resolverClienteId, desligarFuncionario);

export default router;
