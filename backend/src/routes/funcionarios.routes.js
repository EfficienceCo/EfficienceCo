import express from "express";
import {
  criarFuncionario,
  listarFuncionarios,
  obterFuncionario,
  editarFuncionario,
  desligarFuncionario,
} from "../controllers/funcionarios.controller.js";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { PERFIS } from "../config/perfis.js";

const router = express.Router();

// Todos os endpoints exigem autenticação. Só administradores podem alterar
// vínculos; funcionários autenticados podem consultar os dados do próprio cliente.
const todos = exigirPerfil(
  PERFIS.ADMIN_EFFICIENCE,
  PERFIS.ADMIN_CLIENTE,
  PERFIS.FUNCIONARIO,
);
const admins = exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE);

router.post("/", admins, criarFuncionario);
router.get("/", todos, listarFuncionarios);
router.get("/:id", todos, obterFuncionario);
router.patch("/:id/desligar", admins, desligarFuncionario);
router.patch("/:id", admins, editarFuncionario);

export default router;
