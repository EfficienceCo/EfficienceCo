// Último dia do mês (mes 1-12) no formato YYYY-MM-DD. Compartilhado entre
// aplicarFiltroPeriodo e o cálculo da janela de RBT12/Fator R em
// apuracoes.controller.js pra não duplicar essa conta em dois lugares.
export function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes, 0).toISOString().slice(0, 10);
}

// Aplica filtro de mes/ano a uma query Supabase sobre uma coluna de data.
// Compartilhado entre controllers que filtram listagens por mes+ano (obrigacoes,
// lancamentos-fiscais) pra não duplicar o cálculo de início/fim do período.
export function aplicarFiltroPeriodo(query, campo, mes, ano) {
  if (mes && ano) {
    const mesFormatado = String(mes).padStart(2, "0");
    const inicioMes = `${ano}-${mesFormatado}-01`;
    const fimMes = ultimoDiaDoMes(parseInt(ano), parseInt(mes));
    return query.gte(campo, inicioMes).lte(campo, fimMes);
  }
  if (ano) {
    return query.gte(campo, `${ano}-01-01`).lte(campo, `${ano}-12-31`);
  }
  return query;
}
