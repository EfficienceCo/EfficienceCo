// Aceita apenas string inteira completa dentro da faixa — Number.parseInt
// sozinho aceitaria "7abc"/"7.9"/"2026xyz" (para no primeiro caractere
// inválido em vez de rejeitar), então usa Number() pra exigir a string
// inteira numérica antes de checar o intervalo.
function paraInteiroValido(valor, minimo, maximo) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : null;
}

// Último dia do mês (mes 1-12) no formato YYYY-MM-DD. Compartilhado entre
// aplicarFiltroPeriodo e o cálculo da janela de RBT12/Fator R em
// apuracoes.controller.js pra não duplicar essa conta em dois lugares.
// Date.UTC evita que o cálculo dependa do fuso horário do servidor (new
// Date(ano, mes, 0) local podia excluir o último dia em fusos com offset
// positivo).
export function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

// Aplica filtro de mes/ano a uma query Supabase sobre uma coluna de data.
// Compartilhado entre controllers que filtram listagens por mes+ano (obrigacoes,
// lancamentos-fiscais) pra não duplicar o cálculo de início/fim do período.
// mes/ano inválidos (não numéricos, fora de faixa) são tratados como ausentes
// em vez de derrubar o request — parseInt(NaN) em Date().toISOString() lança
// RangeError não capturado pelo handler.
export function aplicarFiltroPeriodo(query, campo, mes, ano) {
  const mesNumero = paraInteiroValido(mes, 1, 12);
  const anoNumero = paraInteiroValido(ano, 1000, 9999);

  if (mesNumero && anoNumero) {
    const mesFormatado = String(mesNumero).padStart(2, "0");
    const inicioMes = `${anoNumero}-${mesFormatado}-01`;
    const fimMes = ultimoDiaDoMes(anoNumero, mesNumero);
    return query.gte(campo, inicioMes).lte(campo, fimMes);
  }
  if (anoNumero) {
    return query.gte(campo, `${anoNumero}-01-01`).lte(campo, `${anoNumero}-12-31`);
  }
  return query;
}

// Data de hoje no fuso de Brasília (America/Sao_Paulo), YYYY-MM-DD.
// data_vencimento é DATE e representa um dia útil brasileiro, mas o servidor
// roda em UTC: entre 21:00 e 24:00 (BRT) o toISOString() já está no dia
// seguinte e marcaria como atrasada uma obrigação que vence hoje no Brasil.
// `agora` é injetável para testes determinísticos.
const formatadorBrasil = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeNoBrasil(agora = new Date()) {
  return formatadorBrasil.format(agora);
}
