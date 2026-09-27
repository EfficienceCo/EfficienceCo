import { dataIsoValida } from "./data.util.js";
import { cpfValido } from "./cpf.util.js";

// Faixa de negócio do valor fiscal: no máximo 12 dígitos inteiros e 2 casas
// (o antigo numeric(14,2)). A coluna original arredondava o excesso antes de
// qualquer CHECK (10.999 virava 11.00). A migration 96 guarda numeric sem
// essa escala forçada e a CHECK exige scale <= 2; a API recusa antes para
// a resposta nomear o campo. #568

const RE_MONETARIO = /^\d+(\.\d+)?$/;
const MAX_INTEIROS = 12;

const CAMPOS_MONETARIOS_OPCIONAIS = ["icms", "pis", "cofins", "ipi"];

// Códigos do Postgres que são dado de entrada recusado, não falha do servidor.
// 23505 (unique) fica no controller, porque vira 409 de duplicata.
const REJEICAO_BANCO = {
  "22001": "um campo excede o tamanho aceito",
  "22003": "um valor está fora da faixa numérica",
  "22007": "data_emissao inválida",
  "22008": "data_emissao inválida",
  "22P02": "um campo tem formato inválido",
  "23514": "um campo viola a regra de integridade",
};

// Quando o CHECK nomeia a constraint, o 422 usa a mesma chave de `campos`
// que a validação da API. Sem isso o chamador só via um `detalhe` genérico.
const CAMPOS_POR_CONSTRAINT = {
  lancamentos_fiscais_chave_nfe_digitos_check: {
    chave_nfe: "chave_nfe deve ter exatamente 44 dígitos",
  },
  lancamentos_fiscais_cnpj_emitente_digitos_check: {
    cnpj_emitente: "cnpj_emitente deve ter exatamente 14 dígitos",
  },
  lancamentos_fiscais_documento_destinatario_check: {
    cnpj_destinatario: "cnpj_destinatario deve ter 14 dígitos (CNPJ) ou 11 dígitos (CPF válido)",
  },
  lancamentos_fiscais_arquivo_xml_relativo_check: {
    arquivo_xml: "arquivo_xml deve ser um caminho relativo",
  },
  lancamentos_fiscais_valores_faixa_check: {
    valor_total: "um valor está fora da faixa numérica",
  },
};

export function camposRejeicaoBanco(error) {
  const detalhe = REJEICAO_BANCO[error?.code];
  if (!detalhe) return null;
  const mensagem = typeof error.message === "string" ? error.message : "";
  for (const [constraint, campos] of Object.entries(CAMPOS_POR_CONSTRAINT)) {
    if (mensagem.includes(constraint)) return campos;
  }
  return { lancamento: detalhe };
}

function mensagemMonetaria(campo, motivo) {
  return `${campo} ${motivo}`;
}

export function analisarMonetario(valor) {
  let texto;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { erro: "deve ser um número" };
    texto = valor.toString();
  } else if (typeof valor === "string") {
    texto = valor.trim();
    if (texto === "") return { erro: "deve ser um número" };
  } else {
    return { erro: "deve ser um número" };
  }

  if (texto.startsWith("-")) return { erro: "não pode ser negativo" };
  if (/e/i.test(texto)) {
    const pequenoDemais = /e-/i.test(texto);
    return {
      erro: pequenoDemais
        ? "deve ter no máximo 2 casas decimais"
        : "fora da faixa de numeric(14,2) (máximo 999999999999.99)",
    };
  }
  if (!RE_MONETARIO.test(texto)) return { erro: "deve ser um número" };

  const [bruto, frac = ""] = texto.split(".");
  if (frac.length > 2) return { erro: "deve ter no máximo 2 casas decimais" };

  const inteiro = bruto.replace(/^0+(?=\d)/, "");
  if (inteiro.length > MAX_INTEIROS) {
    return { erro: "fora da faixa de numeric(14,2) (máximo 999999999999.99)" };
  }

  return { valor: `${inteiro}.${frac.padEnd(2, "0")}` };
}

