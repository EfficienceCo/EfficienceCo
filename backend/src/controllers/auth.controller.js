import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { findUserByEmail } from '../services/auth.service.js';

export async function login(req, res) {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios' });
  }

  const usuario = await findUserByEmail(email);

  if (!usuario) {
    return res.status(401).json({ message: 'Credenciais inválidas' });
  }

  const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

  if (!senhaCorreta) {
    return res.status(401).json({ message: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.status(200).json({ token });
}
