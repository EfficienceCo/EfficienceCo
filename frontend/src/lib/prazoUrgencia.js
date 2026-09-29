// Faixa de urgência por dias até o vencimento — mesmo padrão de cores do
// Certificado Digital (CD-5): vermelho ≤7 dias, âmbar 8-30 dias, verde >30 dias.

export function calcularDiasRestantes(dataVencimento) {
  if (!dataVencimento) {
    return null;
  }

  const iso = String(dataVencimento).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (!match) {
    return null;
  }

  const alvo = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  return Math.round((alvo - hojeUtc) / 86400000);
}

export function calcularFaixaPrazo(dias) {
  if (dias === null || dias === undefined || Number.isNaN(dias)) {
    return 'desconhecida';
  }

  if (dias <= 7) {
    return 'vermelho';
  }

  if (dias <= 30) {
    return 'ambar';
  }

  return 'verde';
}

export const CLASSE_BADGE_FAIXA = {
  vermelho: 'bg-rose-100 text-rose-700',
  ambar: 'bg-amber-100 text-amber-800',
  verde: 'bg-emerald-100 text-emerald-700',
  desconhecida: 'bg-amber-100 text-amber-800',
};
