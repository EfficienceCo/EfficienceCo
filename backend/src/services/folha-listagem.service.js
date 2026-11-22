// Marca o processamento vigente de cada competência: o mais recente, mesma regra que a
// FS12 da Apuração usa (coletarFolha12). Espera a lista em criado_em decrescente.
export function marcarVigentes(processamentos = []) {
  const vistos = new Set();
  return processamentos.map((processamento) => {
    const competencia = processamento.mes_referencia?.slice(0, 7);
    const vigente = !vistos.has(competencia);
    vistos.add(competencia);
    return { ...processamento, vigente };
  });
}
