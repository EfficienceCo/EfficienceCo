// Rotas de autenticacao
// POST /auth/login — recebe email e senha, retorna token JWT

const express = require('express');
const router = express.Router();
const { login } = require('../controllers/auth.controller');

// Rota publica — nao precisa de token
router.post('/login', login);

console.log('[auth.routes] Rotas de autenticacao registradas');

module.exports = router;
