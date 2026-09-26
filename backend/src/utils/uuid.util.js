/**
 * Formato que o tipo uuid do Postgres aceita (8-4-4-4-12 em hex).
 * Qualquer outra string vira 22P02, e o handler genérico responde 500.
 * Compartilhado com a conciliação (BUG-CONC-07 / #560), que tem o mesmo
 * furo em ids de rota e de body.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === "string" && UUID_RE.test(valor);
}
