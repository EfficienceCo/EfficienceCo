import express from "express";
import { processarWebhook } from "../controllers/webhook.controller.js";

const router = express.Router();

// express.raw() mantém o body como Buffer — obrigatório para que o Stripe
// consiga verificar a assinatura do webhook via stripe.webhooks.constructEvent().
// Se o body fosse parseado como JSON antes, a verificação falharia sempre.
// Esta rota é montada no app.js ANTES do express.json() global por esse motivo.
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  processarWebhook,
);

console.log("[webhook.routes] Rotas de webhook registradas");

export default router;
