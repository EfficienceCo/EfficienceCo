// Rotas de autenticacao
// POST /auth/login — recebe email e senha, retorna token JWT

import express from "express";
import { login } from "../controllers/auth.controller.js";

const router = express.Router();

// Rota publica — nao precisa de token
router.post("/login", login);

console.log("[auth.routes] Rotas de autenticacao registradas");

export default router;
