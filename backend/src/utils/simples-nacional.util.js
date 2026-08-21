// Motor de cálculo do Simples Nacional: lógica pura, sem banco, sem Express.
// Dado faturamento (RBT12 + receita do mês) e o Anexo da empresa, calcula a
// alíquota efetiva e o DAS do mês.
//
// Como funciona:
//   - 5 Anexos (I a V), cada um com 6 faixas de RBT12 (receita bruta dos
//     últimos 12 meses), cada faixa com alíquota nominal + parcela a deduzir.
//   - aliquota_efetiva = (rbt12 * aliquota_nominal - parcela_deduzir) / rbt12
//   - valor_das = receita_mes * aliquota_efetiva
//   - Exceção: Anexo V com Fator R (folha12 / rbt12) >= 28% usa a tabela do
//     Anexo III em vez da tabela do Anexo V.
//
// Tabelas fixas em lei (LC 123/2006, Anexos I-V) — não mudam sem nova lei.
// Formato de cada faixa: [rbt12_limite, aliquota_nominal, parcela_a_deduzir]
const TABELAS_SIMPLES = {
  I: [
    [180000, 0.04, 0],
    [360000, 0.073, 5940],
    [720000, 0.095, 13860],
    [1800000, 0.107, 22500],
    [3600000, 0.143, 87300],
    [4800000, 0.19, 378000],
  ],
  II: [
    [180000, 0.045, 0],
    [360000, 0.078, 5940],
    [720000, 0.1, 13860],
    [1800000, 0.112, 22500],
    [3600000, 0.147, 85500],
    [4800000, 0.3, 720000],
  ],
  III: [
    [180000, 0.06, 0],
    [360000, 0.112, 9360],
    [720000, 0.135, 17640],
    [1800000, 0.16, 35640],
    [3600000, 0.21, 125640],
    [4800000, 0.33, 648000],
  ],
  IV: [
    [180000, 0.045, 0],
    [360000, 0.09, 8100],
    [720000, 0.102, 12420],
    [1800000, 0.14, 39780],
    [3600000, 0.22, 183780],
    [4800000, 0.33, 828000],
  ],
  V: [
    [180000, 0.155, 0],
    [360000, 0.18, 4500],
    [720000, 0.195, 9900],
    [1800000, 0.205, 17100],
    [3600000, 0.23, 62100],
    [4800000, 0.305, 540000],
  ],
};

const FATOR_R_LIMIAR = 0.28;

function arredondarMoeda(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

// O PGDAS-D considera duas casas decimais sem arredondamento para o Fator R.
// O EPSILON evita que um 0,28 exato representado como 0,27999999999999997 seja
// truncado indevidamente para 0,27.
function truncarFatorR(valor) {
  return Math.trunc((valor + Number.EPSILON) * 100) / 100;
}

// Recebe rbt12 (receita bruta dos últimos 12 meses), receita_mes, anexo
// ("I" a "V") e, para o Anexo V, folha12 (folha de pagamento dos últimos 12
// meses, para calcular o Fator R) ou semDadosFolha: true quando não há dados
// de folha suficientes para apurar o Fator R.
export function calcularSimplesNacional({ rbt12, receita_mes, anexo, folha12 = null, semDadosFolha = false }) {
  if (!TABELAS_SIMPLES[anexo]) return { erro: "ANEXO_INVALIDO" };
  if (!Number.isFinite(rbt12) || rbt12 < 0) return { erro: "RBT12_INVALIDO" };
  if (!Number.isFinite(receita_mes) || receita_mes < 0) return { erro: "RECEITA_MES_INVALIDA" };

  let anexo_efetivo = anexo;
  let fator_r = null;

  if (anexo === "V") {
    if (semDadosFolha || folha12 === null || folha12 === undefined) {
      return { erro: "FATOR_R_SEM_FOLHA" };
    }
    if (!Number.isFinite(folha12) || folha12 < 0) return { erro: "FOLHA12_INVALIDA" };

    // Resolução CGSN 140/2018, art. 26, § 7º:
    // - FS12 = 0 e RBT12 = 0: Fator R = 0,01;
    // - FS12 > 0 e RBT12 = 0: Fator R = 0,28.
    // Nos demais casos o PGDAS-D trunca o quociente em duas casas, sem arredondar.
    if (rbt12 === 0) {
      fator_r = folha12 > 0 ? 0.28 : 0.01;
    } else {
      fator_r = truncarFatorR(folha12 / rbt12);
    }
    if (fator_r >= FATOR_R_LIMIAR) anexo_efetivo = "III";
  }

  const tabela = TABELAS_SIMPLES[anexo_efetivo];
  const faixa = tabela.find(([limite]) => rbt12 <= limite);
  if (!faixa) return { erro: "RBT12_ACIMA_DO_LIMITE" };

  const [faixa_limite, aliquota_nominal, parcela_deduzir] = faixa;
  // Para a alíquota efetiva, o manual do PGDAS-D orienta considerar RBT12 = 1
  // quando o acumulado for zero. Na primeira faixa a parcela a deduzir é zero,
  // portanto o resultado é a própria alíquota nominal.
  const aliquota_efetiva =
    rbt12 === 0 ? aliquota_nominal : (rbt12 * aliquota_nominal - parcela_deduzir) / rbt12;

  // O PGDAS-D usa todas as casas da alíquota no cálculo. Somente o valor
  // monetário final é arredondado para centavos.
  const valor_das = arredondarMoeda(receita_mes * aliquota_efetiva);

  return {
    anexo_original: anexo,
    anexo_efetivo,
    faixa_limite,
    aliquota_nominal,
    parcela_deduzir,
    aliquota_efetiva,
    valor_das,
    fator_r,
    rbt12_usado: rbt12,
    receita_mes,
  };
}
