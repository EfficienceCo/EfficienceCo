/**
 * Último middleware da API. Sem ele, o Express devolve a página HTML de erro
 * (com stack e caminho absoluto em dev; HTML sem stack em produção).
 * body-parser chama next(err) em JSON inválido — mesmo furo em qualquer rota.
 */

function statusHttp(err) {
  const bruto = Number(err.status ?? err.statusCode);
  if (Number.isInteger(bruto) && bruto >= 400 && bruto <= 599) return bruto;
  return 500;
}

function jsonMalformado(err, status) {
  return err.type === "entity.parse.failed" || (err instanceof SyntaxError && status === 400);
}

export function tratarErro(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = statusHttp(err);
  const malformado = jsonMalformado(err, status);

  if (!malformado && status >= 500) {
    console.error("[erro.middleware] Erro não tratado:", err.message);
  }

  const erro = malformado
    ? "JSON malformado"
    : status >= 500
      ? "Erro interno"
      : "Requisição inválida";

  res.status(malformado ? 400 : status).json({ erro });
}
