// FOLHA-8 (#748): unitário do checklist automático da folha (folha-checklist.service.js).
// Banco falso: confere as consultas que o service monta (catch-up por marco, filtro
// concluida = false, cliente vindo do processamento) e que ele nunca lança. O comportamento
// no banco real fica em folha-checklist-http.test.js.
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  avancarChecklistFolha,
  garantirProcessoFolha,
  mesReferenciaAtual,
} from "../src/services/folha-checklist.service.js";

const PROC_FOLHA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROCESSO_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENTE_A = "11111111-1111-4111-8111-111111111111";

const filas = new Map();
const chamadas = [];

function queue(tabela, metodo, resultado) {
  const k = `${tabela}:${metodo}`;
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo) => {
    const fila = filas.get(`${tabela}:${metodo}`);
    return fila?.length ? fila.shift() : { data: null, error: null };
  };
  const registrar = (metodo) => (...args) => {
    chamadas.push({ tabela, metodo, args });
    return builder;
  };
  const builder = {
    select: registrar("select"),
    insert: registrar("insert"),
    update: registrar("update"),
    delete: registrar("delete"),
    eq: registrar("eq"),
    in: registrar("in"),
    single: () => Promise.resolve(consumir("single")),
    maybeSingle: () => Promise.resolve(consumir("maybeSingle")),
    then: (resolve, reject) => Promise.resolve(consumir("await")).then(resolve, reject),
  };
  return builder;
};

function processamentoDoA() {
  queue("processamentos_folha", "maybeSingle", {
    data: { cliente_id: CLIENTE_A, mes_referencia: "2026-10-01" },
    error: null,
  });
}

function processoExistente(status = "em_andamento") {
  queue("processos", "maybeSingle", {
    data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, tipo: "folha_pagamento", status, mes_referencia: "2026-10-01" },
    error: null,
  });
}

function filtros(tabela, metodo) {
  return chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);
}

describe("avancarChecklistFolha", () => {
  let erroLog;

  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
    erroLog = mock.method(console, "error", () => {});
  });
  afterEach(() => erroLog.mock.restore());

  const casos = [
    ["recebida", ["folha_planilha_recebida"]],
    ["calculada", ["folha_planilha_recebida", "folha_calculada"]],
    ["holerites", ["folha_planilha_recebida", "folha_calculada", "folha_holerites_gerados"]],
  ];

  for (const [marco, acoes] of casos) {
    it(`marco ${marco}: conclui as automáticas até ele (catch-up), só as pendentes`, async () => {
      processamentoDoA();
      processoExistente();
      queue("etapas", "await", { data: acoes.map((_, i) => ({ id: `e${i}` })), error: null });
      queue("etapas", "await", { data: [{ concluida: true }, { concluida: false }], error: null });

      const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, marco);

      assert.deepEqual(resultado, { processoId: PROCESSO_ID, etapasConcluidas: acoes.length, processoConcluido: false });
      assert.equal(erroLog.mock.callCount(), 0);
      // O processo é o do cliente e mês DO PROCESSAMENTO.
      assert.deepEqual(filtros("processamentos_folha", "eq"), [["id", PROC_FOLHA_ID]]);
      assert.deepEqual(filtros("processos", "eq"), [
        ["cliente_id", CLIENTE_A],
        ["tipo", "folha_pagamento"],
        ["mes_referencia", "2026-10-01"],
      ]);
      // UPDATE só nas automáticas pendentes do processo, nunca desfaz.
      const [update] = filtros("etapas", "update");
      assert.equal(update[0].concluida, true);
      assert.equal(update[0].status, "concluida");
      const eqEtapas = filtros("etapas", "eq");
      assert.deepEqual(eqEtapas.slice(0, 3), [
        ["processo_id", PROCESSO_ID],
        ["tipo", "automatizada"],
        ["concluida", false],
      ]);
      assert.deepEqual(filtros("etapas", "in"), [["acao", acoes]]);
    });
  }

  it("todas as etapas concluídas: fecha o processo em andamento", async () => {
    processamentoDoA();
    processoExistente();
    queue("etapas", "await", { data: [{ id: "e3" }], error: null });
    queue("etapas", "await", { data: Array(6).fill({ concluida: true }), error: null });
    queue("processos", "maybeSingle", { data: { tipo: "folha_pagamento" }, error: null });

    const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, "holerites");

    assert.equal(resultado.processoConcluido, true);
    assert.deepEqual(filtros("processos", "update"), [[{ status: "concluido" }]]);
    assert.deepEqual(filtros("processos", "eq").slice(-2), [["id", PROCESSO_ID], ["status", "em_andamento"]]);
  });

  it("processo concluído ou cancelado: não mexe nas etapas", async () => {
    processamentoDoA();
    processoExistente("concluido");

    const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, "holerites");

    assert.deepEqual(resultado, { processoId: PROCESSO_ID, etapasConcluidas: 0, processoConcluido: false });
    assert.deepEqual(filtros("etapas", "update"), []);
  });

  it("erro no UPDATE das etapas: não lança, loga com o id do processamento e não fecha o processo", async () => {
    processamentoDoA();
    processoExistente();
    queue("etapas", "await", { data: null, error: { message: "banco fora (teste)" } });

    const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, "calculada");

    assert.equal(resultado.erro, "banco fora (teste)");
    assert.equal(erroLog.mock.callCount(), 1);
    assert.match(erroLog.mock.calls[0].arguments[0], new RegExp(PROC_FOLHA_ID));
    assert.deepEqual(filtros("processos", "update"), []);
  });

  it("processamento inexistente: não cria processo nem mexe em etapa", async () => {
    const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, "recebida");

    assert.match(resultado.erro, /processamento não encontrado/);
    assert.equal(chamadas.some((c) => c.tabela !== "processamentos_folha"), false);
  });

  it("marco desconhecido: não consulta o banco", async () => {
    const resultado = await avancarChecklistFolha(PROC_FOLHA_ID, "fgts");

    assert.match(resultado.erro, /marco desconhecido/);
    assert.equal(chamadas.length, 0);
  });
});

