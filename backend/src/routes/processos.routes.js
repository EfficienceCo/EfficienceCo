import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  listarProcessos,
  criarProcesso,
  concluirEtapaJwt,
  concluirEtapaLicenca,
  executarAcaoEtapaJwt,
  listarEtapasProntasAgente,
  concluirExecucaoEtapaAgente,
} from "../controllers/processos.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.get("/", todos, listarProcessos);
router.post("/", admins, criarProcesso);
router.patch("/:id/etapas/:etapaId", todos, concluirEtapaJwt);
router.post("/:id/etapas/:etapaId/concluir", concluirEtapaLicenca);
router.post("/:id/etapas/:etapaId/executar-acao", todos, executarAcaoEtapaJwt);

// Rotas do agente — autenticadas via x-licenca-token (polling)
router.get("/etapas/agente", listarEtapasProntasAgente);
router.post("/etapas/:etapaId/concluir-execucao", concluirExecucaoEtapaAgente);

console.log("[processos.routes] Rotas de processos registradas");

export default router;
