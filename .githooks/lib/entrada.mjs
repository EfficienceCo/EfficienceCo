import fs from "node:fs";

// stdin vazio (EOF) e entrada valida; qualquer outro erro de leitura cancela o push em vez de liberar sem testes.
export function lerEntrada(ler = () => fs.readFileSync(0, "utf8")) {
  try {
    return ler();
  } catch (erro) {
    if (erro.code === "EOF") return "";
    throw erro;
  }
}
