// TEST-DAS-2: somente falhas do adaptador/custo de consultas.
// HTTP/JWT/RLS/isolamento/persistência estão em apuracao-http.test.js.
import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  listarFolhaPendente,
  recalcularApuracao,
} from "../src/controllers/apuracoes.controller.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
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
    range() { return builder; },
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



describe("Unidade: falha do adaptador e custo de consultas (não prova banco/isolamento)", () => {
  it("200 com lista vazia quando não há apurações pendentes (sem query desnecessária em clientes)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", { data: [], error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(chamadasTabela("clientes"), 0);
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

  it("409 quando o adaptador devolve zero linhas no UPDATE condicional de recálculo", async () => {
    queue("apuracoes", "maybeSingle", { data: { id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 8, periodo_ano: 2026, status: "rascunho", anexo: "I", fator_r: null }, error: null });
    queueCliente();
    queueNotas([{ valor_total: 10000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });
});
