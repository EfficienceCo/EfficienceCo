import express from 'express';
import { buscarRegras } from '../controllers/regras.controller.js';

const router = express.Router();

router.get('/:clienteId', buscarRegras);

console.log('[regras.routes] Rotas de regras registradas');

export default router;
