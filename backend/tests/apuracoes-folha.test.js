import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  listarFolhaPendente,
  registrarResultadoFolha,
  recalcularApuracao,
} from "../src/controllers/apuracoes.controller.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const APURACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase — mesmo padrão de apuracoes.test.js
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const operacoes = [];
const chamadasPorTabela = new Map();
function chave(t, m) {
  return `${t}:${m}`;
}
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}
function chamadasTabela(tabela) {
  return chamadasPorTabela.get(tabela) || 0;
}

supabase.from = function (tabela) {
  chamadasPorTabela.set(tabela, (chamadasPorTabela.get(tabela) || 0) + 1);
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() {
      return builder;
    },
    insert(payload) {
      operacoes.push({ tabela, metodo: "insert", payload });
      return builder;
    },
    update(payload) {
      operacoes.push({ tabela, metodo: "update", payload });
      return builder;
    },
    eq() {
      return builder;
    },
    not() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle", { data: null, error: null }));
    },
    single() {
      return Promise.resolve(consumir("single", { data: null, error: null }));
    },
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
  chamadasPorTabela.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
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

function tokenLicencaValido(clienteId = CLIENTE_A) {
  queue("licencas", "single", {
    data: { cliente_id: clienteId, ativa: true, validade: null },
    error: null,
  });
}

function reqAgente({ headers = {}, params = {}, body = {} } = {}) {
  return { headers, params, body };
}

function queueCliente(overrides = {}) {
  queue("clientes", "maybeSingle", { data: { historico_receita: [], ...overrides }, error: null });
}

function queueNotas(linhas = []) {
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
// GET /apuracoes/folha-pendente
// ---------------------------------------------------------------------------

describe("GET /apuracoes/folha-pendente (#365)", () => {
  it("401 quando token de licença é inválido", async () => {
    const res = criarResposta();
    await listarFolhaPendente(reqAgente(), res);
    assert.equal(res.statusCode, 401);
  });

  it("200 com lista vazia quando não há apurações pendentes (sem query desnecessária em clientes)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", { data: [], error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(chamadasTabela("clientes"), 0);
  });

  it("200 retorna apurações Anexo V pendentes do cliente da licença, com nomeEmpresa (agente localiza pasta pelo nome, não por UUID)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      data: [{ id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 3, periodo_ano: 2026 }],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade" }, error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, [
      { id: APURACAO_ID, clienteId: CLIENTE_A, nomeEmpresa: "Souza Contabilidade", mes: 3, ano: 2026 },
    ]);
  });

  it("busca o nome do cliente em uma única query mesmo com várias apurações pendentes (sem N+1)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      data: [
        { id: "apuracao-1", cliente_id: CLIENTE_A, periodo_mes: 1, periodo_ano: 2026 },
        { id: "apuracao-2", cliente_id: CLIENTE_A, periodo_mes: 2, periodo_ano: 2026 },
      ],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade" }, error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.every((item) => item.nomeEmpresa === "Souza Contabilidade"), true);
    assert.equal(chamadasTabela("clientes"), 1);
  });

  it("500 quando a consulta de apurações falha", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 500);
  });

  it("500 quando a busca do nome do cliente falha", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      data: [{ id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 3, periodo_ano: 2026 }],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// POST /apuracoes/:id/resultado-folha
// ---------------------------------------------------------------------------

describe("POST /apuracoes/:id/resultado-folha (#365)", () => {
  it("401 quando token de licença é inválido", async () => {
    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({ params: { id: APURACAO_ID }, body: { temDozeMeses: true, mesesEncontrados: [], totalMesesEncontrados: 0 } }),
      res,
    );
    assert.equal(res.statusCode, 401);
  });

  it("400 quando temDozeMeses não é booleano", async () => {
    tokenLicencaValido(CLIENTE_A);
    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: "sim", mesesEncontrados: [], totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("400 quando mesesEncontrados não é lista", async () => {
    tokenLicencaValido(CLIENTE_A);
    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: "nao é lista", totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("400 quando totalMesesEncontrados não bate com o tamanho de mesesEncontrados", async () => {
    tokenLicencaValido(CLIENTE_A);
    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: [{ mes: 1, ano: 2026 }], totalMesesEncontrados: 12 },
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("404 quando a apuração não existe", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: [], totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 404);
  });

  it("404 quando a apuração pertence a outro cliente (isolamento multi-tenant)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_B, status: "rascunho", fator_r: 0.1 },
      error: null,
    });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: [], totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 404);
    assert.equal(operacoes.length, 0);
  });

  it("400 quando a apuração não é do Anexo V (fator_r nulo)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_A, status: "rascunho", fator_r: null },
      error: null,
    });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: [], totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(operacoes.length, 0);
  });

  it("409 quando a apuração já está aprovada", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_A, status: "aprovado", fator_r: 0.1 },
      error: null,
    });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados: [], totalMesesEncontrados: 0 },
      }),
      res,
    );
    assert.equal(res.statusCode, 409);
    assert.equal(operacoes.length, 0);
  });

  it("200 marca folha_status = verificado quando temDozeMeses é true e persiste dados_folha", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_A, status: "rascunho", fator_r: 0.1 },
      error: null,
    });
    const mesesEncontrados = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ano: 2026 }));
    queue("apuracoes", "single", { data: { id: APURACAO_ID, folha_status: "verificado" }, error: null });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: true, mesesEncontrados, totalMesesEncontrados: 12 },
      }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.folha_status, "verificado");

    const update = operacoes.find((op) => op.tabela === "apuracoes" && op.metodo === "update");
    assert.equal(update.payload.folha_status, "verificado");
    assert.deepEqual(update.payload.dados_folha, { temDozeMeses: true, mesesEncontrados, totalMesesEncontrados: 12 });
  });

  it("200 marca folha_status = sem_dados quando temDozeMeses é false", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_A, status: "rascunho", fator_r: 0.1 },
      error: null,
    });
    queue("apuracoes", "single", { data: { id: APURACAO_ID, folha_status: "sem_dados" }, error: null });

    const res = criarResposta();
    await registrarResultadoFolha(
      reqAgente({
        headers: { "x-licenca-token": "token-valido" },
        params: { id: APURACAO_ID },
        body: { temDozeMeses: false, mesesEncontrados: [{ mes: 1, ano: 2026 }], totalMesesEncontrados: 1 },
      }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.folha_status, "sem_dados");
  });
});

