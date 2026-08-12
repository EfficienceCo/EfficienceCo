// Parser de extrato OFX (SGML solto, padrão usado por bancos brasileiros —
// tags sem fechamento, ex.: <DTPOSTED>20240105 em vez de XML bem-formado).
// Extração por regex em vez de lib externa: mais tolerante a essas variações
// e evita depender de um parser XML estrito que rejeitaria o arquivo.

export class OfxParseError extends Error {}

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

function extrairTag(bloco, tag) {
  const match = bloco.match(new RegExp(`<${tag}>([^<\r\n]*)`, "i"));
  return match ? match[1].trim() : null;
}

function parseData(dtposted, contexto) {
  const digitos = (dtposted || "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!digitos) {
    throw new OfxParseError(`DTPOSTED inválido ou ausente ${contexto}: "${dtposted ?? ""}"`);
  }
  const [, ano, mes, dia] = digitos;
  return `${ano}-${mes}-${dia}`;
}

function parseValor(trnamt, contexto) {
  if (trnamt === null || trnamt === undefined || trnamt === "") {
    throw new OfxParseError(`TRNAMT ausente ${contexto}`);
  }
  const valor = Number(trnamt.replace(",", "."));
  if (Number.isNaN(valor)) {
    throw new OfxParseError(`TRNAMT inválido ${contexto}: "${trnamt}"`);
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

  const bankId = extrairTag(conteudo, "BANKID") || extrairTag(conteudo, "BRANCHID");
  if (!bankId) {
    throw new OfxParseError("Cabeçalho do banco (BANKID/BRANCHID) não encontrado");
  }
  const acctId = extrairTag(conteudo, "ACCTID");

  const transacoes = blocosTransacao.map((bloco, indice) => {
    const contexto = `na transação #${indice + 1}`;
    const dtposted = extrairTag(bloco, "DTPOSTED");
    const trnamt = extrairTag(bloco, "TRNAMT");
    const memo = extrairTag(bloco, "MEMO");
    const name = extrairTag(bloco, "NAME");
    const fitid = extrairTag(bloco, "FITID");
    const trntype = extrairTag(bloco, "TRNTYPE");

    const valorNumerico = parseValor(trnamt, contexto);
    const tipo = valorNumerico >= 0 ? "credito" : "debito";

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

  return {
    banco: bankId,
    conta: acctId ? acctId.slice(-4) : null,
    transacoes,
  };
}

// Infere mes/ano do extrato pela combinação mês+ano mais frequente entre as
// transações, tolerando algumas transações "vazadas" de outro mês perto da virada.
export function inferirMesAno(transacoes) {
  const contagem = new Map();
  for (const t of transacoes) {
    const [ano, mes] = t.data_lancamento.split("-");
    const chave = `${ano}-${mes}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }

  let chaveMaisFrequente = null;
  let maiorContagem = -1;
  for (const [chave, contagemAtual] of contagem) {
    if (contagemAtual > maiorContagem) {
      maiorContagem = contagemAtual;
      chaveMaisFrequente = chave;
    }
  }

  const [ano, mes] = chaveMaisFrequente.split("-");
  return { mes: Number(mes), ano: Number(ano) };
}
