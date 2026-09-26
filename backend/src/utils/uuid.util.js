const UUID_CANONICO_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidValido(valor) {
  return typeof valor === "string" && UUID_CANONICO_REGEX.test(valor);
}
