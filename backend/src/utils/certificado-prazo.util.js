/**
 * Prazo do certificado digital (CD-2 UI + CD-3 alertas).
 * O cálculo de dias vive em prazo.util.js — compartilhado com os alertas de
 * obrigações (#529); re-exportado aqui para não quebrar quem já importava daqui.
 */
export { calcularDiasRestantes } from "./prazo.util.js";

export function calcularFaixa(diasRestantes) {
  if (diasRestantes <= 0) return "vencido";
  if (diasRestantes < 30) return "vermelho";
  if (diasRestantes <= 60) return "ambar";
  return "verde";
}
