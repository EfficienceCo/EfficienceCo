function paraInteiroValido(valor, minimo, maximo) {
  const numero = Number.parseInt(valor, 10);
  return Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : null;
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
    // Date.UTC evita que o cálculo do último dia do mês dependa do fuso
    // horário do servidor (new Date(y, m, 0).toISOString() podia excluir o
    // último dia em fusos com offset positivo).
    const fimMes = new Date(Date.UTC(anoNumero, mesNumero, 0)).toISOString().slice(0, 10);
    return query.gte(campo, inicioMes).lte(campo, fimMes);
  }
  if (anoNumero) {
    return query.gte(campo, `${anoNumero}-01-01`).lte(campo, `${anoNumero}-12-31`);
  }
  return query;
}
