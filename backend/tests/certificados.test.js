import { describe, it, after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import supabase from "../src/config/database.js";
import app from "../src/app.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarCertificado,
  listarCertificados,
  obterCertificado,
  editarCertificado,
  iniciarRenovacaoCertificado,
  atualizarRenovacaoCertificado,
} from "../src/controllers/certificados.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID_OUTRO = "22222222-2222-2222-2222-222222222222";
const CERTIFICADO_ID = "33333333-3333-3333-3333-333333333333";
const JWT_SECRET = "certificados-test-secret";

process.env.JWT_SECRET ??= JWT_SECRET;

// ---------------------------------------------------------------------------
// Mock de Supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const chamadas = [];
const insercoes = [];
const delecoes = [];

function chave(tabela, metodo) {
  return `${tabela}:${metodo}`;
}

function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const fila = filas.get(chave(tabela, metodo));
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
    update(dados) {
      chamadas.push({ tabela, metodo: "update", dados });
      return builder;
    },
    delete() {
      delecoes.push({ tabela });
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

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  insercoes.length = 0;
  delecoes.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers (camada de controller — sem HTTP)
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

function usuarioComCliente(clienteId = CLIENTE_ID, perfil = PERFIS.ADMIN_CLIENTE) {
  return {
    usuario: {
      id: "user-123",
      email: "user@test.com",
      cliente_id: clienteId,
      perfil,
    },
  };
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function dataEmDias(dias) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function payloadValido(overrides = {}) {
  return {
    tipo: "A1",
    serial: "ABC123",
    titular: "Padaria do João LTDA",
    validade: dataEmDias(90),
    caminho_local: "C:\\clientes\\padaria-do-joao\\certificado\\",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /certificados — criar
// ---------------------------------------------------------------------------

describe("POST /certificados (controller)", () => {
  it("201 e persiste quando payload válido", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, status: "ativo", ...payloadValido() },
      error: null,
    });

    const req = { ...usuarioComCliente(), body: payloadValido() };
    const res = criarResposta();
    await criarCertificado(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, CERTIFICADO_ID);
    assert.ok(Number.isInteger(res.body.dias_restantes));
    assert.equal(res.body.faixa, "verde");
    assert.equal(insercoes[0].dados.tipo, "A1");
  });

  it("400 quando campos obrigatórios faltam", async () => {
    const req = { ...usuarioComCliente(), body: { serial: "ABC" } };
    const res = criarResposta();
    await criarCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.faltando.includes("tipo"));
    assert.ok(res.body.faltando.includes("validade"));
  });

  it("400 quando tipo não é A1 nem A3", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ tipo: "B1" }) };
    const res = criarResposta();
    await criarCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /A1.*A3/);
  });

  it("400 quando validade não é uma data válida", async () => {
    const req = { ...usuarioComCliente(), body: payloadValido({ validade: "31-12-2026" }) };
    const res = criarResposta();
    await criarCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /validade/i);
  });

  it("401 quando usuário não autenticado", async () => {
    const req = { usuario: null, body: payloadValido() };
    const res = criarResposta();
    await criarCertificado(req, res);

    assert.equal(res.statusCode, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /certificados — listar, com dias_restantes e faixa
// ---------------------------------------------------------------------------

describe("GET /certificados (controller)", () => {
  it("200 calcula faixa verde para validade > 60 dias", async () => {
    queue("certificados_digitais", "await", {
      data: [{ id: "1", cliente_id: CLIENTE_ID, tipo: "A1", validade: dataEmDias(90) }],
      error: null,
    });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarCertificados(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].faixa, "verde");
  });

  it("200 calcula faixa ambar para validade entre 30 e 60 dias", async () => {
    queue("certificados_digitais", "await", {
      data: [{ id: "1", cliente_id: CLIENTE_ID, tipo: "A1", validade: dataEmDias(45) }],
      error: null,
    });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarCertificados(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].faixa, "ambar");
  });

  it("200 calcula faixa vermelho para validade < 30 dias", async () => {
    queue("certificados_digitais", "await", {
      data: [{ id: "1", cliente_id: CLIENTE_ID, tipo: "A1", validade: dataEmDias(10) }],
      error: null,
    });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarCertificados(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].faixa, "vermelho");
  });

  it("200 calcula faixa vencido para validade <= hoje", async () => {
    queue("certificados_digitais", "await", {
      data: [{ id: "1", cliente_id: CLIENTE_ID, tipo: "A1", validade: dataEmDias(-5) }],
      error: null,
    });

    const req = usuarioComCliente();
    const res = criarResposta();
    await listarCertificados(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body[0].faixa, "vencido");
    assert.ok(res.body[0].dias_restantes <= 0);
  });

  it("400 quando clienteId não pode ser resolvido", async () => {
    const req = { usuario: null };
    const res = criarResposta();
    await listarCertificados(req, res);

    assert.equal(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// GET /certificados/:id — detalhe + isolamento multi-tenant
// ---------------------------------------------------------------------------

describe("GET /certificados/:id (controller)", () => {
  it("200 retorna detalhe com renovacao_checklist", async () => {
    const checklist = { tipo: "A1", itens: [], validade_nova: null };
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, validade: dataEmDias(90), renovacao_checklist: checklist },
      error: null,
    });

    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await obterCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.renovacao_checklist, checklist);
  });

  it("404 quando certificado é de outro cliente (isolamento multi-tenant)", async () => {
    queue("certificados_digitais", "maybeSingle", { data: null, error: null });

    const req = { ...usuarioComCliente(CLIENTE_ID), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await obterCertificado(req, res);

    assert.equal(res.statusCode, 404);
    assert.ok(
      chamadas.some(
        (c) => c.tabela === "certificados_digitais" && c.campo === "cliente_id" && c.valor === CLIENTE_ID,
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /certificados/:id — editar validade/serial/caminho_local
// ---------------------------------------------------------------------------

describe("PATCH /certificados/:id (controller)", () => {
  it("200 edita validade e serial", async () => {
    queue("certificados_digitais", "maybeSingle", { data: { cliente_id: CLIENTE_ID }, error: null });
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, validade: dataEmDias(120), serial: "NOVO123" },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { validade: dataEmDias(120), serial: "NOVO123" },
    };
    const res = criarResposta();
    await editarCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.serial, "NOVO123");
  });

  it("400 quando tenta editar campo não editável (tipo)", async () => {
    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { tipo: "A3" },
    };
    const res = criarResposta();
    await editarCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.camposNaoEditaveis);
  });

  it("404 quando certificado é de outro cliente (isolamento multi-tenant)", async () => {
    queue("certificados_digitais", "maybeSingle", { data: null, error: null });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { serial: "X" },
    };
    const res = criarResposta();
    await editarCertificado(req, res);

    assert.equal(res.statusCode, 404);
  });

  it("409 quando certificado já foi substituído (registro histórico imutável)", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, status: "substituido" },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { serial: "X" },
    };
    const res = criarResposta();
    await editarCertificado(req, res);

    assert.equal(res.statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// POST /certificados/:id/iniciar-renovacao — ramificação A1 x A3
// ---------------------------------------------------------------------------

describe("POST /certificados/:id/iniciar-renovacao (controller)", () => {
  it("A1 materializa checklist com 2 itens", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, tipo: "A1", status: "ativo" },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        status: "renovacao_iniciada",
        validade: dataEmDias(90),
        renovacao_checklist: {
          tipo: "A1",
          itens: [
            { id: "confirmar_dados", concluido: false },
            { id: "gerar_novo", concluido: false },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });

    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await iniciarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "renovacao_iniciada");
    assert.equal(res.body.renovacao_checklist.itens.length, 2);
    assert.deepEqual(
      res.body.renovacao_checklist.itens.map((i) => i.id),
      ["confirmar_dados", "gerar_novo"],
    );
  });

  it("A3 materializa checklist com 3 itens, incluindo agendar_comparecimento", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, tipo: "A3", status: "ativo" },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A3",
        status: "renovacao_iniciada",
        validade: dataEmDias(90),
        renovacao_checklist: {
          tipo: "A3",
          itens: [
            { id: "confirmar_dados", concluido: false },
            { id: "gerar_novo", concluido: false },
            { id: "agendar_comparecimento", concluido: false, data: null },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });

    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await iniciarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.renovacao_checklist.itens.length, 3);
    assert.deepEqual(
      res.body.renovacao_checklist.itens.map((i) => i.id),
      ["confirmar_dados", "gerar_novo", "agendar_comparecimento"],
    );
  });

  it("409 quando renovação já foi iniciada", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, tipo: "A1", status: "renovacao_iniciada" },
      error: null,
    });

    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await iniciarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando certificado é de outro cliente", async () => {
    queue("certificados_digitais", "maybeSingle", { data: null, error: null });

    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID } };
    const res = criarResposta();
    await iniciarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /certificados/:id/renovacao — concluir itens e finalizar renovação
