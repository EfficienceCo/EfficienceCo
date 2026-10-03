import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { ultimaCompetenciaFechada } from "../src/utils/periodo.util.js";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";
import {
  dispararApuracao,
  montarBasesCalculo,
  listarApuracoes,
  detalharApuracao,
  editarApuracao,
  aprovarApuracao,
  recalcularApuracao,
  excluirApuracao,
} from "../src/controllers/apuracoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const APURACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const operacoes = [];
function chave(t, m) { return `${t}:${m}`; }
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    insert(payload) { operacoes.push({ tabela, metodo: "insert", payload }); return builder; },
    update(payload) { operacoes.push({ tabela, metodo: "update", payload }); return builder; },
    delete() { operacoes.push({ tabela, metodo: "delete" }); return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    in() { return builder; },
    order() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => {
  supabase.from = originalFrom;
});

beforeEach(() => {
  filas.clear();
  operacoes.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload ?? null; return this; },
  };
}

function reqAdmin(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A, id: "user-1", email: "contador@teste.com" },
    ...overrides,
  };
}

function payloadValido(overrides = {}) {
  return {
    clienteId: CLIENTE_A,
    mes: 8,
    ano: 2026,
    regime: "simples_nacional",
    ...overrides,
  };
}

function queueSemDuplicata() {
  queue("apuracoes", "maybeSingle", { data: null, error: null });
}

function queueCliente(anexo_simples, overrides = {}) {
  queue("clientes", "maybeSingle", {
    data: {
      anexo_simples,
      regime_tributario: "simples_nacional",
      historico_receita: [],
      ...overrides,
    },
    error: null,
  });
}

function queueNotas(linhas) {
  queue("lancamentos_fiscais", "await", { data: linhas, error: null });
}

function processamentosDosDozeMeses() {
  return Array.from({ length: 12 }, (_, indice) => {
    const numeroMes = 2025 * 12 + 7 + indice;
    const ano = Math.floor(numeroMes / 12);
    const mes = (numeroMes % 12) + 1;
    return {
      id: `proc-${indice + 1}`,
      mes_referencia: `${ano}-${String(mes).padStart(2, "0")}-01`,
      criado_em: `${ano}-${String(mes).padStart(2, "0")}-02T00:00:00.000Z`,
    };
  });
}

// ---------------------------------------------------------------------------
// POST /apuracoes
// ---------------------------------------------------------------------------

