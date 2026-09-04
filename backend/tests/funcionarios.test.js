import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarFuncionario,
  listarFuncionarios,
  obterFuncionario,
  editarFuncionario,
  desligarFuncionario,
} from "../src/controllers/funcionarios.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID_OUTRO = "22222222-2222-2222-2222-222222222222";
const FUNCIONARIO_ID = "33333333-3333-3333-3333-333333333333";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const chamadas = [];
const insercoes = [];
function chave(t, m) {
  return `${t}:${m}`;
}
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
    select() {
      return builder;
    },
    insert(dados) {
      insercoes.push({ tabela, dados });
      return builder;
    },
    update() {
      return builder;
    },
    eq(campo, valor) {
      chamadas.push({ tabela, metodo: "eq", campo, valor });
      return builder;
    },
    order() {
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
  chamadas.length = 0;
  insercoes.length = 0;
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

function usuarioComCliente(clienteId = CLIENTE_ID, perfil = PERFIS.FUNCIONARIO) {
  return {
    usuario: {
      id: "user-123",
      email: "user@test.com",
      cliente_id: clienteId,
      perfil,
    },
  };
}

function payloadValido(overrides = {}) {
  return {
    cpf: "123.456.789-09",
    nome: "João Silva",
    data_admissao: "2026-01-15",
    cargo: "Gerente",
    cbo: "1234",
    categoria: "101",
    salario: 5000.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /funcionarios — Criar funcionário
// ---------------------------------------------------------------------------

describe("POST /funcionarios", () => {
  it("201 e persiste quando payload válido", async () => {
    queue("funcionarios", "maybeSingle", {
      data: {
        id: FUNCIONARIO_ID,
        cliente_id: CLIENTE_ID,
        ...payloadValido(),
      },
      error: null,
    });

    const req = { ...usuarioComCliente(), body: payloadValido() };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.nome, "João Silva");
    assert.equal(res.body.cliente_id, CLIENTE_ID);
    assert.equal(insercoes[0].dados.cpf, "12345678909");
  });

  it("400 quando campos obrigatórios faltam", async () => {
    const req = { ...usuarioComCliente(), body: { nome: "João" } };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.erro);
    assert.ok(res.body.faltando);
  });

  it("400 quando salário é negativo", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ salario: -100 }) };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /salario/i);
  });

  it("400 quando CPF é vazio", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ cpf: "" }) };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.faltando.includes("cpf"));
  });

  it("400 quando CPF não contém 11 dígitos", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ cpf: "123" }) };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /11 dígitos/i);
  });

  it("400 quando CPF tem 11 dígitos, mas falha nos dígitos verificadores", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ cpf: "12345678901" }) };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /cpf inválido/i);
  });

  it("400 quando data_admissao não é uma data de calendário válida", async () => {
    const req = {
      ...usuarioComCliente(),
      body: payloadValido({ data_admissao: "2026-02-30" }),
    };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /data_admissao/i);
  });

  it("201 para admin no cliente informado", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID_OUTRO, ...payloadValido() },
      error: null,
    });

    const req = {
      ...usuarioComCliente(CLIENTE_ID, PERFIS.ADMIN_EFFICIENCE),
      body: payloadValido({ clienteId: CLIENTE_ID_OUTRO }),
    };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.cliente_id, CLIENTE_ID_OUTRO);
  });

  it("409 quando CPF + data_admissao já existe (UNIQUE violation)", async () => {
    queue("funcionarios", "maybeSingle", {
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    });

    const req = { ...usuarioComCliente(), body: payloadValido() };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.erro, /já existe/i);
  });

  it("401 quando usuário não autenticado", async () => {
    const req = { usuario: null, body: payloadValido() };
    const res = criarResposta();
    await criarFuncionario(req, res);

    assert.equal(res.statusCode, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /funcionarios — Listar funcionários
// ---------------------------------------------------------------------------

describe("GET /funcionarios", () => {
  it("200 retorna lista de funcionários do cliente", async () => {
    const funcionarios = [
      { id: "1", cliente_id: CLIENTE_ID, nome: "João" },
      { id: "2", cliente_id: CLIENTE_ID, nome: "Maria" },
    ];
    queue("funcionarios", "await", { data: funcionarios, error: null });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].nome, "João");
  });

  it("200 retorna lista vazia quando nenhum funcionário", async () => {
    queue("funcionarios", "await", { data: null, error: null });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  it("ignora clienteId informado por usuário que não é admin", async () => {
    queue("funcionarios", "await", { data: [], error: null });

    const req = {
      ...usuarioComCliente(CLIENTE_ID),
      query: { clienteId: CLIENTE_ID_OUTRO },
    };
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.tabela === "funcionarios" &&
          chamada.campo === "cliente_id" &&
          chamada.valor === CLIENTE_ID,
      ),
    );
  });

  it("400 quando clienteId não pode ser resolvido", async () => {
    const req = { usuario: null };
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("200 admin pode listar funcionários de outro cliente via query", async () => {
    const funcionarios = [{ id: "1", cliente_id: CLIENTE_ID_OUTRO, nome: "João" }];
    queue("funcionarios", "await", { data: funcionarios, error: null });

    const req = {
      usuario: {
        ...usuarioComCliente(CLIENTE_ID, PERFIS.ADMIN_EFFICIENCE).usuario,
      },
      query: { clienteId: CLIENTE_ID_OUTRO },
    };
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].cliente_id, CLIENTE_ID_OUTRO);
  });

  it("400 para admin sem clienteId", async () => {
    const req = { ...usuarioComCliente(undefined, PERFIS.ADMIN_EFFICIENCE), query: {} };
    const res = criarResposta();
    await listarFuncionarios(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /clienteId/i);
  });
});

// ---------------------------------------------------------------------------
// GET /funcionarios/:id — Obter detalhe
// ---------------------------------------------------------------------------

describe("GET /funcionarios/:id", () => {
  it("200 retorna detalhe de funcionário do cliente", async () => {
    const funcionario = {
      id: FUNCIONARIO_ID,
      cliente_id: CLIENTE_ID,
      ...payloadValido(),
    };
    queue("funcionarios", "maybeSingle", { data: funcionario, error: null });

    const req = { ...usuarioComCliente(), params: { id: FUNCIONARIO_ID } };
    const res = criarResposta();
    await obterFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, FUNCIONARIO_ID);
    assert.equal(res.body.nome, "João Silva");
  });

  it("404 quando funcionário não existe", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });

    const req = { ...usuarioComCliente(), params: { id: FUNCIONARIO_ID } };
    const res = criarResposta();
    await obterFuncionario(req, res);

    assert.equal(res.statusCode, 404);
  });

  it("404 quando funcionário é de outro cliente (isolamento multi-tenant)", async () => {
    const funcionario = {
      id: FUNCIONARIO_ID,
      cliente_id: CLIENTE_ID_OUTRO,
      ...payloadValido(),
    };
    queue("funcionarios", "maybeSingle", { data: funcionario, error: null });

    const req = { ...usuarioComCliente(CLIENTE_ID), params: { id: FUNCIONARIO_ID } };
    const res = criarResposta();
    await obterFuncionario(req, res);

    assert.equal(res.statusCode, 404);
    assert.match(res.body.erro, /não encontrado/i);
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.tabela === "funcionarios" &&
          chamada.campo === "cliente_id" &&
          chamada.valor === CLIENTE_ID,
      ),
    );
  });

  it("200 admin pode ver funcionário de outro cliente", async () => {
    const funcionario = {
      id: FUNCIONARIO_ID,
      cliente_id: CLIENTE_ID_OUTRO,
      ...payloadValido(),
    };
    queue("funcionarios", "maybeSingle", { data: funcionario, error: null });

    const req = {
      usuario: {
        ...usuarioComCliente(CLIENTE_ID, PERFIS.ADMIN_EFFICIENCE).usuario,
      },
      params: { id: FUNCIONARIO_ID },
    };
    const res = criarResposta();
    await obterFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cliente_id, CLIENTE_ID_OUTRO);
  });
});

