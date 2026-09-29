import { ehUuid } from "../utils/uuid.util.js";

export function validarUuidParams(...nomes) {
  return function validarUuidDaRota(req, res, next) {
    const nomeInvalido = nomes.find((nome) => !ehUuid(req.params?.[nome]));

    if (nomeInvalido) {
      return res.status(400).json({ erro: `${nomeInvalido} deve ser um UUID válido` });
    }

    return next();
  };
}
