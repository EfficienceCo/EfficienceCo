import express from "express";
import { exigirPerfil } from "../middlewares/permissao.middleware.js";
import {
  dispararApuracao,
  listarApuracoes,
  detalharApuracao,
  editarApuracao,
  aprovarApuracao,
  recalcularApuracao,
  excluirApuracao,
  listarFolhaPendente,
  registrarResultadoFolha,
} from "../controllers/apuracoes.controller.js";

const router = express.Router();

const todos = exigirPerfil("admin_efficience", "admin_cliente", "funcionario");
// Disparar cálculo, editar valor e aprovar são ações que geram/alteram uma guia
// de imposto — mesmo padrão de obrigacoes.routes.js (admins), não abertas a funcionario.
const admins = exigirPerfil("admin_efficience", "admin_cliente");

router.post("/", admins, dispararApuracao);
router.get("/", todos, listarApuracoes);

// Rotas do agente — autenticadas via x-licenca-token (polling Fator R / AP-3,
// #365), mesmo padrão de processos.routes.js (#273). Registradas antes de
// "/:id" para não colidir com o parâmetro de rota.
router.get("/folha-pendente", listarFolhaPendente);
router.post("/:id/resultado-folha", registrarResultadoFolha);

router.get("/:id", todos, detalharApuracao);
router.patch("/:id", admins, editarApuracao);
router.patch("/:id/aprovar", admins, aprovarApuracao);
// Fecha o loop do #365: reaplica o cálculo com os dados de folha atualizados
// (após o agente confirmar e o contador subir a planilha correta).
router.patch("/:id/recalcular", admins, recalcularApuracao);
// Desfaz um rascunho (#500) — mesma faixa de perfis das demais mutações da
// apuração; aprovada nunca some (409 no controller).
router.delete("/:id", admins, excluirApuracao);

console.log("[apuracoes.routes] Rotas de apurações registradas");

export default router;
