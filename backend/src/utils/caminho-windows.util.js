/**
 * Caminho absoluto Windows: unidade + separador (`C:\x`, `C:/x`) ou UNC (`\\srv\share`).
 * Sem caracteres inválidos de nome de arquivo (`< > " | ? *`) nem `:` fora da unidade.
 * Alinhar ao FE (frontend/src/app/dashboard/regras/page.jsx) e regras.controller.
 */
const CAMINHO_WINDOWS_ABSOLUTO =
  /^(?:[A-Za-z]:[\\/]|\\\\[^\\/:*?"<>|]+[\\/][^\\/:*?"<>|]+)[^:*?"<>|]*$/;

export function caminhoWindowsAbsolutoValido(caminho) {
  return CAMINHO_WINDOWS_ABSOLUTO.test(String(caminho).trim());
}
