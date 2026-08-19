import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  dispararApuracao,
  listarApuracoes,
  detalharApuracao,
  editarApuracao,
  aprovarApuracao,
} from "../src/controllers/apuracoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const APURACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
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
    insert() { return builder; },
    update() { return builder; },
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

beforeEach(() => filas.clear());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function reqAdmin(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A, id: "user-1" },
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

function queueCliente(anexo_simples) {
  queue("clientes", "maybeSingle", { data: { anexo_simples }, error: null });
}

function queueNotas(linhas) {
  queue("lancamentos_fiscais", "await", { data: linhas, error: null });
}

// ---------------------------------------------------------------------------
// POST /apuracoes
// ---------------------------------------------------------------------------

describe("POST /apuracoes", () => {
  it("201 e persiste quando payload válido (Anexo I, sem Fator R)", async () => {
    queueSemDuplicata();
    queueCliente("I");
    queueNotas([
      { valor_total: 40000, data_emissao: "2025-09-15" },
      { valor_total: 45000, data_emissao: "2026-08-10" },
    ]);
    queue("apuracoes", "single", { data: { id: "nova-apuracao", status: "rascunho" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, "nova-apuracao");
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
    queueNotas([{ valor_total: 50000, data_emissao: "2026-08-10" }]);
    queue("processamentos_folha", "await", { data: [{ id: "proc-1" }], error: null });
    queue("folha_calculos", "await", { data: [{ salario_bruto: 20000 }], error: null });
    queue("apuracoes", "single", { data: { id: "nova-apuracao-v", anexo: "III" }, error: null });

    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido() }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.anexo, "III");
  });

  it("400 quando mes/ano/regime faltando", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: { clienteId: CLIENTE_A, mes: 8, ano: 2026 } }), res);

    assert.equal(res.statusCode, 400);
  });

  it("400 quando mes está fora do intervalo 1-12", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ mes: 15 }) }), res);

    assert.equal(res.statusCode, 400);
  });

  it("400 quando ano é anterior a 2020", async () => {
    const res = criarResposta();
    await dispararApuracao(reqAdmin({ body: payloadValido({ ano: 1999 }) }), res);

    assert.equal(res.statusCode, 400);
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
});

// ---------------------------------------------------------------------------
// GET /apuracoes/:id
// ---------------------------------------------------------------------------

describe("GET /apuracoes/:id", () => {
  it("200 com o detalhe completo quando a apuração pertence ao cliente", async () => {
    queue("apuracoes", "maybeSingle", {
      data: { id: APURACAO_ID, cliente_id: CLIENTE_A, valor_calculado: 2790 },
      error: null,
    });

    const res = criarResposta();
    await detalharApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, APURACAO_ID);
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
    queue("apuracoes", "single", {
      data: { id: APURACAO_ID, valor_editado: 2500, historico_edicoes: [{ valor_novo: 2500 }] },
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
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "single", {
      data: { id: APURACAO_ID, status: "aprovado", aprovado_por: "user-1" },
      error: null,
    });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "aprovado");
  });

  it("409 quando já está aprovada", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "aprovado" }, error: null });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando a apuração pertence a outro cliente", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_B, status: "rascunho" }, error: null });

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });
});