describe("POST /apuracoes", () => {
  it("201 e persiste quando payload válido (Anexo I, sem Fator R)", async () => {
    queueSemDuplicata();
    queueCliente("I", { nome: "Cliente Teste" });
    queueNotas([
      { valor_total: 40000, data_emissao: "2025-09-15", status: "ativa" },
      { valor_total: 45000, data_emissao: "2026-08-10", status: "ativa" },
      { valor_total: 999999, data_emissao: "2026-08-11", status: "cancelada" },
    ]);
    queue("apuracoes", "single", { data: { id: "nova-apuracao", status: "rascunho" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, "nova-apuracao");
    assert.equal(res.body.anexo_original, "I");
    assert.equal(res.body.anexo_efetivo, "I");
    assert.equal(res.body.rbt12, 40000);
    assert.equal(res.body.faixa_limite, 180000);
    assert.equal(res.body.aliquota_nominal, 0.04);
    assert.equal(res.body.parcela_deduzir, 0);
    assert.equal(res.body.valor_calculado, 1800);
    assert.equal(res.body.cliente_nome, "Cliente Teste");
    assert.equal(res.body.rbt12_mensal.length, 12);
    assert.equal(res.body.notas_fiscais.consideradas.length, 2);
  });

  it("422 quando regime não é simples_nacional", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ regime: "lucro_presumido" }) }), res);

    assert.equal(res.statusCode, 422);
  });

  it("409 quando já existe apuração para cliente+mes+ano+regime", async () => {
    queue("apuracoes", "maybeSingle", { data: { id: "existente" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando cliente não existe", async () => {
    queueSemDuplicata();
    queue("clientes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 404);
  });

  it("422 FATOR_R_SEM_FOLHA quando Anexo V sem processamentos de folha no período", async () => {
    queueSemDuplicata();
    queueCliente("V");
    queueNotas([{ valor_total: 50000, data_emissao: "2026-08-10" }]);
    queue("processamentos_folha", "await", { data: [], error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "FATOR_R_SEM_FOLHA");
  });

  it("201 quando Anexo V com folha suficiente para cair no Fator R (Anexo III efetivo)", async () => {
    queueSemDuplicata();
    queueCliente("V");
    queueNotas([
      { valor_total: 50000, data_emissao: "2026-07-10" },
      { valor_total: 50000, data_emissao: "2026-08-10" },
    ]);
    queue("processamentos_folha", "await", { data: processamentosDosDozeMeses(), error: null });
    queue("folha_calculos", "await", { data: [{ base_calculo: 19000, fgts: 1000 }], error: null });
    queue("apuracoes", "single", { data: { id: "nova-apuracao-v", anexo: "III" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.anexo, "III");

    // #365 — folha já completa na criação não deve entrar na fila de polling
    // do agente (GET /apuracoes/folha-pendente filtra por folha_status =
    // "pendente"). Achado no review do PR #366 (Vinícius): sem isso, toda
    // apuração Anexo V aparecia "pendente" mesmo já calculada com dado completo.
    const insert = operacoes.find((operacao) => operacao.tabela === "apuracoes" && operacao.metodo === "insert");
    assert.equal(insert.payload.folha_status, "verificado");
  });

  it("422 quando o cliente cadastrado não pertence ao Simples Nacional", async () => {
    queueSemDuplicata();
    queueCliente("I", { regime_tributario: "lucro_presumido" });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "REGIME_NAO_SUPORTADO");
  });

  it("soma histórico manual apenas nos meses sem notas e dentro da RBT12", async () => {
    queueSemDuplicata();
    queueCliente("I", {
      historico_receita: [
        { mes: 8, ano: 2025, receita: 100000 },
        { mes: 9, ano: 2025, receita: 999999 },
        { mes: 7, ano: 2025, receita: 888888 },
      ],
    });
    queueNotas([
      { valor_total: 40000, data_emissao: "2025-09-15" },
      { valor_total: 45000, data_emissao: "2026-08-10" },
    ]);
    queue("apuracoes", "single", { data: { id: "nova-apuracao" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    const insert = operacoes.find((operacao) => operacao.tabela === "apuracoes" && operacao.metodo === "insert");
    assert.equal(res.statusCode, 201);
    assert.equal(insert.payload.rbt12_usado, 140000);
    assert.equal(insert.payload.receita_mes, 45000);
    // Anexo fora do V nunca entra na fila de folha do agente (fator_r fica
    // null), mas o valor gravado segue o default da coluna por consistência.
    assert.equal(insert.payload.folha_status, "pendente");
  });

  it("expõe a composição mensal e as NFes consideradas e excluídas para auditoria", async () => {
    queueSemDuplicata();
    queueCliente("I", {
      historico_receita: [{ mes: 8, ano: 2025, receita: 100000 }],
    });
    queueNotas([
      {
        id: "nfe-rbt12",
        chave_nfe: "35250800000000000000550010000000011000000010",
        tipo: "saida",
        valor_total: 40000,
        data_emissao: "2025-09-15",
      },
      {
        id: "nfe-competencia",
        chave_nfe: "35260800000000000000550010000000021000000020",
        tipo: "saida",
        valor_total: 45000,
        data_emissao: "2026-08-10",
      },
      {
        id: "nfe-entrada",
        chave_nfe: "35260800000000000000550010000000031000000030",
        tipo: "entrada",
        valor_total: 12000,
        data_emissao: "2026-08-11",
      },
    ]);
    queue("apuracoes", "single", { data: { id: "nova-apuracao" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.rbt12, 140000);
    assert.deepEqual(
      res.body.rbt12_mensal.find((item) => item.referencia === "2025-08"),
      {
        referencia: "2025-08",
        mes: 8,
        ano: 2025,
        receita_nfes: 0,
        receita_historico: 100000,
        total: 100000,
        periodo_fechado: true,
      },
    );
    assert.equal(res.body.notas_fiscais.consideradas.length, 2);
    assert.equal(res.body.notas_fiscais.excluidas.length, 1);
    assert.match(res.body.notas_fiscais.excluidas[0].motivo, /entrada não compõe/);
  });

  it("exclui da RBT12 notas de mês ainda não fechado (BUG-APUR-08)", async () => {
    // Competência alguns meses à frente: a janela RBT12 mistura meses já
    // fechados com o mês civil corrente (ainda aberto).
    const agora = new Date();
    const competencia = new Date(agora.getFullYear(), agora.getMonth() + 3, 1);
    const mesCompetencia = competencia.getMonth() + 1;
    const anoCompetencia = competencia.getFullYear();
    const mesCorrente = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
    const dia = String(Math.min(agora.getDate(), 28)).padStart(2, "0");
    const dataNoMesAberto = `${mesCorrente}-${dia}`;
    // Mês anterior ao corrente — garantido fechado e dentro da janela dos
    // 12 meses anteriores à competência (competência = corrente + 3).
    const mesFechadoDate = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const refFechado = `${mesFechadoDate.getFullYear()}-${String(mesFechadoDate.getMonth() + 1).padStart(2, "0")}`;
    const dataFechada = `${refFechado}-10`;

    const bases = montarBasesCalculo({
      notas: [
      {
        id: "nfe-mes-aberto",
        chave_nfe: "35260900000000000000550010000000041000000040",
        tipo: "saida",
        valor_total: 99999,
        data_emissao: dataNoMesAberto,
      },
      {
        id: "nfe-mes-fechado",
        chave_nfe: "35250800000000000000550010000000051000000050",
        tipo: "saida",
        valor_total: 40000,
        data_emissao: dataFechada,
      },
      ],
      historicoReceita: [],
      mes: mesCompetencia,
      ano: anoCompetencia,
      hojeISO: dataNoMesAberto,
    });

    assert.equal(bases.rbt12, 40000);
    const linhaAberta = bases.rbt12Mensal.find((item) => item.referencia === mesCorrente);
    assert.ok(linhaAberta, `esperava linha RBT12 para ${mesCorrente}`);
    assert.equal(linhaAberta.periodo_fechado, false);
    assert.equal(linhaAberta.total, 0);
    assert.equal(bases.notasFiscais.consideradas.length, 1);
    assert.equal(bases.notasFiscais.consideradas[0].id, "nfe-mes-fechado");
    const excluida = bases.notasFiscais.excluidas.find((n) => n.id === "nfe-mes-aberto");
    assert.match(excluida.motivo, /não fechado/i);
  });

  it("inclui saída para CPF na receita do mês (destinatário pessoa física)", () => {
    const bases = montarBasesCalculo({
      notas: [
        {
          id: "nfe-cpf",
          chave_nfe: "35260712345678000199550010000000041000000044",
          tipo: "saida",
          cnpj_destinatario: "12345678909",
          valor_total: 250,
          data_emissao: "2026-07-15",
        },
        {
          id: "nfe-entrada",
          tipo: "entrada",
          valor_total: 999,
          data_emissao: "2026-07-15",
        },
      ],
      historicoReceita: [],
      mes: 7,
      ano: 2026,
      hojeISO: "2026-09-25",
    });

    assert.equal(bases.receitaMes, 250);
  });

  it("exclui NF-e com data de emissão futura da RBT12 e da receita (BUG-APUR-08)", async () => {
    const agora = new Date();
    const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
    const dataFutura = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
    // Competência = mês de amanhã (ainda aberto / futuro civil).
    const mesCompetencia = amanha.getMonth() + 1;
    const anoCompetencia = amanha.getFullYear();
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const mesFechadoDate = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const dataFechada = `${mesFechadoDate.getFullYear()}-${String(mesFechadoDate.getMonth() + 1).padStart(2, "0")}-15`;

    const bases = montarBasesCalculo({
      notas: [
      {
        id: "nfe-futura",
        chave_nfe: "35261200000000000000550010000000061000000060",
        tipo: "saida",
        valor_total: 50000,
        data_emissao: dataFutura,
      },
      {
        id: "nfe-ok",
        chave_nfe: "35250800000000000000550010000000071000000070",
        tipo: "saida",
        valor_total: 40000,
        data_emissao: dataFechada,
      },
      ],
      historicoReceita: [],
      mes: mesCompetencia,
      ano: anoCompetencia,
      hojeISO,
    });

    assert.equal(bases.receitaMes, 0);
    assert.equal(bases.rbt12, 40000);
    const excluida = bases.notasFiscais.excluidas.find((n) => n.id === "nfe-futura");
    assert.match(excluida.motivo, /data de emissão futura/i);
  });

  it("422 quando faltam meses de folha na janela completa do Fator R", async () => {
    queueSemDuplicata();
    queueCliente("V");
    queueNotas([
      { valor_total: 50000, data_emissao: "2026-07-10" },
      { valor_total: 50000, data_emissao: "2026-08-10" },
    ]);
    queue("processamentos_folha", "await", {
      data: processamentosDosDozeMeses().slice(0, 11),
      error: null,
    });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "FATOR_R_SEM_FOLHA");
  });

  it("400 quando mes/ano/regime faltando", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: { clienteId: CLIENTE_A, mes: 8, ano: 2026 } }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "mes, ano e regime são obrigatórios");
  });

  it("400 com mensagem de faixa quando mes=0 (não confundir com ausente)", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ mes: 0 }) }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020");
  });

  // #497 — competência futura ou mês corrente ainda aberto não podem ser
  // apurados: a janela de RBT12 somaria meses incompletos e o DAS sairia
  // abaixo do devido. Os períodos são derivados de ultimaCompetenciaFechada()
  // para o teste não caducar com a passagem dos meses.
  it("422 COMPETENCIA_NAO_FECHADA quando a competência é o mês corrente", async () => {
    const ultima = ultimaCompetenciaFechada();
    const corrente = ultima.mes === 12 ? { ano: ultima.ano + 1, mes: 1 } : { ano: ultima.ano, mes: ultima.mes + 1 };

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido(corrente) }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "COMPETENCIA_NAO_FECHADA");
    assert.equal(res.body.competencia_maxima, `${ultima.ano}-${String(ultima.mes).padStart(2, "0")}`);
    assert.deepEqual(operacoes, []);
  });

  it("422 COMPETENCIA_NAO_FECHADA quando a competência é de um ano futuro", async () => {
    const ultima = ultimaCompetenciaFechada();

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ ano: ultima.ano + 1, mes: 6 }) }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "COMPETENCIA_NAO_FECHADA");
    assert.deepEqual(operacoes, []);
  });

  it("201 na última competência já fechada", async () => {
    const ultima = ultimaCompetenciaFechada();
    queueSemDuplicata();
    queueCliente("I");
    queueNotas([]);
    queue("apuracoes", "single", { data: { id: "nova-apuracao", status: "rascunho" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido(ultima) }), res);

    assert.equal(res.statusCode, 201);
    const insert = operacoes.find((operacao) => operacao.metodo === "insert");
    assert.equal(insert.payload.periodo_mes, ultima.mes);
    assert.equal(insert.payload.periodo_ano, ultima.ano);
  });

  it("400 quando mes está fora do intervalo 1-12", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ mes: 15 }) }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020");
  });

  it("400 quando ano é anterior a 2020", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ ano: 1999 }) }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020");
  });

  it("400 quando mes contém sufixo não numérico", async () => {
    for (const mes of ["8abc", true]) {
      const res = criarResposta();
      await dispararApuracao(reqAdmin({ body: payloadValido({ mes }) }), res);
      assert.equal(res.statusCode, 400);
    }
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem body.clienteId)", async () => {
    const req = reqAdmin({
      usuario: { perfil: PERFIS.ADMIN_EFFICIENCE },
      body: payloadValido({ clienteId: undefined }),
    });
    const res = criarResposta();
    await dispararApuracao(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("409 quando insert colide por unique_violation (corrida entre chamadas concorrentes)", async () => {
    queueSemDuplicata();
    queueCliente("I");
    queueNotas([{ valor_total: 45000, data_emissao: "2026-08-10" }]);
    queue("apuracoes", "single", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// BUG-APUR-07 — RBT12 proporcional no início de atividade
// (LC 123/2006 art. 18 §2º; Res. CGSN 140/2018 art. 22)
// ---------------------------------------------------------------------------

describe("RBT12 proporcional no início de atividade (BUG-APUR-07)", () => {
  const HOJE = "2026-09-25";
  const notasSaida = (pares) => pares.map(([data_emissao, valor_total]) => ({ tipo: "saida", data_emissao, valor_total }));
  const tresMesesDe50k = notasSaida([["2026-06-15", 50000], ["2026-07-15", 50000], ["2026-08-15", 50000]]);

  it("2º/3º mês de atividade: média dos meses anteriores × 12 (cenário QA-F2 Inicio Atividade)", () => {
    const bases = montarBasesCalculo({
      notas: tresMesesDe50k,
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.rbt12Metodo, "proporcional_inicio_atividade");
    assert.equal(bases.mesesAtividade, 2);
    // Meses anteriores ao início não aparecem como "R$ 0,00" na composição.
    assert.deepEqual(bases.rbt12Mensal.map((item) => item.referencia), ["2026-06", "2026-07"]);

    const resultado = calcularSimplesNacional({ rbt12: bases.rbt12, receita_mes: bases.receitaMes, anexo: "I" });
    assert.equal(resultado.faixa_limite, 720000);
    assert.equal(resultado.valor_das, 3595);
  });

  it("1º mês de atividade: receita do próprio mês × 12", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-08-15", 50000]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-08-01",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.mesesAtividade, 0);
    assert.equal(bases.rbt12Mensal.length, 0);
  });

  it("um único mês anterior: receita desse mês × 12", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-07-15", 40000], ["2026-08-15", 50000]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-07-20",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 480000);
    assert.equal(bases.mesesAtividade, 1);
  });

  it("arredonda só no final (média não exata)", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-05-10", 10000], ["2026-06-10", 10000], ["2026-07-10", 10000.01], ["2026-08-10", 1]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-05-01",
      hojeISO: HOJE,
    });

    // (30000,01 / 3) × 12 = 120000,04 — arredondar a média antes daria 120000,00.
    assert.equal(bases.rbt12, 120000.04);
  });

  it("sem data_inicio_atividade mantém a janela de 12 meses (comportamento anterior)", () => {
    const bases = montarBasesCalculo({
      notas: tresMesesDe50k,
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: null,
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 100000);
    assert.equal(bases.rbt12Metodo, "janela_12_meses");
    assert.equal(bases.mesesAtividade, null);
    assert.equal(bases.rbt12Mensal.length, 12);
  });

  it("ignora histórico manual e NF-e anteriores ao início de atividade", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-05-10", 77777], ["2026-06-15", 50000], ["2026-07-15", 50000], ["2026-08-15", 50000]]),
      historicoReceita: [{ mes: 4, ano: 2026, receita: 88888 }],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    const excluida = bases.notasFiscais.excluidas.find((nota) => nota.data_emissao === "2026-05-10");
    assert.match(excluida.motivo, /antes do início de atividade/);
  });

  it("recusa competência anterior ao início de atividade", () => {
    const bases = montarBasesCalculo({
      notas: [],
      historicoReceita: [],
      mes: 5,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.erro, "PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE");
  });

  it("recusa data_inicio_atividade malformada em vez de cair na janela cheia", () => {
    const bases = montarBasesCalculo({
      notas: [],
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "10/06/2026",
      hojeISO: HOJE,
    });

    assert.match(bases.erro, /início de atividade inválida/);
  });

  // Regressão dos cenários do QA-F (2ª passagem, 2026-09-25): com início há
  // ≥ 12 meses o resultado é idêntico ao de sem data de início.
  describe("início há ≥ 12 meses mantém os DAS do QA-F", () => {
    const mesesDe = (inicio, fim, valor) => {
      const linhas = [];
      for (let indice = inicio[0] * 12 + inicio[1] - 1; indice <= fim[0] * 12 + fim[1] - 1; indice += 1) {
        linhas.push([`${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-15`, valor]);
      }
      return notasSaida(linhas);
    };
    const historicoComercio = [{ mes: 8, ano: 2025, receita: 20000 }, { mes: 9, ano: 2025, receita: 99999 }];
    const historicoAnexoIII = mesesDe([2025, 8], [2026, 7], 15000).map((nota) => ({
      ano: Number(nota.data_emissao.slice(0, 4)),
      mes: Number(nota.data_emissao.slice(5, 7)),
      receita: nota.valor_total,
    }));

    const cenarios = [
      { nome: "Comercio Anexo I 08/2026", notas: mesesDe([2025, 9], [2026, 8], 20000), historico: historicoComercio, mes: 8, anexo: "I", folha12: null, das: 965 },
      { nome: "Comercio Anexo I 07/2026", notas: mesesDe([2025, 9], [2026, 8], 20000), historico: historicoComercio, mes: 7, anexo: "I", folha12: null, das: 920 },
      { nome: "Servicos V FatorR 40", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 144000, das: 2580 },
      { nome: "Servicos V FatorR 16", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 60000, das: 5025 },
      { nome: "Servicos V FatorR 28", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 100800, das: 2580 },
      { nome: "Anexo III So Historico", notas: notasSaida([["2026-08-15", 10000]]), historico: historicoAnexoIII, mes: 8, anexo: "III", folha12: null, das: 600 },
    ];

    for (const cenario of cenarios) {
      it(`${cenario.nome} → DAS ${cenario.das}`, () => {
        const calcular = (dataInicioAtividade) => {
          const bases = montarBasesCalculo({
            notas: cenario.notas,
            historicoReceita: cenario.historico,
            mes: cenario.mes,
            ano: 2026,
            dataInicioAtividade,
            hojeISO: HOJE,
          });
          const resultado = calcularSimplesNacional({
            rbt12: bases.rbt12,
            receita_mes: bases.receitaMes,
            anexo: cenario.anexo,
            folha12: cenario.folha12,
          });
          return { bases, resultado };
        };

        const comInicio = calcular("2024-01-15");
        const semInicio = calcular(null);

        assert.equal(comInicio.resultado.valor_das, cenario.das);
        assert.equal(semInicio.resultado.valor_das, cenario.das);
        assert.equal(comInicio.bases.rbt12, semInicio.bases.rbt12);
        assert.equal(comInicio.bases.rbt12Metodo, "janela_12_meses");
      });
    }
  });

  it("POST grava o DAS proporcional e expõe rbt12_metodo/meses_atividade", async () => {
    queueSemDuplicata();
    queueCliente("I", { data_inicio_atividade: "2026-06-10" });
    queueNotas(tresMesesDe50k);
    queue("apuracoes", "single", { data: { id: "nova-apuracao" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    const insert = operacoes.find((operacao) => operacao.tabela === "apuracoes" && operacao.metodo === "insert");
    assert.equal(insert.payload.rbt12_usado, 600000);
    assert.equal(insert.payload.valor_calculado, 3595);
    assert.equal(res.body.rbt12_metodo, "proporcional_inicio_atividade");
    assert.equal(res.body.meses_atividade, 2);
  });

  it("POST sem data_inicio_atividade responde janela_12_meses com o DAS antigo", async () => {
    queueSemDuplicata();
    queueCliente("I");
    queueNotas(tresMesesDe50k);
    queue("apuracoes", "single", { data: { id: "nova-apuracao" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.rbt12, 100000);
    assert.equal(res.body.valor_calculado, 2000);
    assert.equal(res.body.rbt12_metodo, "janela_12_meses");
    assert.equal(res.body.meses_atividade, null);
  });

  it("GET /apuracoes/:id deriva rbt12_metodo/meses_atividade do cadastro", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        cliente_id: CLIENTE_A,
        periodo_mes: 8,
        periodo_ano: 2026,
        rbt12_usado: 600000,
        receita_mes: 50000,
        anexo: "I",
        fator_r: null,
        folha12: null,
      },
      error: null,
    });
    queueCliente("I", { data_inicio_atividade: "2026-06-10" });
    queueNotas(tresMesesDe50k);

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rbt12_metodo, "proporcional_inicio_atividade");
    assert.equal(res.body.meses_atividade, 2);
    assert.equal(res.body.valor_calculado, 3595);
    assert.equal(res.body.breakdown_desatualizado, false);
  });
});

