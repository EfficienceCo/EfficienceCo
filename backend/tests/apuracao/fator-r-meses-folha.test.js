// DAS-2 (#726): Fator R do Anexo V com menos de 12 meses de folha, pela rota. Requisição HTTP,
// token de usuário e banco descartável reais (nada de banco falso).
//
// Regras (Res. CGSN 140/2018, art. 26 §§4º, 6º e 7º; Manual PGDAS-D 8.2.1):
// - mês sem processamento de folha conta como zero (decisão DAS-2);
// - processamento que existe mas falhou ou ainda não concluiu mantém o provisório (409 ao aprovar);
// - mês de abertura usa folha e receita do próprio PA;
// - o Fator R é a razão das somas do mesmo período (sem arredondar as bases anualizadas antes).
//
// Tabelas (LC 123/2006), 1ª faixa até R$ 180.000,00: Anexo III 6% (dedução 0); Anexo V 15,5% (dedução 0).
// 2ª faixa do Anexo V (até R$ 360.000,00): 18%, dedução R$ 4.500,00.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarApiTeste } from "../helpers/http.js";
import { resetarBanco } from "../helpers/banco.js";
import { recriarMassa680 } from "../helpers/massa-680.js";

const mesAno = (referencia) => referencia.split("-").map(Number);

// Cliente da massa #680 vira Simples Nacional, Anexo V, com receita mensal de histórico.
async function prepararCliente(banco, massa, { inicio, historico = [], notas = [], indice = 0 }) {
  const cliente = massa.tabelas.clientes[indice];
  const { error } = await banco.from("clientes").update({
    regime_tributario: "simples_nacional",
    anexo_simples: "V",
    data_inicio_atividade: inicio,
    historico_receita: historico.map(([referencia, receita]) => {
      const [ano, mes] = mesAno(referencia);
      return { mes, ano, receita };
    }),
  }).eq("id", cliente.id);
  if (error) throw new Error(`Erro preparando cliente: ${error.message}`);

  for (const [i, [data, valor]] of notas.entries()) {
    const numero = String(726000 + indice * 100 + i).padStart(9, "0");
    const aamm = data.slice(2, 4) + data.slice(5, 7);
    const { error: erroNota } = await banco.from("lancamentos_fiscais").insert({
      cliente_id: cliente.id,
      chave_nfe: `35${aamm}${cliente.cnpj}55001${numero}1${numero}`,
      tipo: "saida",
      cnpj_emitente: cliente.cnpj,
      cnpj_destinatario: "11222333000181",
      valor_total: valor,
      icms: 0, pis: 0, cofins: 0, ipi: 0,
      data_emissao: data,
      arquivo_xml: `das-2/nfe-${indice}-${i}.xml`,
      status: "ativa",
      tp_nf: 1,
      inconsistencias: [],
    });
    if (erroNota) throw new Error(`Erro preparando NF-e: ${erroNota.message}`);
  }

  const usuario = massa.tabelas.usuarios.find(item => item.cliente_id === cliente.id && item.perfil === "admin_cliente");
  return { cliente, usuario };
}

// Um processamento por mês; folha concluída grava uma linha de folha_calculos com base_calculo = folha.
async function inserirFolha(banco, clienteId, referencia, { status = "concluido", folha = 0 } = {}) {
  const { data, error } = await banco.from("processamentos_folha").insert({
    cliente_id: clienteId,
    mes_referencia: `${referencia}-01`,
    status,
    arquivo_origem_path: `das-2/folha-${referencia}.xlsx`,
  }).select("id").single();
  if (error) throw new Error(`Erro preparando processamento: ${error.message}`);
  if (status === "concluido" && folha > 0) {
    const { error: erroCalculo } = await banco.from("folha_calculos").insert({
      processamento_id: data.id,
      empresa: "Empresa DAS-2", funcionario: "Sócio", cpf: "52998224725", cargo: "Sócio",
      salario_bruto: folha, dias_trabalhados: 30,
      valor_horas_extras: 0, valor_faltas: 0, desconto_vt: 0,
      base_calculo: folha, inss: 0, fgts: 0, ir: 0, liquido: folha,
    });
    if (erroCalculo) throw new Error(`Erro preparando cálculo de folha: ${erroCalculo.message}`);
  }
  return data.id;
}

