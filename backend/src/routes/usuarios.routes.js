// Rotas de usuarios
// Todas as rotas aqui sao protegidas pelo middleware de autenticacao

const express = require('express');
const router = express.Router();
const { autenticar } = require('../middlewares/auth.middleware');

// GET /usuarios — lista usuarios (protegida, exige token valido)
router.get('/', autenticar, (req, res) => {
  console.log('[usuarios.routes] Listando usuarios — requisicao feita por usuario:', req.usuario.id);
  res.json({ message: 'listar usuários — a implementar' });
});

console.log('[usuarios.routes] Rotas de usuarios registradas');

module.exports = router;
