// Middleware de autenticacao
// Protege rotas — verifica se a requisicao tem um token JWT valido
// Se valido, anexa os dados do usuario em req.usuario e segue
// Se invalido ou ausente, retorna 401

import jwt from "jsonwebtoken";

export function autenticar(req, res, next) {
  console.log(
    "[auth.middleware] Verificando autenticacao para:",
    req.method,
    req.originalUrl,
  );

  // Busca o header Authorization (formato esperado: "Bearer <token>")
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[auth.middleware] Token nao fornecido ou formato invalido");
    return res.status(401).json({ erro: "Token não fornecido" });
  }

  // Extrai somente o token, removendo o prefixo "Bearer "
  const token = authHeader.split(" ")[1];

  try {
    // Verifica se o token e valido e nao expirou
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(
      "[auth.middleware] Token valido — usuario:",
      decoded.id,
      "| perfil:",
      decoded.perfil,
    );

    // Anexa os dados decodificados do token em req.usuario
    // para que as rotas seguintes saibam quem esta acessando
    req.usuario = decoded;
    return next();
  } catch (err) {
    console.log("[auth.middleware] Token invalido ou expirado:", err.message);
    return res.status(401).json({ erro: "Token inválido" });
  }
}
