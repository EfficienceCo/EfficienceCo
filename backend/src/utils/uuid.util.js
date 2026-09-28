/**
 * Formato que o tipo uuid do Postgres aceita (8-4-4-4-12 em hex),
 * qualquer versão e variante. Qualquer outra string vira 22P02, e o
 * handler genérico responde 500.
 *
 * ehUuidV4 é mais estreito de propósito: nibble de versão 4 e variante
 * [89ab]. Serve ao execucao_token gerado com randomUUID() em
 * processos.controller.js. Não use o v4 para ids genéricos de coluna.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === "string" && UUID_RE.test(valor);
}

export function ehUuidV4(valor) {
  return typeof valor === "string" && UUID_V4_RE.test(valor);
}
