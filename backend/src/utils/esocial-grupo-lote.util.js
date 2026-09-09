// Mapeamento tipo de evento → grupo do lote (Manual §7.5.9).
// Grupos oficiais: 1=Tabelas, 2=Não Periódicos, 3=Periódicos.
// O campo `grupo` do CATALOGO_ESOCIAL é agrupamento interno da UI — não usar direto.

const GRUPO_LOTE_POR_EVENTO = {
  "S-2200": 2,
  "S-2205": 2,
  "S-2206": 2,
  "S-2230": 2,
  "S-2298": 2,
  "S-2299": 2,
  "S-2210": 2,
  "S-2220": 2,
  "S-2240": 2,
  "S-1200": 3,
  "S-1210": 3,
  "S-1299": 3,
};

export function grupoLoteParaEvento(tipoEvento) {
  const grupo = GRUPO_LOTE_POR_EVENTO[tipoEvento];
  if (!grupo) {
    throw new Error(`Tipo de evento sem grupo de lote mapeado: ${tipoEvento}`);
  }
  return grupo;
}
