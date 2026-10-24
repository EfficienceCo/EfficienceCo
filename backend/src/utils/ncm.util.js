import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arquivo = join(dirname(fileURLToPath(import.meta.url)), "../data/ncm-tipi.json");
const catalogo = JSON.parse(readFileSync(arquivo, "utf8"));
const CODIGOS = new Set(catalogo.codigos);

export function ncmExiste(codigo) {
  return typeof codigo === "string" && /^\d{8}$/.test(codigo) && CODIGOS.has(codigo);
}

export function metaCatalogoNcm() {
  return {
    fonte: catalogo.fonte,
    snapshot: catalogo.snapshot,
    atualizacao_ncm: catalogo.atualizacao_ncm,
    quantidade: CODIGOS.size,
  };
}
