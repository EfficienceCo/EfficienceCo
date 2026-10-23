/**
 * Funções comuns do backend (UTIL-1 / #657). Antes eram redeclaradas em vários
 * arquivos e divergiam quando só uma cópia era corrigida. Se for usar em mais de
 * um lugar, é aqui que mora — não redeclare.
 */

/** Remove tudo que não for dígito (CPF, CNPJ, CEP, telefone). */
export function soDigitos(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\D+/g, "");
}

/**
 * Arredonda para 2 casas. Math.round(x * 100) / 100 sozinho erra a meia-unidade
 * exata: o produto x * 100 "cai para baixo" por erro de representação binária
 * (ex.: 1621 * 0,075 chega como 121.57499999999999 e arredondaria para 121,57 em
 * vez de 121,58 — que é o valor que INSS/RFB e o lote de reconciliação do #437
 * esperam). O nudge de 1 epsilon relativo, afastando de zero, corrige a fronteira
 * .xx5 sem mexer em nenhum outro valor.
 */
export function arredondar(valor) {
  const cents = valor * 100;
  return Math.round(cents + Math.sign(cents) * Number.EPSILON * Math.abs(cents)) / 100;
}

/** Campos de `campos` ausentes, nulos ou vazios no `body`. */
export function camposFaltando(body, campos) {
  return campos.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

/** Sanitiza um segmento de nome de arquivo: sem acento, minúsculo, só [a-z0-9_.-]. */
export function sanitizarNomeArquivo(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
}

/** Texto da primeira `<tag>…</tag>` do XML (aceita atributos), ou null se não houver. */
export function extrairTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(re);
  return match ? match[1].trim() : null;
}

export function chaveMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Inteiro (número ou string só de dígitos); `null` para qualquer outra coisa. */
export function inteiroEstrito(valor) {
  if (typeof valor === "string" && !/^\d+$/.test(valor.trim())) return null;
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

/** Número finito >= 0 (número ou string decimal com ponto); `null` para o resto. */
export function numeroNaoNegativo(valor) {
  if (typeof valor === "string") {
    const normalizado = valor.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizado)) return null;
    valor = normalizado;
  } else if (typeof valor !== "number") {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** Normalização e validação de CPF (dígitos verificadores). */
export function normalizarCpf(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return String(Math.trunc(valor)).replace(/\D/g, "");
  }
  if (typeof valor === "string") {
    return valor.replace(/\D/g, "");
  }
  return "";
}

export function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calcularDigito = (quantidade) => {
    const soma = cpf
      .slice(0, quantidade)
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}
