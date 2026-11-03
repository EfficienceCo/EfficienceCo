// Formatação de banco e conta do extrato OFX.
// O parser continua gravando o BANKID (o código). O nome só entra na exibição.
// A conta mascarada guarda os últimos dígitos, sem contar hífen nem ponto.

// Número-Código do STR (o antigo COMPE), conferido na relação de participantes
// do Banco Central (ParticipantesSTR). O nome é o curto, o que o contador lê
// na ficha ("Bradesco", não "Banco Bradesco S.A."). Código fora da tabela
// volta como veio. O campo ORG do OFX não entra: o PDF só recebe o código
// já gravado, e o parser segue devolvendo o BANKID.
const BANCOS_COMPE = {
  "001": "Banco do Brasil",
  "004": "Banco do Nordeste",
  "021": "Banestes",
  "033": "Santander",
  "041": "Banrisul",
  "070": "BRB",
  "077": "Inter",
  "104": "Caixa",
  "121": "Agibank",
  "197": "Stone",
  "208": "BTG Pactual",
  "212": "Original",
  "237": "Bradesco",
  "260": "Nubank",
  "290": "PagBank",
  "318": "BMG",
  "323": "Mercado Pago",
  "335": "Digio",
  "336": "C6",
  "341": "Itaú",
  "348": "XP",
  "380": "PicPay",
  "389": "Mercantil",
  "422": "Safra",
  "623": "Banco Pan",
  "633": "Rendimento",
  "655": "Votorantim",
  "707": "Daycoval",
  "745": "Citibank",
  "748": "Sicredi",
  "756": "Sicoob",
};

// "0237" e "237" são o mesmo COMPE. "1234" (agência usada no lugar do BANKID)
// tem mais de 3 dígitos significativos e não é código de banco: volta inteiro.
export function nomeBanco(codigo) {
  if (codigo == null) return "";
  const texto = String(codigo).trim();
  if (!texto || !/^\d+$/.test(texto)) return texto;
  const semZeros = texto.replace(/^0+/, "");
  if (!semZeros || semZeros.length > 3) return texto;
  return BANCOS_COMPE[semZeros.padStart(3, "0")] ?? texto;
}

// Últimos 4 dígitos. Hífen e ponto não contam: "98765-4" guarda "7654", não "65-4".
// Se a conta tem menos de 4 dígitos, ficam todos — a máscara não descarta o que existe.
// Sem nenhum dígito, vale o recorte antigo dos últimos 4 caracteres.
export function mascararConta(acctId) {
  if (acctId == null) return null;
  const texto = String(acctId).trim();
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "");
  if (!digitos) return texto.slice(-4);
  return digitos.slice(-4);
}