async function buscarApuracao(banco, id) {
  const { data, error } = await banco.from("apuracoes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha lendo apuracoes: ${error.message}`);
  return data;
}

const numerosGravados = (linha) => ({
  anexo: linha.anexo,
  fator_r: linha.fator_r == null ? null : Number(linha.fator_r),
  folha12: linha.folha12 == null ? null : Number(linha.folha12),
  rbt12_usado: Number(linha.rbt12_usado),
  valor_calculado: Number(linha.valor_calculado),
  folha_status: linha.folha_status,
});

// Janela 09/2025 a 08/2026 com R$ 20.000,00/mês → RBT12 R$ 240.000,00; PA 09/2026 com R$ 20.000,00.
const HISTORICO_240K = Array.from({ length: 12 }, (_, i) => {
  const indice = 2025 * 12 + 8 + i;
  return [`${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`, 20000];
});
// Anexo V, 2ª faixa: (240.000 × 18% − 4.500) ÷ 240.000 = 16,125% → 20.000 × 16,125% = R$ 3.225,00.
const DAS_V_240K = 3225;

describe("DAS-2 (#726): Fator R com menos de 12 meses de folha pela rota", { timeout: 300_000 }, () => {
  let api; let banco; let massa;
  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    try { await api.fechar(); }
    finally { await resetarBanco(); }
  });
  beforeEach(async () => { ({ banco, massa } = await recriarMassa680()); });

  const criar = (quem, mes, ano) => api.requisitar("/apuracoes", {
    usuario: quem.usuario, metodo: "POST", corpo: { mes, ano, regime: "simples_nacional" },
  });
  const aprovar = (quem, id) => api.requisitar(`/apuracoes/${id}/aprovar`, { usuario: quem.usuario, metodo: "PATCH" });
  const recalcular = (quem, id) => api.requisitar(`/apuracoes/${id}/recalcular`, { usuario: quem.usuario, metodo: "PATCH" });

  for (const status of ["erro", "processando", "pendente"]) {
    it(`processamento de folha em '${status}' mantém o provisório: criar, recalcular e aprovar bloqueiam; concluído libera`, async () => {
      const A = await prepararCliente(banco, massa, {
        inicio: "2018-01-01", historico: HISTORICO_240K, notas: [["2026-09-10", 20000]],
      });
      await inserirFolha(banco, A.cliente.id, "2026-08", { folha: 6000 });
      const falho = await inserirFolha(banco, A.cliente.id, "2026-07", { status });

      const criado = await criar(A, 9, 2026);
      assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
      const provisorio = { anexo: "V", fator_r: 0, folha12: null, rbt12_usado: 240000, valor_calculado: DAS_V_240K, folha_status: "pendente" };
      assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), provisorio);

      const recalculado = await recalcular(A, criado.corpo.id);
      // DAS-3 (D2): o recálculo espera a folha com o 409 da aprovação, dizendo
      // o mês, em vez do 422 FATOR_R_SEM_FOLHA.
      assert.equal(recalculado.status, 409, JSON.stringify(recalculado.corpo));
      assert.equal(recalculado.corpo.erro, "FOLHA_PENDENTE");
      assert.deepEqual(recalculado.corpo.mesesPendentes, ["2026-07"]);

      const bloqueado = await aprovar(A, criado.corpo.id);
      assert.equal(bloqueado.status, 409, JSON.stringify(bloqueado.corpo));
      assert.equal((await buscarApuracao(banco, criado.corpo.id)).status, "rascunho");

      // Reprocessamento concluído (sem folha no mês) passa a valer: FS12 6.000 → FR 0,02 → V.
      await banco.from("processamentos_folha").update({ status: "concluido" }).eq("id", falho);
      const liberado = await recalcular(A, criado.corpo.id);
      assert.equal(liberado.status, 200, JSON.stringify(liberado.corpo));
      assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), {
        ...provisorio, fator_r: 0.02, folha12: 6000, folha_status: "verificado",
      });
      assert.equal((await aprovar(A, criado.corpo.id)).status, 200);
    });
  }

  it("folha zero sem nenhum processamento (empresa de 2018): FS12 0, FR 0,01, Anexo V, R$ 3.225,00 e aprovável", async () => {
    const A = await prepararCliente(banco, massa, {
      inicio: "2018-01-01", historico: HISTORICO_240K, notas: [["2026-09-10", 20000]],
    });

    const criado = await criar(A, 9, 2026);

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), {
      anexo: "V", fator_r: 0.01, folha12: 0, rbt12_usado: 240000, valor_calculado: DAS_V_240K, folha_status: "verificado",
    });
    assert.equal((await aprovar(A, criado.corpo.id)).status, 200);
  });

  // Abertura em 01/09/2026, PA 09/2026: RBT12 = 15.000 × 12 = 180.000 (1ª faixa).
  it("mês de abertura com folha concluída: FS12 6.000 × 12 = 72.000, FR 0,40 → Anexo III, R$ 900,00 e aprovável", async () => {
    const A = await prepararCliente(banco, massa, { inicio: "2026-09-01", notas: [["2026-09-10", 15000]] });
    await inserirFolha(banco, A.cliente.id, "2026-09", { folha: 6000 });

    const criado = await criar(A, 9, 2026);

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), {
      anexo: "III", fator_r: 0.4, folha12: 72000, rbt12_usado: 180000, valor_calculado: 900, folha_status: "verificado",
    });
    assert.equal((await aprovar(A, criado.corpo.id)).status, 200);
  });

  it("mês de abertura sem folha: FS12 0, FR 0,01 → Anexo V, 15.000 × 15,5% = R$ 2.325,00 e aprovável", async () => {
    const A = await prepararCliente(banco, massa, { inicio: "2026-09-01", notas: [["2026-09-10", 15000]] });

    const criado = await criar(A, 9, 2026);

    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), {
      anexo: "V", fator_r: 0.01, folha12: 0, rbt12_usado: 180000, valor_calculado: 2325, folha_status: "verificado",
    });
    assert.equal((await aprovar(A, criado.corpo.id)).status, 200);
  });

  // Início 01/01/2026, PA 08/2026 → 7 meses de atividade (01 a 07/2026).
  // Receita somada 100.001,00 (6 × 14.286 + 14.285); RBT12 = 100.001 ÷ 7 × 12 = 171.430,29.
  // Folha somada 28.000,28 → razão exata 0,28 → III: 10.000 × 6% = R$ 600,00.
  // As bases anualizadas e arredondadas (48.000,48 ÷ 171.430,29) dariam 0,27 → V: R$ 1.550,00.
  // Um centavo abaixo (28.000,27) → 0,27 → V: R$ 1.550,00.
  const MESES_7 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
  for (const [ultimaFolha, esperado] of [
    [4000.28, { anexo: "III", fator_r: 0.28, folha12: 48000.48, valor_calculado: 600 }],
    [4000.27, { anexo: "V", fator_r: 0.27, folha12: 48000.46, valor_calculado: 1550 }],
  ]) {
    it(`limiar de 28% pela razão das somas: folha somada ${(24000 + ultimaFolha).toFixed(2)} → ${esperado.anexo}, R$ ${esperado.valor_calculado}`, async () => {
      const A = await prepararCliente(banco, massa, {
        inicio: "2026-01-01",
        historico: MESES_7.map((referencia, i) => [referencia, i < 6 ? 14286 : 14285]),
        notas: [["2026-08-10", 10000]],
      });
      for (const [i, referencia] of MESES_7.entries()) {
        await inserirFolha(banco, A.cliente.id, referencia, { folha: i < 6 ? 4000 : ultimaFolha });
      }

      const criado = await criar(A, 8, 2026);

      assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
      const numeros = { ...esperado, rbt12_usado: 171430.29, folha_status: "verificado" };
      assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), numeros);

      // O detalhe reconstrói com o anexo e o FR gravados, sem refazer a razão com as bases arredondadas.
      const aberto = await api.requisitar(`/apuracoes/${criado.corpo.id}`, { usuario: A.usuario });
      assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
      assert.equal(aberto.corpo.anexo_efetivo, esperado.anexo);
      assert.equal(Number(aberto.corpo.fator_r), esperado.fator_r);
      assert.equal(Number(aberto.corpo.valor_calculado), esperado.valor_calculado);

      const recalculado = await recalcular(A, criado.corpo.id);
      assert.equal(recalculado.status, 200, JSON.stringify(recalculado.corpo));
      assert.deepEqual(numerosGravados(await buscarApuracao(banco, criado.corpo.id)), numeros);
      assert.equal((await aprovar(A, criado.corpo.id)).status, 200);
    });
  }
});
