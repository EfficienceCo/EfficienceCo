import express from 'express';
import { processarWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// express.raw() aqui — body precisa chegar como Buffer para verificação da assinatura Stripe
router.post('/stripe', express.raw({ type: 'application/json' }), processarWebhook);

console.log('[webhook.routes] Rotas de webhook registradas');

export default router;
