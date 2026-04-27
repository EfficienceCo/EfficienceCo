import { autenticar } from './auth.middleware.js';

export function exigirPerfil(...perfis) {
  return [
    autenticar,
    (req, res, next) => {
      console.log(
        `[permissao.middleware] Perfil requerido: [${perfis.join(', ')}] | Perfil do token: ${req.usuario?.perfil}`
      );

      if (!perfis.includes(req.usuario.perfil)) {
        return res.status(403).json({ erro: 'Acesso negado: perfil sem permissão' });
      }

      return next();
    },
  ];
}
