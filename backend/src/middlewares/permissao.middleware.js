import { autenticar } from "./auth.middleware.js";
import { PERFIS } from "../config/perfis.js";

export { PERFIS };

export function resolverClienteId(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.body.cliente_id || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

// Retorna um array [autenticar, checker] que pode ser usado diretamente nas rotas.
// Ao passar exigirPerfil(...) numa rota, o autenticar já vem embutido —
// não é necessário declará-lo separadamente.
//
// Uso: router.get('/', exigirPerfil(PERFIS.ADMIN_EFFICIENCE), handler)
//      router.get('/', exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE), handler)
export function exigirPerfil(...perfis) {
  return [
    autenticar,
    (req, res, next) => {
      console.log(
        `[permissao.middleware] Perfil requerido: [${perfis.join(", ")}] | Perfil do token: ${req.usuario?.perfil}`,
      );

      if (!perfis.includes(req.usuario.perfil)) {
        console.log(
          `[permissao.middleware] Acesso negado — perfil '${req.usuario.perfil}' não autorizado`,
        );
        return res
          .status(403)
          .json({ erro: "Acesso negado: perfil sem permissão" });
      }

      return next();
    },
  ];
}