export function validarArquivoXml(valor) {
  if (valor === undefined || valor === null || valor === "") {
    return { valor: null };
  }
  if (typeof valor !== "string") {
    return { erro: "arquivo_xml deve ser um caminho relativo" };
  }

  const comBarras = valor.trim().split("\\").join("/");
  const absoluto =
    comBarras === "" ||
    /^[A-Za-z]:/.test(comBarras) ||
    comBarras.startsWith("/") ||
    comBarras.split("/").includes("..") ||
    valor.includes("\0");

  if (absoluto) {
    return { erro: "arquivo_xml deve ser um caminho relativo" };
  }

  return { valor: comBarras };
}

function validarChaveNfe(valor) {
  if (typeof valor === "string" && /^\d{44}$/.test(valor)) return null;
  return "chave_nfe deve ter exatamente 44 dígitos";
}

function validarCnpjEmitente(valor) {
  if (typeof valor === "string" && /^\d{14}$/.test(valor)) return null;
  return "cnpj_emitente deve ter exatamente 14 dígitos";
}

function validarDocumentoDestinatario(valor) {
  if (typeof valor === "string" && /^\d{14}$/.test(valor)) return null;
  if (typeof valor === "string" && /^\d{11}$/.test(valor)) {
    return cpfValido(valor) ? null : "cnpj_destinatario não é um CPF válido";
  }
  return "cnpj_destinatario deve ter 14 dígitos (CNPJ) ou 11 dígitos (CPF válido)";
}

function dataEmissaoCanonica(valor) {
  if (typeof valor !== "string" || valor.length < 10) return null;
  const data = valor.slice(0, 10);
  const resto = valor.slice(10);
  if (resto !== "" && !resto.startsWith("T") && !resto.startsWith(" ")) return null;
  if (!dataIsoValida(data)) return null;
  return data;
}

function validarDataEmissao(valor, hojeISO) {
  const data = dataEmissaoCanonica(valor);
  if (!data) {
    return "data_emissao deve ser uma data existente no formato YYYY-MM-DD";
  }
  if (data > hojeISO) return "data_emissao não pode ser futura";
  return null;
}

// Contrato do POST /lancamentos-fiscais. Devolve os campos canônicos só
// quando todos passam — o controller grava `dados`, nunca o body cru.
export function validarLancamentoFiscal(body, hojeISO) {
  const erros = {};
  const dados = {};

  const erroChave = validarChaveNfe(body.chave_nfe);
  if (erroChave) erros.chave_nfe = erroChave;
  else dados.chave_nfe = body.chave_nfe;

  const erroEmitente = validarCnpjEmitente(body.cnpj_emitente);
  if (erroEmitente) erros.cnpj_emitente = erroEmitente;
  else dados.cnpj_emitente = body.cnpj_emitente;

  const erroDestinatario = validarDocumentoDestinatario(body.cnpj_destinatario);
  if (erroDestinatario) erros.cnpj_destinatario = erroDestinatario;
  else dados.cnpj_destinatario = body.cnpj_destinatario;

  const total = analisarMonetario(body.valor_total);
  if (total.erro) erros.valor_total = mensagemMonetaria("valor_total", total.erro);
  else dados.valor_total = total.valor;

  for (const campo of CAMPOS_MONETARIOS_OPCIONAIS) {
    if (body[campo] === undefined || body[campo] === null) {
      dados[campo] = "0.00";
      continue;
    }
    const analisado = analisarMonetario(body[campo]);
    if (analisado.erro) erros[campo] = mensagemMonetaria(campo, analisado.erro);
    else dados[campo] = analisado.valor;
  }

  const erroData = validarDataEmissao(body.data_emissao, hojeISO);
  if (erroData) erros.data_emissao = erroData;
  else dados.data_emissao = dataEmissaoCanonica(body.data_emissao);

  const arquivo = validarArquivoXml(body.arquivo_xml);
  if (arquivo.erro) erros.arquivo_xml = arquivo.erro;
  else dados.arquivo_xml = arquivo.valor;

  return { valido: Object.keys(erros).length === 0, erros, dados };
}