// ---------------------------------------------------------------------------
// GET /apuracoes
// ---------------------------------------------------------------------------

describe("GET /apuracoes", () => {
  it("200 com apurações filtradas por cliente + período", async () => {
    queue("apuracoes", "await", {
      data: [{ id: "1", periodo_mes: 8, periodo_ano: 2026 }],
      error: null,
    });

    const res = criarResposta();
    await listarApuracoes(reqAdmin({ query: { mes: "8", ano: "2026" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem query)", async () => {
    const req = reqAdmin({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await listarApuracoes(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("apuracoes", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarApuracoes(reqAdmin(), res);

    assert.equal(res.statusCode, 500);
  });

  it("400 quando um filtro de período é malformado", async () => {
    const res = criarResposta();
    await listarApuracoes(reqAdmin({ query: { mes: "8abc", ano: "2026" } }), res);

    assert.equal(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// GET /apuracoes/:id
// ---------------------------------------------------------------------------

describe("GET /apuracoes/:id", () => {
  it("200 com o detalhe completo quando a apuração pertence ao cliente", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        cliente_id: CLIENTE_A,
        periodo_mes: 8,
        periodo_ano: 2026,
        regime: "simples_nacional",
        rbt12_usado: 40000,
        receita_mes: 45000,
        anexo: "I",
        fator_r: null,
        folha12: null,
        aliquota_efetiva: 0.04,
        valor_calculado: 1800,
      },
      error: null,
    });
    queueCliente("I", { nome: "Cliente Teste" });
    queueNotas([
      { tipo: "saida", valor_total: 40000, data_emissao: "2025-09-15", status: "ativa" },
      { tipo: "saida", valor_total: 45000, data_emissao: "2026-08-10", status: "ativa" },
      { tipo: "saida", valor_total: 999999, data_emissao: "2026-08-11", status: "cancelada" },
    ]);

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, APURACAO_ID);
    assert.equal(res.body.cliente_nome, "Cliente Teste");
    assert.equal(res.body.anexo_efetivo, "I");
    assert.equal(res.body.aliquota_nominal, 0.04);
    assert.equal(res.body.rbt12_mensal.length, 12);
    assert.equal(res.body.breakdown_desatualizado, false);
    assert.equal(res.body.notas_fiscais.consideradas.length, 2);
  });

  it("sinaliza breakdown desatualizado quando uma NF-e da janela mudou após a criação (#499)", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        cliente_id: CLIENTE_A,
        periodo_mes: 8,
        periodo_ano: 2026,
        regime: "simples_nacional",
        rbt12_usado: 40000,
        receita_mes: 45000,
        anexo: "I",
        fator_r: null,
        folha12: null,
        aliquota_efetiva: 0.04,
        valor_calculado: 1800,
      },
      error: null,
    });
    queueCliente("I");
    // NF-e da janela passou de 40000 para 55000 depois da criação.
    queueNotas([
      { tipo: "saida", valor_total: 55000, data_emissao: "2025-09-15" },
      { tipo: "saida", valor_total: 45000, data_emissao: "2026-08-10" },
    ]);

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    // Headline segue o persistido; o breakdown reflete os lançamentos atuais.
    assert.equal(res.body.rbt12_usado, 40000);
    assert.equal(res.body.valor_calculado, 1800);
    assert.equal(res.body.breakdown_desatualizado, true);
    assert.deepEqual(res.body.breakdown_divergencia, {
      rbt12_persistido: 40000,
      rbt12_reconstruido: 55000,
      receita_mes_persistida: 45000,
      receita_mes_reconstruida: 45000,
    });
  });

  it("reconstrói o anexo original e a migração do Fator R no detalhe", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        cliente_id: CLIENTE_A,
        periodo_mes: 8,
        periodo_ano: 2026,
        regime: "simples_nacional",
        rbt12_usado: 100000,
        receita_mes: 50000,
        anexo: "III",
        fator_r: 0.3,
        folha12: 30000,
        aliquota_efetiva: 0.06,
        valor_calculado: 3000,
      },
      error: null,
    });
    queueCliente("V");
    queueNotas([
      { tipo: "saida", valor_total: 100000, data_emissao: "2026-07-15" },
      { tipo: "saida", valor_total: 50000, data_emissao: "2026-08-10" },
    ]);

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.anexo_original, "V");
    assert.equal(res.body.anexo_efetivo, "III");
    assert.equal(res.body.fator_r, 0.3);
  });

  it("404 quando a apuração não existe", async () => {
    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });

  it("404 (não 403) quando a apuração pertence a outro cliente", async () => {
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_B },
      error: null,
    });

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /apuracoes/:id
// ---------------------------------------------------------------------------

