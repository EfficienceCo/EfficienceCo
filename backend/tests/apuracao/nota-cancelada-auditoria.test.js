// DAS-4 (#728, PRB-AP-16): a NF-e cancelada não entra na soma, mas aparece em "excluídas" com o
// motivo e a data do cancelamento. Requisição HTTP, token de usuário e banco descartável reais.
//
// Este é o teste do PRB-AP-16 que a TEST-DAS-2 (#730) previa como `skip`. Entrou com a correção
// porque a TEST-DAS-2 ainda não tinha PR (mesmo caminho da DAS-1). Quando a TEST-DAS-2 chegar, o
// teste dela substitui este: um só teste por problema.
//
// Cenário do QA-F de 2026-10-12 (item 10): competência 09/2026 com uma saída cancelada de
// R$ 5.000,00 em 06/09 e uma entrada de R$ 9.000,00. Origem dos números (conta à mão, LC 123/2006,
// Anexo I, 1ª faixa: até R$ 180.000,00, alíquota nominal 4%, parcela a deduzir 0):
// - janela da RBT12 = 09/2025 a 08/2026; histórico de R$ 10.000,00 em cada mês -> RBT12 = 120.000,00;
// - receita da competência = uma saída ativa de R$ 10.000,00 em 10/09/2026;
// - a cancelada de 06/09 (R$ 5.000,00) e uma cancelada de 15/03/2026 na janela (R$ 50.000,00)
//   ficam fora: se a de 06/09 contasse, o DAS seria 15.000 × 4% = 600,00;
// - alíquota efetiva = 4%; DAS = 10.000 × 4% = 400,00.
// - cancelado_em 2026-09-09T02:30Z é 08/09/2026 23:30 em Brasília: o motivo mostra 08/09/2026.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarApiTeste } from "../helpers/http.js";
import { resetarBanco } from "../helpers/banco.js";
import { recriarMassa680 } from "../helpers/massa-680.js";

const COMPETENCIA = { mes: 9, ano: 2026 };
const HISTORICO_JANELA = [
  ...[9, 10, 11, 12].map(mes => ({ mes, ano: 2025, receita: 10000 })),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(mes => ({ mes, ano: 2026, receita: 10000 })),
];
const ESPERADO = { rbt12_usado: 120000, receita_mes: 10000, aliquota_efetiva: 0.04, valor_calculado: 400 };
const CANCELADA_DO_MES = {
  valor_total: 5000,
  data_emissao: "2026-09-06",
  cancelado_em: "2026-09-09T02:30:00+00:00",
  motivo_cancelamento: "Erro no valor da nota",
  protocolo_cancelamento: "135260000000001",
  motivo: "NF-e cancelada em 08/09/2026 — não compõe a receita bruta.",
};

function numerosDa(apuracao) {
  return Object.fromEntries(Object.keys(ESPERADO).map(campo => [campo, Number(apuracao[campo])]));
}

// Cliente da massa #680 vira Simples Nacional, Anexo I, ativo desde 2018, com as notas do cenário.
async function prepararCenario(banco, massa) {
  const cliente = massa.tabelas.clientes[0];
  const { error } = await banco.from("clientes").update({
    regime_tributario: "simples_nacional",
    anexo_simples: "I",
    data_inicio_atividade: "2018-01-01",
    historico_receita: HISTORICO_JANELA,
  }).eq("id", cliente.id);
  if (error) throw new Error(`Erro preparando cliente: ${error.message}`);

  const nota = (sequencial, campos) => {
    const numero = String(728000 + sequencial).padStart(9, "0");
    const aamm = campos.data_emissao.slice(2, 4) + campos.data_emissao.slice(5, 7);
    return {
      cliente_id: cliente.id,
      // 44 dígitos: UF 35 + AAMM + CNPJ (14) + modelo 55 + série 001 + número (9) + tpEmis 1 + código (9).
      chave_nfe: `35${aamm}${cliente.cnpj}55001${numero}1${numero}`,
      cnpj_emitente: cliente.cnpj,
      cnpj_destinatario: "11222333000181",
      icms: 0, pis: 0, cofins: 0, ipi: 0,
      arquivo_xml: `das-4/nfe-${sequencial}.xml`,
      inconsistencias: [],
      tipo: "saida",
      tp_nf: 1,
      status: "ativa",
      ...campos,
    };
  };
  const { motivo: _motivo, ...colunasCancelada } = CANCELADA_DO_MES;
  const notas = [
    nota(1, { valor_total: 10000, data_emissao: "2026-09-10" }),
    nota(2, { tipo: "entrada", tp_nf: 0, valor_total: 9000, data_emissao: "2026-09-12" }),
    nota(3, { ...colunasCancelada, status: "cancelada" }),
    nota(4, { valor_total: 50000, data_emissao: "2026-03-15", status: "cancelada", cancelado_em: "2026-03-20T15:00:00+00:00" }),
  ];
  const { error: erroNotas } = await banco.from("lancamentos_fiscais").insert(notas);
  if (erroNotas) throw new Error(`Erro preparando NF-e: ${erroNotas.message}`);

  const usuario = massa.tabelas.usuarios.find(item => item.cliente_id === cliente.id && item.perfil === "admin_cliente");
  return { usuario, chaves: notas.map(item => item.chave_nfe) };
}

