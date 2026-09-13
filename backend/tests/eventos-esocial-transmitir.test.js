import { describe, it, mock, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { gerarPfxTeste } from "./fixtures/esocial-cert-fixture.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const EVENTO_ID = "33333333-3333-3333-3333-333333333333";

const originalFrom = supabase.from;
const filas = new Map();
const chave = (t, m) => `${t}:${m}`;
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
    select() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: null, error: null })).then(resolve, reject);
    },
  };
  return builder;
};

const mockEnviar = mock.fn(async () => ({
  status: "transmitido",
  numero_recibo: "1.2.0001234567890123",
}));

class ErroTransmissaoMock extends Error {
  constructor(m, c, s = 502) {
    super(m);
    this.codigo = c;
    this.statusHttp = s;
  }
}

mock.module("../src/services/esocial-transmissao.service.js", {
  namedExports: {
    transmitirEventoEsocial: mockEnviar,
    ErroTransmissaoESocial: ErroTransmissaoMock,
  },
});

const { transmitirEvento: transmitirHandler } = await import("../src/controllers/eventos-esocial.controller.js");

after(() => {
  supabase.from = originalFrom;
  mock.restoreAll();
});
beforeEach(() => {
  filas.clear();
  mockEnviar.mock.resetCalls();
  mockEnviar.mock.mockImplementation(async () => ({
    status: "transmitido",
    numero_recibo: "1.2.0001234567890123",
  }));
});

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

const eventoAprovado = {
  id: EVENTO_ID,
  cliente_id: CLIENTE_ID,
  tipo_evento: "S-2200",
  xml_gerado: "<eSocial/>",
  status: "aprovado",
};

const eventoTransmitindo = {
  ...eventoAprovado,
  status: "transmitindo",
};

describe("eventos-esocial transmitir", () => {
  it("A7.1 409 se evento não está aprovado", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { ...eventoAprovado, status: "rascunho" },
      error: null,
    });
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.codigo, "EVENTO_NAO_APROVADO");
    assert.equal(mockEnviar.mock.calls.length, 0);
  });

  it("A7.2 400 sem certificado (antes do claim)", async () => {
    queue("eventos_esocial", "maybeSingle", { data: eventoAprovado, error: null });
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      body: { senha: "x" },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(mockEnviar.mock.calls.length, 0);
  });

  it("A7.3 200 transmitido: claim → SOAP → persiste numero_recibo", async () => {
    queue("eventos_esocial", "maybeSingle", { data: eventoAprovado, error: null });
    queue("eventos_esocial", "maybeSingle", { data: eventoTransmitindo, error: null });
    queue("eventos_esocial", "maybeSingle", {
      data: {
        ...eventoAprovado,
        status: "transmitido",
        numero_recibo: "1.2.0001234567890123",
      },
      error: null,
    });

    const { buffer, senha } = gerarPfxTeste();
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID, email: "a@b.com" },
      file: { buffer, originalname: "cert.pfx" },
      body: { senha },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "transmitido");
    assert.equal(res.body.numero_recibo, "1.2.0001234567890123");
    assert.equal(mockEnviar.mock.calls.length, 1);
  });

  it("A7.4 409 se claim falha (já em transmissão / corrida)", async () => {
    queue("eventos_esocial", "maybeSingle", { data: eventoAprovado, error: null });
    queue("eventos_esocial", "maybeSingle", { data: null, error: null });

    const { buffer, senha } = gerarPfxTeste();
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      file: { buffer, originalname: "cert.pfx" },
      body: { senha },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.erro, /já está em transmissão|não está aprovado/i);
    assert.equal(mockEnviar.mock.calls.length, 0);
  });

  it("A7.5 falha SOAP libera claim de volta para aprovado", async () => {
    mockEnviar.mock.mockImplementation(async () => {
      throw new ErroTransmissaoMock("Falha SOAP", "TRANSMISSAO_FALHOU", 502);
    });

    queue("eventos_esocial", "maybeSingle", { data: eventoAprovado, error: null });
    queue("eventos_esocial", "maybeSingle", { data: eventoTransmitindo, error: null });
    queue("eventos_esocial", "await", { data: { status: "aprovado" }, error: null });

    const { buffer, senha } = gerarPfxTeste();
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      file: { buffer, originalname: "cert.pfx" },
      body: { senha },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);

    assert.equal(res.statusCode, 502);
    assert.equal(mockEnviar.mock.calls.length, 1);
  });

  it("A7.6 202 quando gov ainda processa — mantém transmitindo + protocoloEnvio", async () => {
    mockEnviar.mock.mockImplementation(async () => ({
      status: "processando",
      protocoloEnvio: "1.2.202608.000000012345678",
    }));

    queue("eventos_esocial", "maybeSingle", { data: eventoAprovado, error: null });
    queue("eventos_esocial", "maybeSingle", { data: eventoTransmitindo, error: null });
    queue("eventos_esocial", "maybeSingle", {
      data: { ...eventoTransmitindo, data_envio: "2026-09-07T22:00:00.000Z" },
      error: null,
    });

    const { buffer, senha } = gerarPfxTeste();
    const req = {
      params: { id: EVENTO_ID },
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      file: { buffer, originalname: "cert.pfx" },
      body: { senha },
    };
    const res = criarResposta();
    await transmitirHandler(req, res);

    assert.equal(res.statusCode, 202);
    assert.equal(res.body.status, "transmitindo");
    assert.equal(res.body.protocoloEnvio, "1.2.202608.000000012345678");
    assert.equal(res.body.codigo, "PROCESSAMENTO_PENDENTE");
  });
});
