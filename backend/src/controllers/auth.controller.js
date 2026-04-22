// Controller de autenticacao
// Recebe a requisicao de login, valida credenciais e gera o token JWT

import jwt from 'jsonwebtoken';
import { validarCredenciais } from '../services/auth.service.js';

// POST /auth/login
// Espera receber { email, senha } no body
// Retorna { token } se valido, ou { erro } se invalido
export function login(req, res) {
  console.log('[auth.controller] Requisicao de login recebida');

  const { email, senha } = req.body;
  console.log('[auth.controller] Email recebido:', email);

  // Valida as credenciais contra o service
  const usuario = validarCredenciais(email, senha);

  if (!usuario) {
    console.log('[auth.controller] Login falhou — credenciais invalidas');
    return res.status(401).json({ erro: 'Credenciais inválidas' });
  }

  // Gera o token JWT com os dados do usuario
  // Payload: id, email e perfil — dados que serao recuperados pelo middleware
  // Expira em 8 horas
  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, perfil: usuario.perfil },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  console.log('[auth.controller] Login bem-sucedido — token gerado para usuario:', usuario.id);
  return res.json({ token });
}
