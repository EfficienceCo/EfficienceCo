/**
 * Cálculo de dias restantes até uma data (vencimento de certificado, obrigação).
 * `hoje` injetável para testes determinísticos.
 */
export function calcularDiasRestantes(data, hoje = new Date()) {
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const [ano, mes, dia] = String(data).slice(0, 10).split("-").map(Number);
  const dataUtc = Date.UTC(ano, mes - 1, dia);

  return Math.round((dataUtc - hojeUtc) / (1000 * 60 * 60 * 24));
}
