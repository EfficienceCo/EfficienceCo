import express from "express";
import {
  criarCertificado,
  listarCertificados,
  obterCertificado,
  editarCertificado,
  iniciarRenovacaoCertificado,
  atualizarRenovacaoCertificado,
} from "../controllers/certificados.controller.js";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import { PERFIS } from "../config/perfis.js";

const router = express.Router();

const todos = exigirPerfil(
  PERFIS.ADMIN_EFFICIENCE,
  PERFIS.ADMIN_CLIENTE,
  PERFIS.FUNCIONARIO,
);
const admins = exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE);

router.post("/", admins, criarCertificado);
router.get("/", todos, listarCertificados);
router.get("/:id", todos, obterCertificado);
router.patch("/:id/renovacao", admins, atualizarRenovacaoCertificado);
router.patch("/:id", admins, editarCertificado);
router.post("/:id/iniciar-renovacao", admins, iniciarRenovacaoCertificado);

export default router;
