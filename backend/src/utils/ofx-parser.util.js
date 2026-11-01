// Parser de extrato OFX (SGML solto, padrão usado por bancos brasileiros —
// tags sem fechamento, ex.: <DTPOSTED>20240105 em vez de XML bem-formado).
// Extração por regex em vez de lib externa: mais tolerante a essas variações
// e evita depender de um parser XML estrito que rejeitaria o arquivo.

import { dataIsoValida } from "./data.util.js";

export class OfxParseError extends Error {}

// transacoes_extrato.valor é NUMERIC(15,2) (migration 67): 13 dígitos inteiros.
// O mesmo teto de lancamentos-contabeis. Acima disso o INSERT estoura e o
// upload virava 500 genérico.
const VALOR_MAXIMO = 9999999999999.99;

// OFX de bancos brasileiros normalmente declara CHARSET:1252 (Windows-1252) ou
// nem declara — nunca UTF-8. Decodificar como UTF-8 direto corrompe silenciosamente
// acentos em MEMO/NAME. O cabeçalho em si é sempre ASCII-safe, então lemos os
// primeiros bytes como latin1 (sem risco) só pra sniffar o charset declarado.
export function decodificarOfx(buffer) {
  const cabecalho = buffer.toString("latin1", 0, Math.min(buffer.length, 512));
  const match = cabecalho.match(/CHARSET:\s*([\w-]+)/i);
  const charset = match ? match[1].toUpperCase() : null;

  if (charset === "UTF-8" || charset === "UTF8") {
    return buffer.toString("utf-8");
  }
  // 1252 / 8859-1 / ausente: latin1 é o superset seguro pra acentuação em pt-BR.
  return buffer.toString("latin1");
}

function extrairCampoOfx(bloco, tag) {
  const match = bloco.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
  return match ? match[1].trim() : null;
}

function contextoTransacao(indice, fitid) {
  const linha = `na transação #${indice + 1}`;
  return fitid ? `${linha} (FITID ${fitid})` : linha;
}

function parseData(dtposted, contexto) {
  const digitos = (dtposted || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!digitos) {
    throw new OfxParseError(`DTPOSTED inválido ou ausente ${contexto}: "${dtposted ?? ""}"`);
  }
  const [, ano, mes, dia] = digitos;
  const iso = `${ano}-${mes}-${dia}`;
  if (!dataIsoValida(iso)) {
    throw new OfxParseError(`DTPOSTED inexistente no calendário ${contexto}: "${dtposted}"`);
  }
  return iso;
}

function parseValor(trnamt, contexto) {
  if (trnamt === null || trnamt === undefined || trnamt === "") {
    throw new OfxParseError(`TRNAMT ausente ${contexto}`);
  }
  const valor = Number(trnamt.replace(",", "."));
  if (!Number.isFinite(valor)) {
    throw new OfxParseError(`TRNAMT inválido ${contexto}: "${trnamt}"`);
  }
  // A coluna guarda o absoluto. Compara em centavos, como o lançamento contábil:
  // 1e15 * 100 não cabe em inteiro seguro e também estoura o NUMERIC(15,2).
  const centavos = Math.round(Math.abs(valor) * 100);
  if (!Number.isSafeInteger(centavos) || centavos / 100 > VALOR_MAXIMO) {
    throw new OfxParseError(`TRNAMT fora da faixa ${contexto}: "${trnamt}"`);
  }
  return valor;
}

