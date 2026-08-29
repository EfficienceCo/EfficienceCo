import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  criarRascunho,
  listarEventos,
  detalharEvento,
  aprovarEvento,
  baixarXml,
} from "../src/controllers/eventos-esocial.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const OUTRO_CLIENTE = "22222222-2222-2222-2222-222222222222";
const EVENTO_ID = "33333333-3333-3333-3333-333333333333";
const FUNC_ID = "44444444-4444-4444-4444-444444444444";

// ---------------------------------------------------------------------------
// Mock de supabase — filas por `tabela:metodo`, consumidas em FIFO.
// Mesmo padrão de tests/lancamentos-fiscais.test.js.
// ---------------------------------------------------------------------------
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
    insert() { return builder; },
    update() { return builder; },
    eq() { return builder; },
    order() { return builder; },
    range() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], count: 0, error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => { supabase.from = originalFrom; });
beforeEach(() => filas.clear());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function criarResposta() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
    send(p) { this.body = p; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

const usuarioCliente = { perfil: "admin_cliente", cliente_id: CLIENTE_ID, email: "contador@example.com" };
const usuarioStaff = { perfil: "admin_efficience", email: "staff@efficience.co" };

function funcionarioCLT() {
  return {
    cpf: "123.456.789-09",
    nome: "Maria Aparecida de Souza",
    sexo: "F",
    racaCor: 1,
    grauInstr: "07",
    dataNascimento: "1990-05-14",
    estadoCivil: 1,
    naturalidade: { codMunicipio: "3550308", uf: "SP" },
    endereco: {
      tipoLogradouro: "Rua", logradouro: "das Acácias", numero: "120",
      bairro: "Centro", cep: "01311-000", codMunicipio: "3550308", uf: "SP",
    },
    contato: { telefone: "(11) 98888-7777", email: "maria@example.com" },
  };
}

function admissaoCLT() {
  return {
    empregador: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
    matricula: "EMP0001",
    codCateg: 101,
    dataAdmissao: "2026-08-01",
    tpRegTrab: 1,
    tpRegPrev: 1,
    cadIni: false,
    tpAdmissao: 1,
    tpRegJor: 1,
    natAtividade: 1,
    fgts: { dataOpcao: "2026-08-01" },
    cargo: { nome: "Analista Contábil", cbo: "2522-10" },
    remuneracao: { valorSalarioFixo: 3500.5, unidadeSalarioFixo: 5 },
    duracao: { tpContr: 1 },
    localTrabalho: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
    horContratual: {
      qtdHrsSem: 44, tpJornada: 1, tmpParc: 0,
      horarioNoturno: false, descricaoJornada: "Segunda a sexta, 08h-18h",
    },
    ambiente: "homologacao",
  };
}

const formularioS2200 = () => ({ funcionario: funcionarioCLT(), dadosAdmissao: admissaoCLT() });

// ---------------------------------------------------------------------------
// POST /eventos-esocial
// ---------------------------------------------------------------------------
describe("criarRascunho", () => {
  it("gera o XML e grava rascunho para um S-2200 válido", async () => {
    queue("clientes", "maybeSingle", { data: { esocial_configurado: true }, error: null });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, tipo_evento: "S-2200", status: "rascunho", cliente_id: CLIENTE_ID },
      error: null,
    });

    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2200", dadosFormulario: formularioS2200() } };
    const res = criarResposta();
    await criarRascunho(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "rascunho");
    assert.equal(res.body.tipo_evento, "S-2200");
  });

  it("400 quando tipoEvento não está no catálogo", async () => {
    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-9999", dadosFormulario: {} } };
    const res = criarResposta();
    await criarRascunho(req, res);
    assert.equal(res.statusCode, 400);
  });

  it("400 quando o evento exige funcionário e funcionarioId não veio (S-2299)", async () => {
    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2299", dadosFormulario: {} } };
    const res = criarResposta();
    await criarRascunho(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /funcionarioId/);
  });

  it("409 ESOCIAL_NAO_CONFIGURADO no primeiro evento de um cliente sem configuração", async () => {
    queue("clientes", "maybeSingle", { data: { esocial_configurado: false }, error: null });
    queue("eventos_esocial", "await", { count: 0, error: null });

    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2200", dadosFormulario: formularioS2200() } };
    const res = criarResposta();
    await criarRascunho(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.codigo, "ESOCIAL_NAO_CONFIGURADO");
  });

  it("segue adiante se o cliente não está configurado mas já tem eventos anteriores", async () => {
    queue("clientes", "maybeSingle", { data: { esocial_configurado: false }, error: null });
    queue("eventos_esocial", "await", { count: 4, error: null });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, tipo_evento: "S-2200", status: "rascunho", cliente_id: CLIENTE_ID },
      error: null,
    });

    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2200", dadosFormulario: formularioS2200() } };
    const res = criarResposta();
    await criarRascunho(req, res);
    assert.equal(res.statusCode, 201);
  });

  it("422 EVENTO_NAO_SUPORTADO para um código catalogado sem gerador (S-2230)", async () => {
    queue("clientes", "maybeSingle", { data: { esocial_configurado: true }, error: null });

    const req = {
      usuario: usuarioCliente,
      body: { tipoEvento: "S-2230", funcionarioId: FUNC_ID, dadosFormulario: { qualquer: "coisa" } },
    };
    const res = criarResposta();
    await criarRascunho(req, res);

    assert.equal(res.statusCode, 422);
    assert.equal(res.body.codigo, "EVENTO_NAO_SUPORTADO");
  });

  it("422 com camposFaltando quando o formulário do S-2200 está incompleto", async () => {
    queue("clientes", "maybeSingle", { data: { esocial_configurado: true }, error: null });

    const dados = formularioS2200();
    delete dados.funcionario.nome;
    delete dados.funcionario.dataNascimento;

    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2200", dadosFormulario: dados } };
    const res = criarResposta();
    await criarRascunho(req, res);

    assert.equal(res.statusCode, 422);
    assert.ok(res.body.camposFaltando.includes("nome"));
  });

  it("staff (admin_efficience) precisa informar clienteId no body", async () => {
    const req = { usuario: usuarioStaff, body: { tipoEvento: "S-2200", dadosFormulario: formularioS2200() } };
    const res = criarResposta();
    await criarRascunho(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /clienteId/);
  });

  it("400 quando dadosFormulario não veio", async () => {
    const req = { usuario: usuarioCliente, body: { tipoEvento: "S-2200" } };
    const res = criarResposta();
    await criarRascunho(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /dadosFormulario/);
  });
});

