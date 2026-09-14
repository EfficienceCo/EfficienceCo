import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  criarFuncionarioDeS2200,
  desligarFuncionarioDeS2299,
} from "../src/services/esocial-funcionario.service.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const FUNC_ID = "44444444-4444-4444-4444-444444444444";

// ---------------------------------------------------------------------------
// Mock de supabase — mesmo padrão de tests/funcionarios.test.js
// ---------------------------------------------------------------------------
const originalFrom = supabase.from;
const filas = new Map();
const chamadas = [];
const insercoes = [];
const updates = [];

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
      updates.push({ tabela, dados });
      return builder;
    },
    eq(campo, valor) {
      chamadas.push({ tabela, metodo: "eq", campo, valor });
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle", { data: null, error: null }));
    },
    single() {
      return Promise.resolve(consumir("single", { data: null, error: null }));
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
  updates.length = 0;
});

// ---------------------------------------------------------------------------
// Fixtures — shape do formulário do gerador S-2200
// ---------------------------------------------------------------------------
function formularioS2200(overrides = {}) {
  return {
    funcionario: {
      cpf: "123.456.789-09",
      nome: "Maria Aparecida de Souza",
      endereco: { logradouro: "Rua das Acácias", numero: "120" },
      ...(overrides.funcionario ?? {}),
    },
    dadosAdmissao: {
      dataAdmissao: "2026-08-01",
      codCateg: 101,
      cargo: { nome: "Analista Contábil", cbo: "2522-10" },
      remuneracao: { valorSalarioFixo: 3500.5 },
      ...(overrides.dadosAdmissao ?? {}),
    },
  };
}

// ---------------------------------------------------------------------------
// criarFuncionarioDeS2200 — materializar a partir do rascunho aprovado
// ---------------------------------------------------------------------------
describe("criarFuncionarioDeS2200", () => {
  it("insere funcionário mapeando cpf/cbo/salário/data do formulário S-2200", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNC_ID, nome: "Maria Aparecida de Souza" },
      error: null,
    });

    const { funcionario, erro } = await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: formularioS2200(),
    });

    assert.equal(erro, null);
    assert.equal(funcionario.id, FUNC_ID);
    assert.equal(insercoes.length, 1);
    assert.deepEqual(insercoes[0].dados, {
      cliente_id: CLIENTE_ID,
      cpf: "12345678909",
      nome: "Maria Aparecida de Souza",
      data_admissao: "2026-08-01",
      endereco: { logradouro: "Rua das Acácias", numero: "120" },
      cargo: "Analista Contábil",
      cbo: "252210",
      categoria: "101",
      salario: "3500.50",
    });
  });

  it("normaliza data DD/MM/AAAA e salário pt-BR antes de inserir", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });
    queue("funcionarios", "maybeSingle", { data: { id: FUNC_ID }, error: null });

    await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: formularioS2200({
        dadosAdmissao: {
          dataAdmissao: "01/08/2026",
          codCateg: 101,
          cargo: { nome: "Analista", cbo: "2522-10" },
          remuneracao: { valorSalarioFixo: "3.500,50" },
        },
      }),
    });

    assert.equal(insercoes[0].dados.data_admissao, "2026-08-01");
    assert.equal(insercoes[0].dados.salario, "3500.50");
  });

  it("é idempotente: devolve o existente sem inserir de novo", async () => {
    const existente = { id: FUNC_ID, cpf: "12345678909", nome: "Maria" };
    queue("funcionarios", "maybeSingle", { data: existente, error: null });

    const { funcionario, erro } = await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: formularioS2200(),
    });

    assert.equal(erro, null);
    assert.equal(funcionario, existente);
    assert.equal(insercoes.length, 0);
    assert.ok(chamadas.some((c) => c.campo === "cpf" && c.valor === "12345678909"));
    assert.ok(chamadas.some((c) => c.campo === "data_admissao" && c.valor === "2026-08-01"));
  });

  it("recusa formulário incompleto sem chamar o banco", async () => {
    const { funcionario, erro } = await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: { funcionario: { cpf: "123" }, dadosAdmissao: {} },
    });

    assert.equal(funcionario, null);
    assert.match(erro, /incompleto/);
    assert.equal(insercoes.length, 0);
    assert.equal(chamadas.length, 0);
  });

  it("recusa quando salário ou data de admissão são inválidos", async () => {
    const { funcionario, erro } = await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: formularioS2200({
        dadosAdmissao: {
          dataAdmissao: "data-inválida",
          codCateg: 101,
          cargo: { nome: "X", cbo: "1" },
          remuneracao: { valorSalarioFixo: "abc" },
        },
      }),
    });

    assert.equal(funcionario, null);
    assert.match(erro, /incompleto/);
  });

  it("devolve erro amigável quando o insert falha no banco", async () => {
    queue("funcionarios", "maybeSingle", { data: null, error: null });
    queue("funcionarios", "maybeSingle", {
      data: null,
      error: { message: "unique violation" },
    });

    const { funcionario, erro } = await criarFuncionarioDeS2200({
      clienteId: CLIENTE_ID,
      dadosFormulario: formularioS2200(),
    });

    assert.equal(funcionario, null);
    assert.match(erro, /Falha ao criar funcionário/);
  });
});