describe("PATCH /apuracoes/:id", () => {
  it("200 e registra histórico de edição", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        cliente_id: CLIENTE_A,
        status: "rascunho",
        valor_editado: null,
        valor_calculado: 2790,
        historico_edicoes: [],
      },
      error: null,
    });
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        valor_editado: 2500,
        historico_edicoes: [{ valor_novo: 2500, editado_por: "contador@teste.com" }],
      },
      error: null,
    });

    const res = criarResposta();
    await editarApuracao(
      reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado: 2500, motivo: "ajuste de ICMS-ST" } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valor_editado, 2500);
    assert.equal(res.body.historico_edicoes.length, 1);
    assert.equal(res.body.historico_edicoes[0].editado_por, "contador@teste.com");
  });

  it("400 quando valor_editado é negativo ou não numérico", async () => {
    for (const valor_editado of [-1, "valor-inválido", "", "  ", false, []]) {
      const res = criarResposta();
      await editarApuracao(
        reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado, motivo: "ajuste" } }),
        res,
      );
      assert.equal(res.statusCode, 400);
    }
  });

  it("409 quando a apuração é aprovada entre a leitura e a edição", async () => {
    queue("apuracoes", "maybeSingle", {
      data: {
        cliente_id: CLIENTE_A,
        status: "rascunho",
        valor_editado: null,
        valor_calculado: 2790,
        historico_edicoes: [],
      },
      error: null,
    });
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await editarApuracao(
      reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado: 2500, motivo: "ajuste" } }),
      res,
    );

    assert.equal(res.statusCode, 409);
  });

  it("409 quando a apuração já está aprovada", async () => {
    queue("apuracoes", "maybeSingle", {
      data: { cliente_id: CLIENTE_A, status: "aprovado" },
      error: null,
    });

    const res = criarResposta();
    await editarApuracao(
      reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado: 2500, motivo: "tarde demais" } }),
      res,
    );

    assert.equal(res.statusCode, 409);
  });

  it("400 quando motivo não é fornecido", async () => {
    queue("apuracoes", "maybeSingle", {
      data: { cliente_id: CLIENTE_A, status: "rascunho", historico_edicoes: [] },
      error: null,
    });

    const res = criarResposta();
    await editarApuracao(
      reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado: 2500 } }),
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  it("404 quando a apuração pertence a outro cliente", async () => {
    queue("apuracoes", "maybeSingle", {
      data: { cliente_id: CLIENTE_B, status: "rascunho" },
      error: null,
    });

    const res = criarResposta();
    await editarApuracao(
      reqAdmin({ params: { id: APURACAO_ID }, body: { valor_editado: 2500, motivo: "x" } }),
      res,
    );

    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /apuracoes/:id/aprovar
// ---------------------------------------------------------------------------

describe("PATCH /apuracoes/:id/aprovar", () => {
  it("200 e marca como aprovado", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho", periodo_mes: 8, periodo_ano: 2026 }, error: null });
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, status: "aprovado", aprovado_por: "contador@teste.com" },
      error: null,
    });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "aprovado");
    assert.equal(res.body.aprovado_por, "contador@teste.com");
  });

  it("409 quando outra requisição aprova entre a leitura e a atualização", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho", periodo_mes: 8, periodo_ano: 2026 }, error: null });
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  // #497 — registros de competência futura anteriores à validação de criação
  // continuavam aprováveis, que é o sintoma descrito na issue.
  it("422 COMPETENCIA_NAO_FECHADA quando a competência ainda não fechou", async () => {
    const ultima = ultimaCompetenciaFechada();
    queue("apuracoes", "maybeSingle", {
      data: { cliente_id: CLIENTE_A, status: "rascunho", periodo_mes: 6, periodo_ano: ultima.ano + 1 },
      error: null,
    });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "COMPETENCIA_NAO_FECHADA");
    assert.deepEqual(operacoes, []);
  });

  it("409 quando já está aprovada", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "aprovado" }, error: null });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando a apuração pertence a outro cliente", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_B, status: "rascunho", periodo_mes: 8, periodo_ano: 2026 }, error: null });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });
});