describe("garantirProcessoFolha", () => {
  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
  });

  it("sem processo: cria com as 6 etapas", async () => {
    queue("processos", "single", { data: { id: PROCESSO_ID, status: "em_andamento" }, error: null });
    queue("etapas", "await", { data: Array(6).fill({}), error: null });

    const resultado = await garantirProcessoFolha(CLIENTE_A, "2026-10-01");

    assert.equal(resultado.criado, true);
    assert.equal(resultado.processo.id, PROCESSO_ID);
    const [[insertProcesso]] = filtros("processos", "insert");
    assert.equal(insertProcesso.mes_referencia, "2026-10-01");
    assert.equal(insertProcesso.cliente_id, CLIENTE_A);
    assert.equal(filtros("etapas", "insert")[0][0].length, 6);
  });

  it("perde a corrida (23505): devolve o processo de quem ganhou, sem erro", async () => {
    queue("processos", "maybeSingle", { data: null, error: null });
    queue("processos", "single", { data: null, error: { message: "duplicate key", code: "23505" } });
    queue("processos", "maybeSingle", { data: { id: PROCESSO_ID, status: "em_andamento" }, error: null });

    const resultado = await garantirProcessoFolha(CLIENTE_A, "2026-10-01");

    assert.deepEqual(resultado, { processo: { id: PROCESSO_ID, status: "em_andamento" }, criado: false });
    assert.deepEqual(filtros("etapas", "insert"), []);
  });

  it("outro erro na criação: devolve o erro", async () => {
    queue("processos", "single", { data: null, error: { message: "fora do ar", code: "08006" } });

    assert.deepEqual(await garantirProcessoFolha(CLIENTE_A, "2026-10-01"), { erro: "fora do ar" });
  });
});

describe("mesReferenciaAtual", () => {
  it("usa o mês corrente no formato YYYY-MM-01", () => {
    assert.equal(mesReferenciaAtual(new Date(2026, 0, 31)), "2026-01-01");
    assert.equal(mesReferenciaAtual(new Date(2026, 10, 20)), "2026-11-01");
  });
});