// ---------------------------------------------------------------------------

describe("PATCH /certificados/:id/renovacao (controller)", () => {
  function checklistA1(overrides = []) {
    return {
      tipo: "A1",
      itens: [
        { id: "confirmar_dados", concluido: false },
        { id: "gerar_novo", concluido: false },
        ...overrides,
      ].slice(0, 2),
      validade_nova: null,
    };
  }

  it("marca item concluído sem finalizar quando faltam itens", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        status: "renovacao_iniciada",
        renovacao_checklist: checklistA1(),
      },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        status: "renovacao_iniciada",
        validade: dataEmDias(90),
        renovacao_checklist: {
          tipo: "A1",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: false },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "confirmar_dados" },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "renovacao_iniciada");
    assert.equal(
      res.body.renovacao_checklist.itens.find((i) => i.id === "confirmar_dados").concluido,
      true,
    );
  });

  it("A1: todos itens concluídos + validade_nova cria novo certificado ativo (com serial/caminho novos) e marca o antigo substituido", async () => {
    const novaValidade = dataEmDias(365);

    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        serial: "ABC123",
        titular: "Padaria do João",
        caminho_local: "C:\\certificados\\antigo\\",
        validade: dataEmDias(90),
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A1",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: false },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });

    // insert do novo certificado ativo
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: "novo-cert-id",
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        serial: "NOVO456",
        caminho_local: "C:\\certificados\\novo\\",
        status: "ativo",
        validade: novaValidade,
      },
      error: null,
    });

    // update do certificado antigo para substituido
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        status: "substituido",
        validade: dataEmDias(5),
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: {
        itemId: "gerar_novo",
        validade_nova: novaValidade,
        serial_novo: "NOVO456",
        caminho_local_novo: "C:\\certificados\\novo\\",
      },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.certificado.status, "substituido");
    assert.equal(res.body.novo_certificado.status, "ativo");
    assert.equal(res.body.novo_certificado.validade, novaValidade);
    assert.equal(insercoes[0].dados.status, "ativo");
    assert.equal(insercoes[0].dados.cliente_id, CLIENTE_ID);
    assert.equal(insercoes[0].dados.serial, "NOVO456");
    assert.equal(insercoes[0].dados.caminho_local, "C:\\certificados\\novo\\");
    assert.notEqual(insercoes[0].dados.serial, "ABC123");
  });

  it("400 quando validade_nova não é posterior à validade atual", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        validade: dataEmDias(90),
        status: "renovacao_iniciada",
        renovacao_checklist: checklistA1(),
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "gerar_novo", validade_nova: dataEmDias(10) },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(insercoes.length, 0);
  });

  it("A3: não finaliza enquanto agendar_comparecimento não estiver concluído", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A3",
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A3",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: true },
            { id: "agendar_comparecimento", concluido: false, data: null },
          ],
          validade_nova: dataEmDias(365),
        },
      },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        status: "renovacao_iniciada",
        validade: dataEmDias(20),
        renovacao_checklist: {
          tipo: "A3",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: true },
            { id: "agendar_comparecimento", concluido: false, data: "2026-10-01" },
          ],
          validade_nova: dataEmDias(365),
        },
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "agendar_comparecimento", concluido: false, data: "2026-10-01" },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "renovacao_iniciada");
    assert.equal(insercoes.length, 0);
  });

  it("A3: finaliza quando os 3 itens concluídos + validade_nova", async () => {
    const novaValidade = dataEmDias(365);

    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A3",
        serial: "TOKEN-A3",
        titular: "Padaria do João",
        caminho_local: null,
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A3",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: true },
            { id: "agendar_comparecimento", concluido: false, data: "2026-10-01" },
          ],
          validade_nova: novaValidade,
        },
      },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: { id: "novo-cert-a3", cliente_id: CLIENTE_ID, tipo: "A3", status: "ativo", validade: novaValidade },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, status: "substituido", validade: dataEmDias(5) },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "agendar_comparecimento", concluido: true },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.certificado.status, "substituido");
    assert.equal(res.body.novo_certificado.tipo, "A3");
  });

  it("400 quando tenta concluir agendar_comparecimento sem nunca ter registrado uma data", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A3",
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A3",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: true },
            { id: "agendar_comparecimento", concluido: false, data: null },
          ],
          validade_nova: dataEmDias(365),
        },
      },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "agendar_comparecimento", concluido: true },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(insercoes.length, 0);
  });

  it("500 e compensa (deleta) o novo certificado quando falha ao marcar o antigo como substituido", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        validade: dataEmDias(90),
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A1",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: false },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });
    // insert do novo certificado — sucesso
    queue("certificados_digitais", "maybeSingle", {
      data: { id: "novo-cert-orphan", cliente_id: CLIENTE_ID, tipo: "A1", status: "ativo" },
      error: null,
    });
    // update do antigo para substituido — falha
    queue("certificados_digitais", "maybeSingle", {
      data: null,
      error: { message: "falha simulada" },
    });
    // delete de compensação — sucesso
    queue("certificados_digitais", "await", { data: null, error: null });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "gerar_novo", validade_nova: dataEmDias(365) },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(delecoes.length, 1);
    assert.equal(delecoes[0].tabela, "certificados_digitais");
    assert.ok(
      chamadas.some((c) => c.metodo === "eq" && c.campo === "id" && c.valor === "novo-cert-orphan"),
    );
  });

  it("500 com mensagem de suporte quando o próprio rollback de compensação falha", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: {
        id: CERTIFICADO_ID,
        cliente_id: CLIENTE_ID,
        tipo: "A1",
        validade: dataEmDias(90),
        status: "renovacao_iniciada",
        renovacao_checklist: {
          tipo: "A1",
          itens: [
            { id: "confirmar_dados", concluido: true },
            { id: "gerar_novo", concluido: false },
          ],
          validade_nova: null,
        },
      },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: { id: "novo-cert-orphan-2", cliente_id: CLIENTE_ID, tipo: "A1", status: "ativo" },
      error: null,
    });
    queue("certificados_digitais", "maybeSingle", {
      data: null,
      error: { message: "falha simulada" },
    });
    // delete de compensação — também falha
    queue("certificados_digitais", "await", { data: null, error: { message: "falha ao deletar" } });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "gerar_novo", validade_nova: dataEmDias(365) },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.body.erro, /suporte/i);
  });

  it("400 quando itemId não informado", async () => {
    const req = { ...usuarioComCliente(), params: { id: CERTIFICADO_ID }, body: {} };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("409 quando renovação não foi iniciada", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, status: "ativo", renovacao_checklist: null },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "confirmar_dados" },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("404 quando item do checklist não existe", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, status: "renovacao_iniciada", renovacao_checklist: checklistA1() },
      error: null,
    });

    const req = {
      ...usuarioComCliente(),
      params: { id: CERTIFICADO_ID },
      body: { itemId: "item_inexistente" },
    };
    const res = criarResposta();
    await atualizarRenovacaoCertificado(req, res);

    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// Camada HTTP — autenticação (401) e RBAC (403), app Express real