describe("DELETE /apuracoes/:id", () => {
  it("204 e remove o rascunho", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: { id: APURACAO_ID, status: "rascunho" }, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 204);
    assert.equal(res.body, null);
    assert.equal(operacoes.filter((op) => op.tabela === "apuracoes" && op.metodo === "delete").length, 1);
  });

  it("409 quando já está aprovada", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "aprovado" }, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(operacoes.filter((op) => op.metodo === "delete").length, 0);
  });

  it("409 quando outra requisição aprova entre a leitura e o delete", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando a apuração pertence a outro cliente", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_B, status: "rascunho" }, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
    assert.equal(operacoes.filter((op) => op.metodo === "delete").length, 0);
  });

  it("404 quando a apuração não existe", async () => {
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });

  it("admin_efficience remove rascunho de qualquer cliente", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_B, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: { id: APURACAO_ID, status: "rascunho" }, error: null });

    const res = criarResposta();
    await excluirApuracao(
      reqAdmin({
        params: { id: APURACAO_ID },
        usuario: { perfil: PERFIS.ADMIN_EFFICIENCE, id: "admin-1", email: "admin@efficience.com" },
      }),
      res,
    );

    assert.equal(res.statusCode, 204);
  });

  it("500 quando o banco falha no delete", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: null, error: { message: "timeout" } });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// BUG-APUR-13 / #613 — id/clienteId não-UUID não pode virar 500 (22P02)
