import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PERFIS } from "../src/config/perfis.js";
import supabase from "../src/config/database.js";
import {
  criarRegra,
  atualizarRegra,
  listarRegras,
  buscarRegras,
  buscarVersaoRegras,
} from "../src/controllers/regras.controller.js";

// Substitui o método `from` do client Supabase real (importado como singleton) por um
// mock em memória. Como ES modules exportam o mesmo objeto por referência, mutar essa
// propriedade aqui é visto pelo controller sem precisar de `mock.module` — o que também
// evita a flag --experimental-test-module-mocks, indisponível no Node 20 usado localmente.
const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const REGRA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

const filas = new Map();
function chave(tabela, metodo) {
  return `${tabela}:${metodo}`;
}
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

const chamadasInsert = [];
const chamadasUpdate = [];

supabase.from = function (tabela) {
  const consumir = (metodo, fallback = { data: null, error: null }) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };

  const builder = {
    insert(payload) {
      chamadasInsert.push({ tabela, payload });
      return builder;
    },
    update(payload) {
      chamadasUpdate.push({ tabela, payload });
      return builder;
    },
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    delete() {
      return builder;
    },
    single() {
      return Promise.resolve(consumir("single"));
    },
    then(resolve, reject) {
      return Promise.resolve(consumir("await")).then(resolve, reject);
    },
  };
  return builder;
};

function tokenLicencaValido(clienteId = CLIENTE_A) {
  queue("licencas", "single", {
    data: { cliente_id: clienteId, ativa: true, validade: null },
    error: null,
  });
}

