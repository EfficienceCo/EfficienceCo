import express from 'express';
import { registrarEvento } from '../controllers/eventos.controller.js';

const router = express.Router();

router.post('/', registrarEvento);

console.log('[eventos.routes] Rotas de eventos registradas');

export default router;