// ---------------------------------------------------------------------------

describe("validação de UUID em /apuracoes (BUG-APUR-13)", () => {
  const ID_INVALIDO = "abc";
  const ID_INEXISTENTE = "99999999-9999-9999-9999-999999999999";

  it("POST /apuracoes com clienteId não-UUID → 400", async () => {
    // admin_efficience lê clienteId do body — é o caminho que o QA reproduziu.
    const res = criarResposta();
    await dispararApuracao(
      reqAdmin({
        usuario: { perfil: PERFIS.ADMIN_EFFICIENCE, id: "admin-1", email: "admin@efficience.com" },
        body: payloadValido({ clienteId: ID_INVALIDO }),
      }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "clienteId inválido");
    assert.equal(operacoes.length, 0);
  });

  it("GET /apuracoes com clienteId não-UUID → 400", async () => {
    const res = criarResposta();
    await listarApuracoes(
      reqAdmin({
        usuario: { perfil: PERFIS.ADMIN_EFFICIENCE, id: "admin-1", email: "admin@efficience.com" },
        query: { clienteId: ID_INVALIDO },
      }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "clienteId inválido");
  });

  it("GET /apuracoes?mes=abc → 400 com mensagem de faixa", async () => {
    const res = criarResposta();
    await listarApuracoes(reqAdmin({ query: { mes: "abc" } }), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.erro, "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020");
  });

  for (const [nome, handler] of [
    ["GET /apuracoes/:id", detalharApuracao],
    ["PATCH /apuracoes/:id", editarApuracao],
    ["PATCH /apuracoes/:id/aprovar", aprovarApuracao],
    ["PATCH /apuracoes/:id/recalcular", recalcularApuracao],
    ["DELETE /apuracoes/:id", excluirApuracao],
  ]) {
    it(`${nome} com id não-UUID → 404 (sem consultar o banco)`, async () => {
      const res = criarResposta();
      await handler(
        reqAdmin({
          params: { id: ID_INVALIDO },
          body: { valor_editado: 1, motivo: "x" },
        }),
        res,
      );

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.erro, "Apuração não encontrada");
      assert.equal(operacoes.length, 0);
    });
  }

  it("GET /apuracoes/:id com UUID válido inexistente → 404 (regressão)", async () => {
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: ID_INEXISTENTE } }), res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.erro, "Apuração não encontrada");
  });
});