// ---------------------------------------------------------------------------
// PATCH /apuracoes/:id/recalcular (#365 — fecha o loop do polling de folha)
// ---------------------------------------------------------------------------

describe("PATCH /apuracoes/:id/recalcular", () => {
  function queueApuracaoBase(overrides = {}) {
    queue("apuracoes", "maybeSingle", {
      data: {
        id: APURACAO_ID,
        cliente_id: CLIENTE_A,
        periodo_mes: 8,
        periodo_ano: 2026,
        status: "rascunho",
        anexo: "I",
        fator_r: null,
        ...overrides,
      },
      error: null,
    });
  }

  it("404 quando a apuração não existe", async () => {
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });

  it("404 quando a apuração pertence a outro cliente", async () => {
    queueApuracaoBase({ cliente_id: CLIENTE_B });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });

  it("409 quando a apuração já está aprovada", async () => {
    queueApuracaoBase({ status: "aprovado" });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("422 FATOR_R_SEM_FOLHA quando Anexo V ainda sem processamentos de folha completos", async () => {
    queueApuracaoBase({ anexo: "III", fator_r: 0.35 });
    queueCliente();
    queueNotas([{ valor_total: 30000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("processamentos_folha", "await", { data: [], error: null });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.erro, "FATOR_R_SEM_FOLHA");
  });

  it("200 recalcula Anexo I com os lançamentos fiscais atuais e limpa valor_editado antigo", async () => {
    queueApuracaoBase();
    queueCliente();
    queueNotas([{ valor_total: 60000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, status: "rascunho", valor_calculado: 2400, valor_editado: null },
      error: null,
    });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valor_editado, null);

    const update = operacoes.find((op) => op.tabela === "apuracoes" && op.metodo === "update");
    assert.equal(update.payload.valor_editado, null);
    // Anexo fora do V — folha_status não é relevante (fator_r fica null,
    // fora do filtro do polling), mas segue o default por consistência.
    assert.equal(update.payload.folha_status, "pendente");
  });

  it("200 recalcula Anexo V (fator_r preenchido = originalmente V) reconstituindo folha", async () => {
    queueApuracaoBase({ anexo: "III", fator_r: 0.4 });
    queueCliente();
    queueNotas([{ valor_total: 100000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("processamentos_folha", "await", { data: processamentosDosDozeMeses(), error: null });
    queue("folha_calculos", "await", { data: [{ base_calculo: 40000, fgts: 3200 }], error: null });
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, status: "rascunho", anexo: "III" },
      error: null,
    });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);

    const update = operacoes.find((op) => op.tabela === "apuracoes" && op.metodo === "update");
    assert.ok(update.payload.fator_r > 0);
    // #365 — folha reconstituída com sucesso no recálculo (semDadosFolha:
    // false) não deve deixar a apuração pendente na fila do agente. Mesmo
    // achado do PR #366 (Vinícius), aplicado também ao caminho de recálculo.
    assert.equal(update.payload.folha_status, "verificado");
  });

  it("409 quando a apuração foi aprovada entre a leitura e o recálculo (trava otimista)", async () => {
    queueApuracaoBase();
    queueCliente();
    queueNotas([{ valor_total: 10000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });
});