// ---------------------------------------------------------------------------
// GET /eventos-esocial
// ---------------------------------------------------------------------------
describe("listarEventos", () => {
  it("devolve o histórico do cliente ordenado", async () => {
    queue("eventos_esocial", "await", {
      data: [
        { id: EVENTO_ID, tipo_evento: "S-2200", status: "aprovado" },
        { id: "outro", tipo_evento: "S-2299", status: "rascunho" },
      ],
      error: null,
    });

    const req = { usuario: usuarioCliente, query: {} };
    const res = criarResposta();
    await listarEventos(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 2);
  });

  it("devolve total/limit/offset para a paginação da timeline", async () => {
    queue("eventos_esocial", "await", { data: [{ id: EVENTO_ID }], count: 37, error: null });

    const req = { usuario: usuarioCliente, query: { limit: "5", offset: "10", funcionarioId: FUNC_ID } };
    const res = criarResposta();
    await listarEventos(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, 37);
    assert.equal(res.body.limit, 5);
    assert.equal(res.body.offset, 10);
  });

  it("range fora do total devolve lista vazia, não 500", async () => {
    queue("eventos_esocial", "await", { data: null, count: 3, error: { message: "Requested range not satisfiable" } });

    const req = { usuario: usuarioCliente, query: { offset: "999" } };
    const res = criarResposta();
    await listarEventos(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, []);
  });

  it("400 quando não há como resolver o clienteId", async () => {
    const req = { usuario: usuarioStaff, query: {} };
    const res = criarResposta();
    await listarEventos(req, res);
    assert.equal(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// GET /eventos-esocial/:id
// ---------------------------------------------------------------------------
describe("detalharEvento", () => {
  it("inclui o XML gerado", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, xml_gerado: "<eSocial/>", status: "rascunho" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await detalharEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.xml_gerado, "<eSocial/>");
  });

  it("404 quando o evento é de outro cliente", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: OUTRO_CLIENTE, status: "rascunho" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await detalharEvento(req, res);
    assert.equal(res.statusCode, 404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /eventos-esocial/:id/aprovar
// ---------------------------------------------------------------------------
describe("aprovarEvento", () => {
  it("passa de rascunho para aprovado e registra quem/quando", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2299", status: "rascunho", funcionario_id: FUNC_ID, dados_formulario: {} },
      error: null,
    });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2299", status: "aprovado", aprovado_por: "contador@example.com", aprovado_em: "2026-08-28T00:00:00Z" },
      error: null,
    });
    queue("funcionarios", "maybeSingle", { data: { id: FUNC_ID, data_desligamento: "2026-08-28" }, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "aprovado");
    assert.equal(res.body.aprovado_por, "contador@example.com");
    assert.ok(res.body.aprovado_em);
  });

  it("não sobrescreve aprovação já existente (409)", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);
    assert.equal(res.statusCode, 409);
  });

  it("ao aprovar um S-2200 cria o registro em funcionarios", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: {
        id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "rascunho",
        funcionario_id: null, dados_formulario: formularioS2200(),
      },
      error: null,
    });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado" },
      error: null,
    });
    // service: busca funcionário existente -> não acha -> insere
    queue("funcionarios", "maybeSingle", { data: null, error: null });
    queue("funcionarios", "maybeSingle", { data: { id: FUNC_ID, nome: "Maria Aparecida de Souza" }, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.funcionarioCriado.id, FUNC_ID);
    assert.equal(res.body.funcionario_id, FUNC_ID);
  });

  it("S-2200 reaproveita funcionário já existente (idempotente) sem inserir de novo", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: {
        id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "rascunho",
        funcionario_id: null, dados_formulario: formularioS2200(),
      },
      error: null,
    });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado" },
      error: null,
    });
    // service: já existe -> devolve o existente, NÃO enfileira insert
    queue("funcionarios", "maybeSingle", { data: { id: FUNC_ID, nome: "Maria Aparecida de Souza" }, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.funcionarioCriado.id, FUNC_ID);
    assert.equal(res.body.aviso, undefined);
  });

  it("normaliza salário pt-BR e data DD/MM/AAAA do formulário ao criar o funcionário", async () => {
    const dados = formularioS2200();
    dados.dadosAdmissao.dataAdmissao = "01/08/2026";
    dados.dadosAdmissao.remuneracao.valorSalarioFixo = "3.500,50";

    queue("eventos_esocial", "maybeSingle", {
      data: {
        id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "rascunho",
        funcionario_id: null, dados_formulario: dados,
      },
      error: null,
    });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado" },
      error: null,
    });
    queue("funcionarios", "maybeSingle", { data: null, error: null });
    queue("funcionarios", "maybeSingle", { data: { id: FUNC_ID }, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.funcionarioCriado.id, FUNC_ID);
    assert.equal(res.body.aviso, undefined);
  });

  it("404 quando o evento não existe", async () => {
    queue("eventos_esocial", "maybeSingle", { data: null, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);
    assert.equal(res.statusCode, 404);
  });

  it("aprovação persiste mesmo se a criação do funcionário falhar (devolve aviso)", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: {
        id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "rascunho",
        funcionario_id: null, dados_formulario: { funcionario: {}, dadosAdmissao: {} },
      },
      error: null,
    });
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await aprovarEvento(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "aprovado");
    assert.ok(res.body.aviso);
  });
});

