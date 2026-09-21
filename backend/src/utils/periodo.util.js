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

// Data civil local YYYY-MM-DD — evita o salto de UTC de toISOString() à noite no BR.
export function dataLocalISO(agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Mês YYYY-MM está fechado quando o calendário já passou do último dia dele.
export function mesJaFechado(referenciaAnoMes, hojeISO = dataLocalISO()) {
  if (typeof referenciaAnoMes !== "string" || !/^\d{4}-\d{2}$/.test(referenciaAnoMes)) {
    return false;
  }
  const [ano, mes] = referenciaAnoMes.split("-").map(Number);
  return hojeISO > ultimoDiaDoMes(ano, mes);
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

// Data de hoje no fuso de Brasília (America/Sao_Paulo), YYYY-MM-DD. O servidor
// roda em UTC: entre 21:00 e 24:00 (BRT) o toISOString() já está no dia
// seguinte, então o último dia do mês viraria "mês que vem" três horas antes de
// o mês realmente fechar no Brasil.
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

// Última competência (mês/ano) já encerrada no fuso de Brasília. A apuração do
// Simples só faz sentido sobre um mês fechado: tanto a receita do mês quanto a
// janela de RBT12 de uma competência em aberto somam meses incompletos, o que
// subestima a alíquota efetiva e o DAS (#497). Usa hojeNoBrasil() pelo mesmo
// motivo daquele helper — no último dia do mês, o servidor em UTC já estaria no
// mês seguinte depois das 21:00 (BRT) e liberaria uma competência ainda aberta.
export function ultimaCompetenciaFechada(agora = new Date()) {
  const hoje = hojeNoBrasil(agora);
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function competenciaEstaFechada(ano, mes, agora = new Date()) {
  const ultima = ultimaCompetenciaFechada(agora);
  return ano * 12 + mes <= ultima.ano * 12 + ultima.mes;
}
