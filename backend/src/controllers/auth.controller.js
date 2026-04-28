import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { findUserByEmail } from "../services/auth.service.js";

export async function login(req, res) {
  const { email, senha } = req.body;

  console.log(`[auth.controller] Tentativa de login para: ${email}`);

  if (!email || !senha) {
    console.log("[auth.controller] Login rejeitado — email ou senha ausentes");
    return res.status(400).json({ message: "Email e senha são obrigatórios" });
  }

  try {
    const usuario = await findUserByEmail(email);

    if (!usuario) {
      console.log(`[auth.controller] Usuário não encontrado: ${email}`);
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaCorreta) {
      console.log(`[auth.controller] Senha incorreta para: ${email}`);
      return res.status(401).json({ message: "Credenciais inválidas" });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.perfil,
        cliente_id: usuario.cliente_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    console.log(
      `[auth.controller] Login bem-sucedido — usuário: ${usuario.id} | perfil: ${usuario.perfil}`,
    );
    return res.status(200).json({ token });
  } catch (err) {
    console.error("[auth.controller] Erro interno no login:", err.message);
    return res.status(500).json({ message: "Erro interno no servidor" });
  }
}