// ---------------------------------------------------------------------------
// GET /eventos-esocial/:id/xml
// ---------------------------------------------------------------------------
describe("baixarXml", () => {
  it("409 EVENTO_NAO_APROVADO quando o evento ainda é rascunho", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "rascunho", xml_gerado: "<eSocial/>" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await baixarXml(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.codigo, "EVENTO_NAO_APROVADO");
  });

  it("entrega o XML com headers de download quando aprovado", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado", xml_gerado: "<eSocial>ok</eSocial>" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await baixarXml(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body, "<eSocial>ok</eSocial>");
    assert.match(res.headers["Content-Type"], /xml/);
    assert.match(res.headers["Content-Disposition"], /attachment; filename="S-2200-/);
  });

  it("libera download para estados posteriores a aprovado (ex.: transmitido)", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "transmitido", xml_gerado: "<x/>" },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await baixarXml(req, res);
    assert.equal(res.statusCode, 200);
  });

  it("404 quando o evento não existe", async () => {
    queue("eventos_esocial", "maybeSingle", { data: null, error: null });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await baixarXml(req, res);
    assert.equal(res.statusCode, 404);
  });

  it("404 quando aprovado mas sem xml_gerado", async () => {
    queue("eventos_esocial", "maybeSingle", {
      data: { id: EVENTO_ID, cliente_id: CLIENTE_ID, tipo_evento: "S-2200", status: "aprovado", xml_gerado: null },
      error: null,
    });

    const req = { usuario: usuarioCliente, params: { id: EVENTO_ID } };
    const res = criarResposta();
    await baixarXml(req, res);
    assert.equal(res.statusCode, 404);
  });
});
