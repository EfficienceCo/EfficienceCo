import { autenticar } from "./auth.middleware.js";

// Retorna um array [autenticar, checker] que pode ser usado diretamente nas rotas.
// Ao passar exigirPerfil(...) numa rota, o autenticar já vem embutido —
// não é necessário declará-lo separadamente.
//
// Uso: router.get('/', exigirPerfil('admin_efficience'), handler)
//      router.get('/', exigirPerfil('admin_efficience', 'admin_cliente'), handler)
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
