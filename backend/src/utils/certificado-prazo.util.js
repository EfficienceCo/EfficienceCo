/**
 * Cálculo de prazo do certificado digital (CD-2 UI + CD-3 alertas).
 * `hoje` injetável para testes determinísticos.
 */
export function calcularDiasRestantes(validade, hoje = new Date()) {
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const [ano, mes, dia] = String(validade).slice(0, 10).split("-").map(Number);
  const validadeUtc = Date.UTC(ano, mes - 1, dia);

  return Math.round((validadeUtc - hojeUtc) / (1000 * 60 * 60 * 24));
}

export function calcularFaixa(diasRestantes) {
  if (diasRestantes <= 0) return "vencido";
  if (diasRestantes < 30) return "vermelho";
  if (diasRestantes <= 60) return "ambar";
  return "verde";
}