// Parseia o conteúdo bruto de um arquivo OFX e retorna banco/conta do
// cabeçalho e a lista de transações já normalizadas. Lança OfxParseError
// em qualquer inconsistência — o chamador deve tratar isso como 422.
export function parseOfx(conteudo) {
  if (typeof conteudo !== "string" || !/<OFX>/i.test(conteudo)) {
    throw new OfxParseError("Arquivo não parece ser um OFX válido (tag <OFX> não encontrada)");
  }

  const blocosTransacao = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (!blocosTransacao || blocosTransacao.length === 0) {
    throw new OfxParseError("Nenhuma transação (<STMTTRN>) encontrada no arquivo");
  }

  const bankId = extrairCampoOfx(conteudo, "BANKID") || extrairCampoOfx(conteudo, "BRANCHID");
  if (!bankId) {
    throw new OfxParseError("Cabeçalho do banco (BANKID/BRANCHID) não encontrado");
  }
  const acctId = extrairCampoOfx(conteudo, "ACCTID");

  let ignoradasValorZero = 0;
  const transacoes = blocosTransacao.map((bloco, indice) => {
    const dtposted = extrairCampoOfx(bloco, "DTPOSTED");
    const trnamt = extrairCampoOfx(bloco, "TRNAMT");
    const memo = extrairCampoOfx(bloco, "MEMO");
    const name = extrairCampoOfx(bloco, "NAME");
    const fitid = extrairCampoOfx(bloco, "FITID");
    const trntype = extrairCampoOfx(bloco, "TRNTYPE");
    const contexto = contextoTransacao(indice, fitid);

    const valorNumerico = parseValor(trnamt, contexto);
    // Linha informativa do banco: não é movimentação, não há o que conciliar.
    if (valorNumerico === 0) {
      ignoradasValorZero += 1;
      return null;
    }
    const tipo = valorNumerico > 0 ? "credito" : "debito";

    if (trntype) {
      const esperado = tipo === "credito" ? "CREDIT" : "DEBIT";
      if (trntype.toUpperCase() !== esperado) {
        console.warn(
          `[ofx-parser] TRNTYPE (${trntype}) diverge do sinal do TRNAMT (${trnamt}) ${contexto} — usando o sinal do valor`,
        );
      }
    }

    return {
      data_lancamento: parseData(dtposted, contexto),
      valor: Math.abs(valorNumerico),
      tipo,
      descricao: (memo || name || "").trim() || null,
      id_banco: fitid || null,
    };
  });

  const validas = transacoes.filter(Boolean);
  if (validas.length === 0) {
    throw new OfxParseError("Todas as transações do arquivo têm valor zero (TRNAMT = 0)");
  }

  // O banco não repete FITID na mesma conta: repetido no arquivo é arquivo inconsistente
  // (ou editado à mão), e não dá para saber qual das linhas vale. FITID vazio não conta.
  const vistos = new Set();
  for (const { id_banco } of validas) {
    if (!id_banco) continue;
    if (vistos.has(id_banco)) {
      throw new OfxParseError(`FITID repetido no arquivo: "${id_banco}"`);
    }
    vistos.add(id_banco);
  }

  return {
    banco: bankId,
    conta: acctId ? acctId.slice(-4) : null,
    transacoes: validas,
    ignoradas_valor_zero: ignoradasValorZero,
  };
}

function contagemPorMes(transacoes) {
  const contagem = new Map();
  for (const t of transacoes) {
    const [ano, mes] = t.data_lancamento.split("-");
    const chave = `${ano}-${mes}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return contagem;
}

// Mês da maioria, na ordem em que os meses aparecem no arquivo. Empate não
// troca o primeiro: a comparação é estrita, então o segundo mês com a mesma
// quantidade não substitui o que já chegou na contagem máxima.
export function periodosDoExtrato(transacoes) {
  const contagem = contagemPorMes(transacoes);
  let maiorContagem = -1;
  for (const quantidade of contagem.values()) {
    if (quantidade > maiorContagem) maiorContagem = quantidade;
  }

  const meses = [];
  let escolhido = null;
  for (const [chave, quantidade] of contagem) {
    const [ano, mes] = chave.split("-");
    const item = { mes: Number(mes), ano: Number(ano), quantidade };
    meses.push(item);
    if (!escolhido && quantidade === maiorContagem) escolhido = item;
  }

  const empatados = meses.filter((item) => item.quantidade === maiorContagem).length;
  return {
    mes: escolhido.mes,
    ano: escolhido.ano,
    empate: empatados > 1,
    meses,
  };
}

// Infere mes/ano do extrato pela combinação mês+ano mais frequente entre as
// transações, tolerando algumas transações "vazadas" de outro mês perto da virada.
export function inferirMesAno(transacoes) {
  const { mes, ano } = periodosDoExtrato(transacoes);
  return { mes, ano };
}
