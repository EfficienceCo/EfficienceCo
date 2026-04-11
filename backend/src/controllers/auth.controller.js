const jwt = require('jsonwebtoken');
const { validarCredenciais } = require('../services/auth.service');

function login(req, res) {
  const { email, senha } = req.body;

  const usuario = validarCredenciais(email, senha);

  if (!usuario) {
    return res.status(401).json({ erro: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: usuario.id, email: usuario.email, perfil: usuario.perfil },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({ token });
}

module.exports = { login };
