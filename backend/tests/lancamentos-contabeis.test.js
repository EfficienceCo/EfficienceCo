import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarLancamentoContabil,
  listarLancamentosContabeis,
  atualizarLancamentoContabil,
  deletarLancamentoContabil,
} from "../src/controllers/lancamentos-contabeis.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const LANCAMENTO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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
    delete() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
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
    send(payload) { this.body = payload; return this; },
  };
}

function reqAdmin(body, overrides = {}) {
  return {
    body: body ?? {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
    ...overrides,
  };
}

function payloadValido(overrides = {}) {
  return {
    cliente_id: CLIENTE_A,
    data_lancamento: "2026-08-05",
    valor: 1500.0,
    tipo: "debito",
    descricao: "Pagamento fornecedor ABC",
    categoria: "fornecedor",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("POST /lancamentos-contabeis", () => {
  it("201 e persiste quando payload válido", async () => {
    queue("lancamentos_contabeis", "single", { data: { id: "novo-id", ...payloadValido() }, error: null });

    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido()), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, "novo-id");
  });

  it("400 quando campo obrigatório está faltando", async () => {
    const { descricao, ...semDescricao } = payloadValido();

    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(semDescricao), res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.faltando.includes("descricao"));
  });

  it("400 quando tipo não é credito nem debito", async () => {
    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido({ tipo: "transferencia" })), res);

    assert.equal(res.statusCode, 400);
  });

  it("403 quando cliente_id do payload não corresponde ao usuário autenticado", async () => {
    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido({ cliente_id: CLIENTE_B })), res);

    assert.equal(res.statusCode, 403);
  });

  it("500 quando o Supabase retorna erro no insert", async () => {
    queue("lancamentos_contabeis", "single", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await criarLancamentoContabil(reqAdmin(payloadValido()), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-contabeis
// ---------------------------------------------------------------------------

describe("GET /lancamentos-contabeis", () => {
  it("200 com a lista de lançamentos do cliente", async () => {
    queue("lancamentos_contabeis", "await", {
      data: [
        { id: "1", data_lancamento: "2026-08-05" },
        { id: "2", data_lancamento: "2026-08-01" },
      ],
      error: null,
    });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: {} }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem query)", async () => {
    const req = reqAdmin(undefined, { usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await listarLancamentosContabeis(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("lancamentos_contabeis", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosContabeis(reqAdmin(undefined, { query: {} }), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /lancamentos-contabeis/:id
// ---------------------------------------------------------------------------

describe("PATCH /lancamentos-contabeis/:id", () => {
  it("200 e atualiza campos permitidos", async () => {
    queue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, valor: 2000 },
      error: null,
    });

    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ valor: 2000 }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.valor, 2000);
  });

  it("não permite mudar cliente_id — campo é ignorado no update", async () => {
    queue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, descricao: "nova descricao" },
      error: null,
    });

    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ cliente_id: CLIENTE_B, descricao: "nova descricao" }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cliente_id, CLIENTE_A);
  });

  it("409 quando lançamento já está conciliado", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: true },
      error: null,
    });

    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ valor: 100 }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 409);
  });

  it("403 quando admin_cliente tenta alterar lançamento de outro cliente", async () => {
    queue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_B }, error: null });

    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ valor: 100 }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 403);
  });

  it("404 quando lançamento não existe", async () => {
    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ valor: 100 }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 404);
  });

  it("400 quando tipo inválido", async () => {
    queue("lancamentos_contabeis", "single", { data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A }, error: null });

    const res = criarResposta();
    await atualizarLancamentoContabil(
      reqAdmin({ tipo: "invalido" }, { params: { id: LANCAMENTO_ID } }),
      res,
    );

    assert.equal(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /lancamentos-contabeis/:id
// ---------------------------------------------------------------------------

describe("DELETE /lancamentos-contabeis/:id", () => {
  it("204 quando lançamento não está conciliado", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: false },
      error: null,
    });
    queue("lancamentos_contabeis", "await", { data: null, error: null });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 204);
  });

  it("409 quando lançamento já está conciliado", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: true },
      error: null,
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("403 quando admin_cliente tenta remover lançamento de outro cliente", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_B, conciliado: false },
      error: null,
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 403);
  });

  it("404 quando lançamento não existe", async () => {
    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 404);
  });

  it("409 quando lançamento está vinculado a pares_conciliacao (FK 23503)", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: false },
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: null,
      error: { code: "23503", message: "violates foreign key constraint" },
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("500 quando delete falha por outro motivo (não FK)", async () => {
    queue("lancamentos_contabeis", "single", {
      data: { id: LANCAMENTO_ID, cliente_id: CLIENTE_A, conciliado: false },
      error: null,
    });
    queue("lancamentos_contabeis", "await", {
      data: null,
      error: { code: "08000", message: "connection error" },
    });

    const res = criarResposta();
    await deletarLancamentoContabil(reqAdmin(undefined, { params: { id: LANCAMENTO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });
});
