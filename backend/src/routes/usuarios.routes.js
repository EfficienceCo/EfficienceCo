// Rotas de usuarios
// Todas as rotas aqui sao protegidas pelo middleware de autenticacao

import express from 'express';
import { autenticar } from '../middlewares/auth.middleware.js';

const router = express.Router();

// GET /usuarios — lista usuarios (protegida, exige token valido)
router.get('/', autenticar, (req, res) => {
  console.log('[usuarios.routes] Listando usuarios — requisicao feita por usuario:', req.usuario.id);
  res.json({ message: 'listar usuários — a implementar ' });
});

console.log('[usuarios.routes] Rotas de usuarios registradas');

export default router;