describe("DAS-4 (#728): NF-e cancelada aparece em excluídas com motivo, fora da soma", { timeout: 120_000 }, () => {
  let api; let A;
  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    try { await api.fechar(); }
    finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    const recriada = await recriarMassa680();
    A = await prepararCenario(recriada.banco, recriada.massa);
  });

  const criar = () => api.requisitar("/apuracoes", {
    usuario: A.usuario, metodo: "POST", corpo: { ...COMPETENCIA, regime: "simples_nacional" },
  });
  const porChave = (lista, chave) => lista.find(item => item.chave_nfe === chave);

  function conferirAuditoria(corpo) {
    const [ativa, entrada, canceladaMes, canceladaJanela] = A.chaves;
    const { consideradas, excluidas } = corpo.notas_fiscais;

    assert.deepEqual(numerosDa(corpo), ESPERADO, "a cancelada não muda RBT12, receita nem DAS");
    assert.deepEqual(consideradas.map(item => item.chave_nfe), [ativa]);
    assert.deepEqual(excluidas.map(item => item.chave_nfe).sort(), [entrada, canceladaMes, canceladaJanela].sort());

    assert.deepEqual(porChave(excluidas, canceladaMes), {
      id: porChave(excluidas, canceladaMes).id,
      chave_nfe: canceladaMes,
      tipo: "saida",
      data_emissao: CANCELADA_DO_MES.data_emissao,
      valor_total: CANCELADA_DO_MES.valor_total,
      compoe_rbt12: false,
      compoe_receita_mes: false,
      motivo: CANCELADA_DO_MES.motivo,
      cancelado_em: porChave(excluidas, canceladaMes).cancelado_em,
      motivo_cancelamento: CANCELADA_DO_MES.motivo_cancelamento,
      protocolo_cancelamento: CANCELADA_DO_MES.protocolo_cancelamento,
    });
    assert.equal(
      new Date(porChave(excluidas, canceladaMes).cancelado_em).toISOString(),
      new Date(CANCELADA_DO_MES.cancelado_em).toISOString(),
    );
    assert.equal(porChave(excluidas, canceladaJanela).motivo, "NF-e cancelada em 20/03/2026 — não compõe a receita bruta.");
    assert.equal(porChave(excluidas, entrada).motivo, "Nota fiscal de entrada não compõe a receita bruta.");
  }

  it("POST e GET /:id listam a cancelada em excluídas, com o DAS calculado só pelas ativas", async () => {
    const criado = await criar();
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    conferirAuditoria(criado.corpo);

    const aberto = await api.requisitar(`/apuracoes/${criado.corpo.id}`, { usuario: A.usuario });

    assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
    conferirAuditoria(aberto.corpo);
    assert.equal(aberto.corpo.breakdown_desatualizado, false);
  });

  it("recalcular mantém a cancelada em excluídas e o mesmo DAS", async () => {
    const { corpo: { id } } = await criar();

    const recalculado = await api.requisitar(`/apuracoes/${id}/recalcular`, { usuario: A.usuario, metodo: "PATCH" });

    assert.equal(recalculado.status, 200, JSON.stringify(recalculado.corpo));
    conferirAuditoria(recalculado.corpo);
  });
});