describe("regras.controller — condicao JSONB (BK-REGRAS-ENRICH)", () => {
  beforeEach(() => {
    filas.clear();
    chamadasInsert.length = 0;
    chamadasUpdate.length = 0;
  });

  function reqAdmin(body, overrides = {}) {
    return {
      body,
      params: {},
      query: {},
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
      ...overrides,
    };
  }

  it("criarRegra: aceita condicao como objeto e persiste sem stringify", async () => {
    const condicao = { extensao: "pdf", in_name: "FOLHA", tipo: "holerite" };
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_A, condicao },
      error: null,
    });

    const res = criarRes();
    await criarRegra(
      reqAdmin({
        condicao,
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body.condicao, condicao);
  });

  it("criarRegra: faz parse de condicao enviada como string JSON válida", async () => {
    const condicao = { extensao: "pdf" };
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_A, condicao },
      error: null,
    });

    const res = criarRes();
    await criarRegra(
      reqAdmin({
        condicao: JSON.stringify(condicao),
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body.condicao, condicao);
  });

  it("criarRegra: rejeita mover sem pasta_destino", async () => {
    const res = criarRes();
    await criarRegra(
      reqAdmin({ condicao: {}, acao: "mover", pasta_origem: "C:/in" }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /pasta_destino/);
  });

  it("criarRegra: aceita renomear sem pasta_destino", async () => {
    queue("regras", "single", {
      data: {
        id: REGRA_ID,
        cliente_id: CLIENTE_A,
        acao: "renomear",
        pasta_destino: "",
      },
      error: null,
    });

    const res = criarRes();
    await criarRegra(
      reqAdmin({ condicao: {}, acao: "renomear", pasta_origem: "C:/in" }),
      res,
    );

    assert.equal(res.statusCode, 201);
  });

  it("criarRegra: organizar_arquivo exige pasta_destino", async () => {
    const res = criarRes();
    await criarRegra(
      reqAdmin({
        condicao: { empresa_propria: "Souza" },
        acao: "organizar_arquivo",
        pasta_origem: "C:/ENTRADA",
      }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /pasta_destino/);
  });

  it("criarRegra: rejeita condicao como string JSON inválida sem chamar o banco", async () => {
    const res = criarRes();
    await criarRegra(
      reqAdmin({
        condicao: "extensao=.pdf",
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
      }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /condicao/);
  });

  it("criarRegra: deixa o trigger atômico definir a versão (#286)", async () => {
    const condicao = {};
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_A, condicao, versao: 5 },
      error: null,
    });

    const res = criarRes();
    await criarRegra(
      reqAdmin({
        condicao,
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
      }),
      res,
    );

    assert.equal(res.statusCode, 201);
    assert.equal(chamadasInsert.length, 1);
    assert.equal(chamadasInsert[0].tabela, "regras");
    assert.equal(Object.hasOwn(chamadasInsert[0].payload, "versao"), false);
    assert.equal(res.body.versao, 5);
  });

  it("criarRegra: 400 quando cliente_id não é resolvido", async () => {
    const res = criarRes();
    await criarRegra(
      reqAdmin(
        { condicao: {}, acao: "mover" },
        { usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, body: { condicao: {}, acao: "mover" } },
      ),
      res,
    );

    assert.equal(res.statusCode, 400);
  });

  it("atualizarRegra: persiste condicao como objeto sem stringify", async () => {
    const condicao = { in_name: "CONTRATO" };
    queue("regras", "single", {
      data: {
        id: REGRA_ID,
        cliente_id: CLIENTE_A,
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
        condicao: {},
      },
      error: null,
    });
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_A, condicao },
      error: null,
    });

    const res = criarRes();
    await atualizarRegra(
      reqAdmin({ condicao }, { params: { id: REGRA_ID } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.condicao, condicao);
  });

  it("atualizarRegra: deixa o trigger atômico incrementar a versão (#286)", async () => {
    const condicao = { in_name: "CONTRATO" };
    queue("regras", "single", {
      data: {
        id: REGRA_ID,
        cliente_id: CLIENTE_A,
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
        condicao: {},
      },
      error: null,
    });
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_A, condicao, versao: 3 },
      error: null,
    });

    const res = criarRes();
    await atualizarRegra(
      reqAdmin({ condicao }, { params: { id: REGRA_ID } }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(chamadasUpdate.length, 1);
    assert.equal(chamadasUpdate[0].tabela, "regras");
    assert.equal(Object.hasOwn(chamadasUpdate[0].payload, "versao"), false);
    assert.equal(res.body.versao, 3);
  });

  it("atualizarRegra: rejeita condicao como string JSON inválida sem chamar update", async () => {
    queue("regras", "single", {
      data: {
        id: REGRA_ID,
        cliente_id: CLIENTE_A,
        acao: "mover",
        pasta_origem: "C:/in",
        pasta_destino: "C:/out",
      },
      error: null,
    });

    const res = criarRes();
    await atualizarRegra(
      reqAdmin({ condicao: "não é json" }, { params: { id: REGRA_ID } }),
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /condicao/);
  });

  it("atualizarRegra: 403 quando admin_cliente tenta alterar regra de outro cliente", async () => {
    queue("regras", "single", {
      data: { id: REGRA_ID, cliente_id: CLIENTE_B, acao: "mover" },
      error: null,
    });

    const res = criarRes();
    await atualizarRegra(
      reqAdmin({ condicao: {} }, { params: { id: REGRA_ID } }),
      res,
    );

    assert.equal(res.statusCode, 403);
  });

  it("atualizarRegra: 404 quando regra não existe", async () => {
    const res = criarRes();
    await atualizarRegra(
      reqAdmin({ condicao: {} }, { params: { id: REGRA_ID } }),
      res,
    );

    assert.equal(res.statusCode, 404);
  });

  it("buscarVersaoRegras (rota do agente): lê o contador atômico do cliente", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("clientes", "single", { data: { regras_versao: 3 }, error: null });

    const res = criarRes();
    await buscarVersaoRegras(
      {
        params: { clienteId: CLIENTE_A },
        headers: { "x-licenca-token": "token-valido" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { versao: 3 });
  });

  it("listarRegras: retorna condicao sem filtrar nenhum campo (select *)", async () => {
    const regra = {
      id: REGRA_ID,
      cliente_id: CLIENTE_A,
      pasta_origem: "C:/in",
      pasta_destino: "C:/out",
      condicao: { extensao: "pdf", tipo: "holerite" },
      acao: "mover",
      ativa: true,
    };
    queue("regras", "await", { data: [regra], error: null });

    const res = criarRes();
    await listarRegras(reqAdmin(undefined, { body: {}, query: {} }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body[0], regra);
  });

  it("buscarRegras (rota do agente): retorna condicao como objeto para o cliente correto", async () => {
    const regra = {
      id: REGRA_ID,
      cliente_id: CLIENTE_A,
      condicao: { in_name: "FOLHA", extensao: "xlsx" },
    };
    tokenLicencaValido(CLIENTE_A);
    queue("regras", "await", { data: [regra], error: null });

    const res = criarRes();
    await buscarRegras(
      {
        params: { clienteId: CLIENTE_A },
        headers: { "x-licenca-token": "token-valido" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body[0].condicao, regra.condicao);
  });
});
