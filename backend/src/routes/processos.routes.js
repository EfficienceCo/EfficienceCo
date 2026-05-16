import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  listarProcessos,
  criarProcesso,
  concluirEtapaJwt,
  concluirEtapaLicenca,
} from "../controllers/processos.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.get("/", todos, listarProcessos);
router.post("/", admins, criarProcesso);
router.patch("/:id/etapas/:etapaId", todos, concluirEtapaJwt);
router.post("/:id/etapas/:etapaId/concluir", concluirEtapaLicenca);

console.log("[processos.routes] Rotas de processos registradas");

export default router;
