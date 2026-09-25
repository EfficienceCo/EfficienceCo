import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  criarLancamentoFiscal,
  listarLancamentosFiscais,
  resumoLancamentosFiscais,
} from "../src/controllers/lancamentos-fiscais.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const CLIENTE_ID_OUTRO = "22222222-2222-2222-2222-222222222222";
const CNPJ_EMIT = "12345678000190";
const CNPJ_DEST = "98765432000155";
const CNPJ_ALHEIO = "11111111000191";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const insercoes = [];
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
    insert(payload) { insercoes.push(payload); return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
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
  insercoes.length = 0;
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
  };
}

function tokenValido(override = {}) {
  queue("licencas", "single", {
    data: { cliente_id: CLIENTE_ID, ativa: true, validade: "2099-12-31", ...override },
    error: null,
  });
}

function clienteComCnpj(cnpj, id = CLIENTE_ID) {
  queue("clientes", "maybeSingle", {
    data: { id, cnpj },
    error: null,
  });
}

function payloadValido(overrides = {}) {
  return {
    chave_nfe: "35240612345678000190550010000000011234567890",
    tipo: "saida",
    cnpj_emitente: CNPJ_EMIT,
    cnpj_destinatario: CNPJ_DEST,
    valor_total: 1000.5,
    data_emissao: "2026-07-15",
    cliente_id: CLIENTE_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /lancamentos-fiscais
// ---------------------------------------------------------------------------

describe("POST /lancamentos-fiscais", () => {
  it("201 e persiste quando payload válido e chave_nfe inédita", async () => {
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", { data: { id: "novo-id", ...payloadValido() }, error: null });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.id, "novo-id");
    assert.equal(insercoes.length, 1);
    assert.equal(insercoes[0].valor_total, "1000.50");
    assert.equal(insercoes[0].icms, "0.00");
    assert.equal(insercoes[0].pis, "0.00");
    assert.equal(insercoes[0].cofins, "0.00");
    assert.equal(insercoes[0].ipi, "0.00");
    assert.equal(insercoes[0].arquivo_xml, null);
  });

  it("422 quando data_emissao é futura (BUG-APUR-08)", async () => {
    tokenValido();
    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({ data_emissao: "2099-12-08" }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 422);
    assert.match(res.body.campos.data_emissao, /não pode ser futura/i);
    assert.equal(insercoes.length, 0);
  });

  it("403 quando cliente_id do payload não pertence ao token", async () => {
    tokenValido();
    // Nem chega a validar CNPJ: isolamento por licença vem primeiro.
    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({ cliente_id: CLIENTE_ID_OUTRO }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.erro, /não corresponde ao token/i);
  });

  it("409 quando já existe lançamento para o mesmo (cliente_id, chave_nfe)", async () => {
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: { id: "existente" }, error: null });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("409 quando insert colide por unique_violation (corrida entre chamadas concorrentes)", async () => {
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", {
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 409);
  });

  it("401 quando token de agente inválido", async () => {
    queue("licencas", "single", { data: null, error: null });

    const req = { headers: { "x-licenca-token": "invalido" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 401);
  });

  it("400 quando campo obrigatório está faltando", async () => {
    tokenValido();
    const { chave_nfe, ...semChave } = payloadValido();

    const req = { headers: { "x-licenca-token": "tok" }, body: semChave };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 400);
    assert.ok(res.body.faltando.includes("chave_nfe"));
  });

  it("400 quando tipo não é entrada nem saida", async () => {
    tokenValido();

    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({ tipo: "transferencia" }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("403 quando CNPJ do cliente da licença não corresponde ao tipo da nota", async () => {
    tokenValido();
    clienteComCnpj(CNPJ_ALHEIO);

    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido(),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.erro, /CNPJ/i);
  });

  it("422 com mensagem por campo e sem insert (BUG-NFE-08 / #568)", async () => {
    const casos = [
      ["valor_total texto", { valor_total: "abc" }, "valor_total", /deve ser um número/i],
      ["valor_total negativo", { valor_total: "-10.00" }, "valor_total", /não pode ser negativo/i],
      ["valor_total estoura numeric(14,2)", { valor_total: "123456789012345.67" }, "valor_total", /numeric\(14,2\)/i],
      ["valor_total com 3 casas decimais", { valor_total: "10.999" }, "valor_total", /2 casas decimais/i],
      ["valor_total numérico com 3 casas", { valor_total: 10.999 }, "valor_total", /2 casas decimais/i],
      ["icms negativo", { icms: "-5" }, "icms", /não pode ser negativo/i],
      ["pis negativo", { pis: -1 }, "pis", /não pode ser negativo/i],
      ["data inexistente", { data_emissao: "2026-02-30" }, "data_emissao", /data existente/i],
      ["data em dd/mm/aaaa", { data_emissao: "31/03/2026" }, "data_emissao", /YYYY-MM-DD/i],
      ["data futura", { data_emissao: "2027-01-01" }, "data_emissao", /não pode ser futura/i],
      ["chave com 44 letras", { chave_nfe: "A".repeat(44) }, "chave_nfe", /44 dígitos/i],
      ["chave com 45 caracteres", { chave_nfe: "1".repeat(45) }, "chave_nfe", /44 dígitos/i],
      ["chave com 10 caracteres", { chave_nfe: "1234567890" }, "chave_nfe", /44 dígitos/i],
      ["cnpj_emitente com 15 caracteres", { cnpj_emitente: "112223330001811" }, "cnpj_emitente", /14 dígitos/i],
      ["cnpj_destinatario com 15 caracteres", { cnpj_destinatario: "112223330001811" }, "cnpj_destinatario", /14 dígitos|11 dígitos/i],
      [
        "arquivo_xml absoluto no Windows",
        { arquivo_xml: "C:\\Users\\joao\\x.xml" },
        "arquivo_xml",
        /caminho relativo/i,
      ],
      ["arquivo_xml absoluto POSIX", { arquivo_xml: "/var/nfe/x.xml" }, "arquivo_xml", /caminho relativo/i],
      ["arquivo_xml com ..", { arquivo_xml: "empresa/../../segredo.xml" }, "arquivo_xml", /caminho relativo/i],
      [
        "arquivo_xml UNC",
        { arquivo_xml: "\\\\servidor\\share\\x.xml" },
        "arquivo_xml",
        /caminho relativo/i,
      ],
    ];

    for (const [nome, over, campo, mensagem] of casos) {
      tokenValido();
      const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido(over) };
      const res = criarResposta();
      await criarLancamentoFiscal(req, res);

      assert.equal(res.statusCode, 422, nome);
      assert.equal(res.body.erro, "Dados do lançamento fiscal inválidos", nome);
      assert.match(res.body.campos[campo], mensagem, `${nome}: ${res.body.campos?.[campo]}`);
      assert.equal(insercoes.length, 0, nome);
    }
  });

  it("422 lista todos os campos inválidos do mesmo payload", async () => {
    tokenValido();
    const req = {
      headers: { "x-licenca-token": "tok" },
      body: payloadValido({
        valor_total: "abc",
        data_emissao: "2026-02-30",
        chave_nfe: "123",
      }),
    };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 422);
    assert.match(res.body.campos.valor_total, /número/i);
    assert.match(res.body.campos.data_emissao, /YYYY-MM-DD/i);
    assert.match(res.body.campos.chave_nfe, /44 dígitos/i);
    assert.equal(insercoes.length, 0);
  });

  it("201 quando valor_total é zero e grava escala 2 sem arredondar outra casa", async () => {
    const corpo = payloadValido({
      valor_total: "0",
      icms: "1.80",
      arquivo_xml: "Cliente Teste/Notas Fiscais/2026-03/x.xml",
    });
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", { data: { id: "zero", ...corpo }, error: null });

    const req = { headers: { "x-licenca-token": "tok" }, body: corpo };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(insercoes.length, 1);
    assert.equal(insercoes[0].valor_total, "0.00");
    assert.equal(insercoes[0].icms, "1.80");
    assert.equal(insercoes[0].arquivo_xml, "Cliente Teste/Notas Fiscais/2026-03/x.xml");
  });

  it("201 no teto de numeric(14,2) e 422 um dígito acima", async () => {
    const noTeto = payloadValido({ valor_total: "999999999999.99" });
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", { data: { id: "teto" }, error: null });

    const aceito = criarResposta();
    await criarLancamentoFiscal({ headers: { "x-licenca-token": "tok" }, body: noTeto }, aceito);
    assert.equal(aceito.statusCode, 201);
    assert.equal(insercoes[0].valor_total, "999999999999.99");

    tokenValido();
    const estoura = criarResposta();
    await criarLancamentoFiscal(
      {
        headers: { "x-licenca-token": "tok" },
        body: payloadValido({ valor_total: "1000000000000.00" }),
      },
      estoura,
    );
    assert.equal(estoura.statusCode, 422);
    assert.match(estoura.body.campos.valor_total, /numeric\(14,2\)/i);
    assert.equal(insercoes.length, 1);
  });

  it("422 quando o banco recusa numeric overflow em vez de 500 genérico", async () => {
    tokenValido();
    clienteComCnpj(CNPJ_EMIT);
    queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
    queue("lancamentos_fiscais", "single", {
      data: null,
      error: { code: "22003", message: "numeric field overflow" },
    });

    const req = { headers: { "x-licenca-token": "tok" }, body: payloadValido() };
    const res = criarResposta();
    await criarLancamentoFiscal(req, res);

    assert.equal(res.statusCode, 422);
    assert.match(res.body.detalhe, /faixa numérica/i);
    assert.notEqual(res.body.erro, "Erro ao registrar lançamento fiscal");
  });

  it("422 quando o banco recusa formato ou check, sem gravar 500 genérico", async () => {
    const codigos = [
      ["22P02", /formato inválido/i],
      ["22008", /data_emissao inválida/i],
      ["23514", /regra de integridade/i],
      ["22001", /tamanho aceito/i],
    ];

    for (const [code, mensagem] of codigos) {
      tokenValido();
      clienteComCnpj(CNPJ_EMIT);
      queue("lancamentos_fiscais", "maybeSingle", { data: null, error: null });
      queue("lancamentos_fiscais", "single", {
        data: null,
        error: { code, message: `postgres ${code}` },
      });

      const res = criarResposta();
      await criarLancamentoFiscal(
        { headers: { "x-licenca-token": "tok" }, body: payloadValido() },
        res,
      );

      assert.equal(res.statusCode, 422, code);
      assert.match(res.body.detalhe, mensagem, code);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-fiscais
// ---------------------------------------------------------------------------

describe("GET /lancamentos-fiscais", () => {
  function reqBase(overrides = {}) {
    return {
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
      query: {},
      ...overrides,
    };
  }

  it("200 com a lista de lançamentos do cliente", async () => {
    queue("lancamentos_fiscais", "await", {
      data: [
        { id: "1", data_emissao: "2026-07-20" },
        { id: "2", data_emissao: "2026-07-10" },
      ],
      error: null,
    });

    const res = criarResposta();
    await listarLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
  });

  it("400 quando clienteId ausente (perfil admin_efficience sem query)", async () => {
    const req = reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await listarLancamentosFiscais(req, res);

    assert.equal(res.statusCode, 400);
  });

  it("500 quando o Supabase retorna erro", async () => {
    queue("lancamentos_fiscais", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// GET /lancamentos-fiscais/resumo
// ---------------------------------------------------------------------------

describe("GET /lancamentos-fiscais/resumo", () => {
  function reqBase(overrides = {}) {
    return {
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
      query: {},
      ...overrides,
    };
  }

  it("200 com totais agregados corretos", async () => {
    queue("lancamentos_fiscais", "await", {
      data: [
        { tipo: "entrada", valor_total: 100, icms: 10, pis: 1, cofins: 2, ipi: 0 },
        { tipo: "saida", valor_total: 200, icms: 20, pis: 2, cofins: 4, ipi: 5 },
        { tipo: "saida", valor_total: 50, icms: 5, pis: 0.5, cofins: 1, ipi: 0 },
      ],
      error: null,
    });

    const res = criarResposta();
    await resumoLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      total_nfe: 3,
      valor_total: 350,
      icms: 35,
      pis: 3.5,
      cofins: 7,
      ipi: 5,
      entradas: 1,
      saidas: 2,
    });
  });

  it("200 com zeros quando não há lançamentos no período", async () => {
    queue("lancamentos_fiscais", "await", { data: [], error: null });

    const res = criarResposta();
    await resumoLancamentosFiscais(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total_nfe, 0);
    assert.equal(res.body.valor_total, 0);
  });

  it("400 quando clienteId ausente", async () => {
    const req = reqBase({ usuario: { perfil: PERFIS.ADMIN_EFFICIENCE }, query: {} });
    const res = criarResposta();
    await resumoLancamentosFiscais(req, res);

    assert.equal(res.statusCode, 400);
  });
});
