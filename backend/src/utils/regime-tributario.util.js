// Regime tributário do cliente: vocabulário e validação dos campos que a
// apuração do Simples consome (#496). A validação vive aqui, e não no
// controller, porque os mesmos dados são escritos por clientes.controller.js e
// relidos por apuracoes.controller.js — se as duas pontas divergirem, a tela
// grava um histórico que a apuração depois recusa com HISTORICO_RECEITA_INVALIDO.

import { hojeNoBrasil } from "./periodo.util.js";

export const REGIMES_TRIBUTARIOS = ["simples_nacional", "lucro_presumido", "lucro_real"];

export const ANEXOS_SIMPLES = ["I", "II", "III", "IV", "V"];

// Primeiro ano com tabela do Simples suportada — mesmo piso que a leitura da
// apuração aplica ao histórico manual.
const ANO_MINIMO = 2020;

function inteiroEstrito(valor) {
  if (typeof valor === "string" && !/^\d+$/.test(valor.trim())) return null;
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function numeroNaoNegativo(valor) {
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

/**
 * Valida a data de início de atividade do cliente (BUG-APUR-08).
 *
 * `null`/`""`/`undefined` limpam o campo. Caso contrário exige `AAAA-MM-DD`
 * de calendário válido, ano >= 2000 e não futura. A string é mantida como veio
 * (sem passar por `Date`) para não deslocar um dia por fuso.
 *
 * @returns {{ valor: string|null } | { erro: string }}
 */
export function validarDataInicioAtividade(valor, hoje = hojeNoBrasil()) {
  if (valor == null || (typeof valor === "string" && valor.trim() === "")) return { valor: null };
  if (typeof valor !== "string") return { erro: "data_inicio_atividade inválida" };

  const texto = valor.trim();
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!correspondencia) return { erro: "data_inicio_atividade inválida" };

  const [ano, mes, dia] = [correspondencia[1], correspondencia[2], correspondencia[3]].map(Number);
  const calendario = new Date(Date.UTC(ano, mes - 1, dia));
  const dataReal = calendario.getUTCFullYear() === ano
    && calendario.getUTCMonth() === mes - 1
    && calendario.getUTCDate() === dia;

  if (!dataReal || ano < 2000 || texto > hoje) return { erro: "data_inicio_atividade inválida" };

  return { valor: texto };
}

export function chaveMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * Valida e normaliza o histórico de receita informado manualmente pelo contador.
 *
 * Aceita `null`/`undefined` como "sem histórico" e devolve `[]` — é o mesmo
 * significado que a apuração dá à ausência do campo.
 *
 * @returns {{ entradas: Array<{mes:number, ano:number, receita:number}> } | { erro: string }}
 */
export function validarHistoricoReceita(historico) {
  if (historico == null) return { entradas: [] };
  if (!Array.isArray(historico)) return { erro: "HISTORICO_RECEITA_INVALIDO" };

  const entradas = [];
  const vistos = new Set();

  for (const entrada of historico) {
    const mes = inteiroEstrito(entrada?.mes);
    const ano = inteiroEstrito(entrada?.ano);
    const receita = numeroNaoNegativo(entrada?.receita);

    if (mes === null || mes < 1 || mes > 12 || ano === null || ano < ANO_MINIMO || receita === null) {
      return { erro: "HISTORICO_RECEITA_INVALIDO" };
    }

    const referencia = chaveMes(ano, mes);
    // Dois valores para a mesma competência tornariam a RBT12 ambígua.
    if (vistos.has(referencia)) return { erro: "HISTORICO_RECEITA_INVALIDO" };
    vistos.add(referencia);

    entradas.push({ mes, ano, receita });
  }

  return { entradas };
}
