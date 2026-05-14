import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  listarUsuarios,
  criarUsuario,
  editarUsuario,
  deletarUsuario,
} from "../controllers/usuarios.controller.js";

const router = express.Router();

const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.get("/", admins, listarUsuarios);
router.post("/", admins, criarUsuario);
router.patch("/:id", admins, editarUsuario);
router.delete("/:id", admins, deletarUsuario);

console.log("[usuarios.routes] Rotas de usuarios registradas");

export default router;
