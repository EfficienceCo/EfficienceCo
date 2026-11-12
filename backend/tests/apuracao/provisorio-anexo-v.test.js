// DAS-1 (#725, PRB-AP-13): o rascunho provisório do Anexo V (criado sem a folha dos 12 meses,
// #619) precisa reabrir, ser editado e ser excluído pela rota. Requisição HTTP, token de usuário
// e banco descartável reais (nada de banco falso).
//
// Este é o teste do PRB-AP-13 que a TEST-DAS-2 (#730) previa como `skip`. Ele entrou com a
// correção porque a TEST-DAS-2 ainda não tinha PR (regra 1 da sprint 2026-11). Quando a
// TEST-DAS-2 chegar, o teste dela substitui este: um só teste por problema.
//
// Origem dos números (conta à mão, LC 123/2006, Anexo V, 1ª faixa: até R$ 180.000,00,
// alíquota nominal 15,50%, parcela a deduzir 0):
// - competência 08/2026; janela da RBT12 = 08/2025 a 07/2026 (12 meses anteriores);
// - histórico de receita de R$ 10.000,00 em cada mês da janela, sem NF-e nela -> RBT12 = 120.000,00;
// - receita da competência = uma NF-e de saída de R$ 10.000,00 em 10/08/2026;
// - sem folha processada -> provisório no pior caso (Anexo V, sem migrar para o III):
//   alíquota efetiva = (120.000 × 15,5% − 0) ÷ 120.000 = 15,5%; DAS = 10.000 × 15,5% = 1.550,00;
// - fator_r = 0 é a sentinela do provisório (não é Fator R apurado) e folha_status = pendente.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarApiTeste } from "../helpers/http.js";
import { resetarBanco } from "../helpers/banco.js";
import { recriarMassa680 } from "../helpers/massa-680.js";

const COMPETENCIA = { mes: 8, ano: 2026 };
const HISTORICO_JANELA = [
  ...[8, 9, 10, 11, 12].map(mes => ({ mes, ano: 2025, receita: 10000 })),
  ...[1, 2, 3, 4, 5, 6, 7].map(mes => ({ mes, ano: 2026, receita: 10000 })),
];
const ESPERADO = {
  valor_calculado: 1550,
  aliquota_efetiva: 0.155,
  aliquota_nominal: 0.155,
  rbt12_usado: 120000,
  receita_mes: 10000,
  anexo: "V",
  anexo_original: "V",
  anexo_efetivo: "V",
  fator_r: 0,
  folha12: null,
  folha_status: "pendente",
  status: "rascunho",
};

// Os campos que o contador confere: DAS, alíquota, RBT12, sentinela do fator_r e folha_status.
function numerosDa(apuracao) {
  return Object.fromEntries(Object.keys(ESPERADO).map(campo => [campo, apuracao[campo] == null ? null : (
    typeof ESPERADO[campo] === "number" ? Number(apuracao[campo]) : apuracao[campo]
  )]));
}

