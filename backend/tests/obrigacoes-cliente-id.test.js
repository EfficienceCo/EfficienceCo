import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  listarObrigacoes,
  criarObrigacao,
  proximasObrigacoes,
} from "../src/controllers/obrigacoes.controller.js";

// Bug #506 — o Calendário Fiscal com admin_efficience. O staff não tem
// cliente_id no token: o cliente vem do seletor da tela, em clienteId
// (camelCase, como no resto do sistema) ou cliente_id. Para o cliente normal o
// parâmetro é ignorado — quem manda é o token.

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID_OUTRO = "22222222-2222-2222-2222-222222222222";

// ---------------------------------------------------------------------------
// Mock de Supabase — registra os eq() para conferir por qual cliente filtrou
// ---------------------------------------------------------------------------

const filtros = [];
const insercoes = [];

supabase.from = function (tabela) {
  const builder = {
    select: () => builder,
    insert(dados) {
      insercoes.push({ tabela, dados });
      return builder;
    },
    delete: () => builder,
    update: () => builder,
    eq(campo, valor) {
      filtros.push({ tabela, campo, valor });
      return builder;
    },
    gte: () => builder,
    lte: () => builder,
    ilike: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: { id: "obg-1" }, error: null }),
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };

  return builder;
};

beforeEach(() => {
  filtros.length = 0;
  insercoes.length = 0;
});

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

function staff({ query = {}, body = {} } = {}) {
  return {
    usuario: { id: "user-staff", email: "staff@efficience.com", perfil: PERFIS.ADMIN_EFFICIENCE },
    query,
    body,
  };
}

function cliente({ query = {}, body = {} } = {}) {
  return {
    usuario: {
      id: "user-cliente",
      email: "contador@cliente.com",
      perfil: PERFIS.ADMIN_CLIENTE,
      cliente_id: CLIENTE_ID,
    },
    query,
    body,
  };
}

function filtroCliente() {
  return filtros.find((f) => f.tabela === "obrigacoes" && f.campo === "cliente_id");
}

describe("GET /obrigacoes — resolução do cliente (#506)", () => {
  it("400 quando admin_efficience não informa cliente", async () => {
    const res = criarResposta();
    await listarObrigacoes(staff(), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /cliente_id/);
  });

  it("aceita clienteId em camelCase na query (o que o frontend manda)", async () => {
    const res = criarResposta();
    await listarObrigacoes(staff({ query: { clienteId: CLIENTE_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(filtroCliente().valor, CLIENTE_ID);
  });

  it("segue aceitando cliente_id em snake_case na query", async () => {
    const res = criarResposta();
    await listarObrigacoes(staff({ query: { cliente_id: CLIENTE_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(filtroCliente().valor, CLIENTE_ID);
  });

  it("cliente normal usa o cliente do token e ignora o da query", async () => {
    const res = criarResposta();
    await listarObrigacoes(cliente({ query: { clienteId: CLIENTE_ID_OUTRO } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(filtroCliente().valor, CLIENTE_ID);
  });
});

describe("GET /obrigacoes/proximas — resolução do cliente (#506)", () => {
  it("aceita clienteId em camelCase na query", async () => {
    const res = criarResposta();
    await proximasObrigacoes(staff({ query: { clienteId: CLIENTE_ID } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(filtroCliente().valor, CLIENTE_ID);
  });

  it("400 quando admin_efficience não informa cliente", async () => {
    const res = criarResposta();
    await proximasObrigacoes(staff(), res);

    assert.equal(res.statusCode, 400);
  });
});

describe("POST /obrigacoes — resolução do cliente (#506)", () => {
  const payload = { nome: "DAS", tipo: "mensal", data_vencimento: "2026-10-20", recorrente: false };

  it("aceita clienteId em camelCase no corpo", async () => {
    const res = criarResposta();
    await criarObrigacao(staff({ body: { ...payload, clienteId: CLIENTE_ID } }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(insercoes[0].dados.cliente_id, CLIENTE_ID);
  });

  it("cliente normal grava no cliente do token, não no do corpo", async () => {
    const res = criarResposta();
    await criarObrigacao(cliente({ body: { ...payload, clienteId: CLIENTE_ID_OUTRO } }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(insercoes[0].dados.cliente_id, CLIENTE_ID);
  });
});