// ---------------------------------------------------------------------------
// PATCH /funcionarios/:id — Editar dados cadastrais
// ---------------------------------------------------------------------------

describe("PATCH /funcionarios/:id", () => {
  it("200 edita nome e salário com sucesso", async () => {
    queue("funcionarios", "maybeSingle", { data: { cliente_id: CLIENTE_ID }, error: null }); // busca isolamento
    queue("funcionarios", "maybeSingle", {
      data: {
        id: FUNCIONARIO_ID,
        cliente_id: CLIENTE_ID,
        nome: "João Silva Novo",
        salario: 6000,
      },
      error: null,
    }); // resultado do update

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { nome: "João Silva Novo", salario: 6000 },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.nome, "João Silva Novo");
    assert.equal(res.body.salario, 6000);
  });

  it("200 edita o endereço cadastral", async () => {
    const endereco = {
      tipoLogradouro: "Rua",
      logradouro: "das Flores",
      numero: "120",
      cep: "01311-000",
      uf: "SP",
    };
    queue("funcionarios", "maybeSingle", { data: { cliente_id: CLIENTE_ID }, error: null });
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID, endereco },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { endereco },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.endereco, endereco);
  });

  it("400 quando endereço não é objeto nem null", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { endereco: "Rua das Flores" },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /endereco/i);
  });

  it("400 quando tenta editar campo não editável (CPF)", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { cpf: "99999999999" },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.camposNaoEditaveis);
  });

  it("400 quando nenhum campo válido para editar", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: {},
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /nenhum campo/i);
  });

  it("404 quando funcionário não existe", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { nome: "Novo Nome" },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 404);
  });

  it("404 quando funcionário é de outro cliente (isolamento multi-tenant)", async () => {
    queue("funcionarios", "maybeSingle", { data: { cliente_id: CLIENTE_ID_OUTRO }, error: null });

    const req = {
      ...usuarioComCliente(CLIENTE_ID),
      params: { id: FUNCIONARIO_ID },
      body: { nome: "Novo Nome" },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 404);
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.tabela === "funcionarios" &&
          chamada.campo === "cliente_id" &&
          chamada.valor === CLIENTE_ID,
      ),
    );
  });

  it("200 admin pode editar funcionário de outro cliente", async () => {
    queue("funcionarios", "maybeSingle", { data: { cliente_id: CLIENTE_ID_OUTRO }, error: null }); // busca isolamento
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNCIONARIO_ID, cliente_id: CLIENTE_ID_OUTRO, nome: "Novo" },
      error: null,
    }); // resultado do update

    const req = {
      usuario: {
        ...usuarioComCliente(CLIENTE_ID, PERFIS.ADMIN_EFFICIENCE).usuario,
      },
      params: { id: FUNCIONARIO_ID },
      body: { nome: "Novo" },
    };
    const res = criarResposta();
    await editarFuncionario(req, res);

    assert.equal(res.statusCode, 200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /funcionarios/:id/desligar — Desligar funcionário
// ---------------------------------------------------------------------------

describe("PATCH /funcionarios/:id/desligar", () => {
  it("200 desliga funcionário com data válida", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, data_desligamento: null },
      error: null,
    }); // busca isolamento
    queue("funcionarios", "maybeSingle", {
      data: {
        id: FUNCIONARIO_ID,
        cliente_id: CLIENTE_ID,
        data_desligamento: "2026-12-31",
      },
      error: null,
    }); // resultado do update

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-12-31" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data_desligamento, "2026-12-31");
  });

  it("400 quando data_desligamento não informada", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: {},
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /data_desligamento/i);
  });

  it("400 quando data_desligamento não é uma data de calendário válida", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-02-30" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /data_desligamento/i);
  });

  it("409 quando funcionário já foi desligado", async () => {
    queue("funcionarios", "maybeSingle", {
      data: {
        cliente_id: CLIENTE_ID,
        data_desligamento: "2025-06-30",
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-12-31" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.erro, /já foi desligado/i);
  });

  it("404 quando funcionário não existe", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });

    const req = {
      ...usuarioComCliente(),
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-12-31" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 404);
  });

  it("404 quando funcionário é de outro cliente (isolamento multi-tenant)", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID_OUTRO, data_desligamento: null },
      error: null,
    });

    const req = {
      ...usuarioComCliente(CLIENTE_ID),
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-12-31" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 404);
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.tabela === "funcionarios" &&
          chamada.campo === "cliente_id" &&
          chamada.valor === CLIENTE_ID,
      ),
    );
  });

  it("200 admin pode desligar funcionário de outro cliente", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID_OUTRO, data_desligamento: null },
      error: null,
    }); // busca isolamento
    queue("funcionarios", "maybeSingle", {
      data: {
        id: FUNCIONARIO_ID,
        cliente_id: CLIENTE_ID_OUTRO,
        data_desligamento: "2026-12-31",
      },
      error: null,
    }); // resultado do update

    const req = {
      usuario: {
        ...usuarioComCliente(CLIENTE_ID, PERFIS.ADMIN_EFFICIENCE).usuario,
      },
      params: { id: FUNCIONARIO_ID },
      body: { data_desligamento: "2026-12-31" },
    };
    const res = criarResposta();
    await desligarFuncionario(req, res);

    assert.equal(res.statusCode, 200);
  });
});