async function buscarApuracao(banco, id) {
  const { data, error } = await banco.from("apuracoes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha lendo apuracoes: ${error.message}`);
  return data;
}

// Cliente da massa #680 vira Simples Nacional, Anexo V, ativo desde 2018 e sem folha nenhuma.
async function prepararAnexoVSemFolha(banco, massa, indice) {
  const cliente = massa.tabelas.clientes[indice];
  const { error } = await banco.from("clientes").update({
    regime_tributario: "simples_nacional",
    anexo_simples: "V",
    data_inicio_atividade: "2018-01-01",
    historico_receita: HISTORICO_JANELA,
  }).eq("id", cliente.id);
  if (error) throw new Error(`Erro preparando cliente: ${error.message}`);

  const numero = String(725000 + indice).padStart(9, "0");
  const { error: erroNota } = await banco.from("lancamentos_fiscais").insert({
    cliente_id: cliente.id,
    // 44 dígitos: UF 35 + AAMM 2608 + CNPJ (14) + modelo 55 + série 001 + número (9) + tpEmis 1 + código (9).
    chave_nfe: `352608${cliente.cnpj}55001${numero}1${numero}`,
    tipo: "saida",
    cnpj_emitente: cliente.cnpj,
    cnpj_destinatario: "11222333000181",
    valor_total: 10000,
    icms: 0, pis: 0, cofins: 0, ipi: 0,
    data_emissao: "2026-08-10",
    arquivo_xml: `das-1/nfe-${indice}.xml`,
    status: "ativa",
    tp_nf: 1,
    inconsistencias: [],
  });
  if (erroNota) throw new Error(`Erro preparando NF-e: ${erroNota.message}`);

  const usuario = massa.tabelas.usuarios.find(item => item.cliente_id === cliente.id && item.perfil === "admin_cliente");
  return { cliente, usuario };
}

describe("DAS-1 (#725): rascunho provisório do Anexo V abre, edita e exclui pela rota", { timeout: 120_000 }, () => {
  let api; let banco; let A; let B;
  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    try { await api.fechar(); }
    finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    const recriada = await recriarMassa680();
    banco = recriada.banco;
    A = await prepararAnexoVSemFolha(banco, recriada.massa, 0);
    B = await prepararAnexoVSemFolha(banco, recriada.massa, 1);
  });

  const criar = quem => api.requisitar("/apuracoes", {
    usuario: quem.usuario, metodo: "POST", corpo: { ...COMPETENCIA, regime: "simples_nacional" },
  });

  it("GET devolve 200 com os mesmos números do POST que criou o provisório", async () => {
    const criado = await criar(A);
    assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
    assert.deepEqual(numerosDa(criado.corpo), ESPERADO);

    const aberto = await api.requisitar(`/apuracoes/${criado.corpo.id}`, { usuario: A.usuario });

    assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
    assert.deepEqual(numerosDa(aberto.corpo), ESPERADO);
    assert.equal(aberto.corpo.rbt12, criado.corpo.rbt12);
    assert.deepEqual(numerosDa(await buscarApuracao(banco, criado.corpo.id)), {
      ...ESPERADO, anexo_original: null, anexo_efetivo: null, aliquota_nominal: null,
    });
  });

  it("PATCH com motivo edita o provisório e ele continua abrindo com 200", async () => {
    const { corpo: { id } } = await criar(A);

    const editado = await api.requisitar(`/apuracoes/${id}`, {
      usuario: A.usuario, metodo: "PATCH", corpo: { valor_editado: 1500, motivo: "Conferência do contador" },
    });

    assert.equal(editado.status, 200, JSON.stringify(editado.corpo));
    const gravado = await buscarApuracao(banco, id);
    assert.equal(Number(gravado.valor_editado), 1500);
    assert.equal(gravado.historico_edicoes.length, 1);
    assert.equal(gravado.historico_edicoes[0].motivo, "Conferência do contador");
    assert.equal(Number(gravado.valor_calculado), 1550);

    const aberto = await api.requisitar(`/apuracoes/${id}`, { usuario: A.usuario });
    assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
    assert.equal(Number(aberto.corpo.valor_editado), 1500);
  });

  it("DELETE exclui o provisório (204) e destrava a competência para um novo cálculo", async () => {
    const { corpo: { id } } = await criar(A);
    const repetido = await criar(A);
    assert.equal(repetido.status, 409, "enquanto o rascunho existe, calcular de novo dá 409");

    const excluido = await api.requisitar(`/apuracoes/${id}`, { usuario: A.usuario, metodo: "DELETE" });

    assert.equal(excluido.status, 204);
    assert.equal(await buscarApuracao(banco, id), null);
    assert.equal((await api.requisitar(`/apuracoes/${id}`, { usuario: A.usuario })).status, 404);
    const novo = await criar(A);
    assert.equal(novo.status, 201, JSON.stringify(novo.corpo));
  });

  it("outro escritório recebe 404 no GET e no DELETE do provisório, e o banco não muda", async () => {
    const { corpo: { id } } = await criar(A);
    const doB = await criar(B);
    assert.equal(doB.status, 201, JSON.stringify(doB.corpo));
    const antes = await buscarApuracao(banco, id);

    assert.equal((await api.requisitar(`/apuracoes/${id}`, { usuario: B.usuario })).status, 404);
    assert.equal((await api.requisitar(`/apuracoes/${id}`, { usuario: B.usuario, metodo: "DELETE" })).status, 404);

    assert.deepEqual(await buscarApuracao(banco, id), antes);
    assert.ok(await buscarApuracao(banco, doB.corpo.id), "o provisório do B continua no banco");
  });
});