// ---------------------------------------------------------------------------

describe("/certificados — camada HTTP", () => {
  let server;
  let baseUrl;

  before(
    () =>
      new Promise((resolve) => {
        server = createServer(app);
        server.listen(0, "127.0.0.1", () => {
          baseUrl = `http://127.0.0.1:${server.address().port}`;
          resolve();
        });
      }),
  );

  after(async () => {
    supabase.from = originalFrom;
    await new Promise((resolve) => server.close(resolve));
  });

  function token(perfil, clienteId = CLIENTE_ID) {
    return jwt.sign(
      { id: "usuario-teste", email: "teste@efficience.co", perfil, cliente_id: clienteId },
      process.env.JWT_SECRET,
    );
  }

  async function requisitar(path, { method = "GET", body, jwtToken } = {}) {
    const headers = {};
    if (jwtToken) headers.authorization = `Bearer ${jwtToken}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    const resposta = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return {
      status: resposta.status,
      body: await resposta.json().catch(() => null),
    };
  }

  it("401 sem token em todas as rotas", async () => {
    const semTokenGet = await requisitar("/certificados");
    assert.equal(semTokenGet.status, 401);

    const semTokenPost = await requisitar("/certificados", { method: "POST", body: payloadValido() });
    assert.equal(semTokenPost.status, 401);
  });

  it("403 quando funcionario tenta criar certificado", async () => {
    const resposta = await requisitar("/certificados", {
      method: "POST",
      body: payloadValido(),
      jwtToken: token(PERFIS.FUNCIONARIO),
    });

    assert.equal(resposta.status, 403);
  });

  it("403 quando funcionario tenta editar certificado", async () => {
    const resposta = await requisitar(`/certificados/${CERTIFICADO_ID}`, {
      method: "PATCH",
      body: { serial: "X" },
      jwtToken: token(PERFIS.FUNCIONARIO),
    });

    assert.equal(resposta.status, 403);
  });

  it("403 quando funcionario tenta iniciar renovação", async () => {
    const resposta = await requisitar(`/certificados/${CERTIFICADO_ID}/iniciar-renovacao`, {
      method: "POST",
      jwtToken: token(PERFIS.FUNCIONARIO),
    });

    assert.equal(resposta.status, 403);
  });

  it("403 quando funcionario tenta atualizar checklist de renovação", async () => {
    const resposta = await requisitar(`/certificados/${CERTIFICADO_ID}/renovacao`, {
      method: "PATCH",
      body: { itemId: "confirmar_dados" },
      jwtToken: token(PERFIS.FUNCIONARIO),
    });

    assert.equal(resposta.status, 403);
  });

  it("200 funcionario pode listar certificados do próprio cliente", async () => {
    queue("certificados_digitais", "await", { data: [], error: null });

    const resposta = await requisitar("/certificados", { jwtToken: token(PERFIS.FUNCIONARIO) });

    assert.equal(resposta.status, 200);
  });

  it("201 admin_cliente cria certificado", async () => {
    queue("certificados_digitais", "maybeSingle", {
      data: { id: CERTIFICADO_ID, cliente_id: CLIENTE_ID, status: "ativo", ...payloadValido() },
      error: null,
    });

    const resposta = await requisitar("/certificados", {
      method: "POST",
      body: payloadValido(),
      jwtToken: token(PERFIS.ADMIN_CLIENTE),
    });

    assert.equal(resposta.status, 201);
    assert.equal(resposta.body.id, CERTIFICADO_ID);
  });
});