// ---------------------------------------------------------------------------
// desligarFuncionarioDeS2299 — materializar desligamento do rascunho aprovado
// ---------------------------------------------------------------------------
describe("desligarFuncionarioDeS2299", () => {
  it("atualiza data_desligamento a partir de dadosAdmissao.desligamento.data", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNC_ID, data_desligamento: "2026-09-15" },
      error: null,
    });

    const { funcionario, erro } = await desligarFuncionarioDeS2299({
      funcionarioId: FUNC_ID,
      dadosFormulario: {
        dadosAdmissao: { desligamento: { data: "15/09/2026" } },
      },
    });

    assert.equal(erro, null);
    assert.equal(funcionario.id, FUNC_ID);
    assert.deepEqual(updates[0].dados, { data_desligamento: "2026-09-15" });
    assert.ok(chamadas.some((c) => c.campo === "id" && c.valor === FUNC_ID));
  });

  it("aceita desligamento.data e dataDesligamento como caminhos alternativos", async () => {
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNC_ID, data_desligamento: "2026-01-10" },
      error: null,
    });
    await desligarFuncionarioDeS2299({
      funcionarioId: FUNC_ID,
      dadosFormulario: { desligamento: { data: "2026-01-10" } },
    });
    assert.equal(updates[0].dados.data_desligamento, "2026-01-10");

    updates.length = 0;
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNC_ID, data_desligamento: "2026-02-20" },
      error: null,
    });
    await desligarFuncionarioDeS2299({
      funcionarioId: FUNC_ID,
      dadosFormulario: { dataDesligamento: "2026-02-20" },
    });
    assert.equal(updates[0].dados.data_desligamento, "2026-02-20");
  });

  it("usa a data de hoje quando nenhuma data de desligamento veio no formulário", async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    queue("funcionarios", "maybeSingle", {
      data: { id: FUNC_ID, data_desligamento: hoje },
      error: null,
    });

    await desligarFuncionarioDeS2299({
      funcionarioId: FUNC_ID,
      dadosFormulario: {},
    });

    assert.equal(updates[0].dados.data_desligamento, hoje);
  });

  it("recusa S-2299 sem funcionarioId", async () => {
    const { funcionario, erro } = await desligarFuncionarioDeS2299({
      funcionarioId: null,
      dadosFormulario: { dataDesligamento: "2026-09-01" },
    });

    assert.equal(funcionario, null);
    assert.match(erro, /sem funcionarioId/);
    assert.equal(updates.length, 0);
  });

  it("devolve erro amigável quando o update falha no banco", async () => {
    queue("funcionarios", "maybeSingle", {
      data: null,
      error: { message: "row not found" },
    });

    const { funcionario, erro } = await desligarFuncionarioDeS2299({
      funcionarioId: FUNC_ID,
      dadosFormulario: { dataDesligamento: "2026-09-01" },
    });

    assert.equal(funcionario, null);
    assert.match(erro, /Falha ao registrar desligamento/);
  });
});
