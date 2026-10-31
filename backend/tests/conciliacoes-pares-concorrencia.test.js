import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { confirmarPar, rejeitarPar } from "../src/controllers/conciliacoes.controller.js";

// #690 (BUG-CONC-13). Banco em memória que imita o que importa do Postgres aqui: o UPDATE
// condicional é atômico (confere o filtro e grava sem ceder a vez), então de dois pedidos
// sobre o mesmo par só um casa. Não prova o comportamento do banco real (isso é a TEST-9).

const CLIENTE = "11111111-1111-1111-1111-111111111111";
const CONCILIACAO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const USUARIO_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

let pares;
let conciliacao;

function novoEstado() {
  conciliacao = { id: CONCILIACAO_ID, cliente_id: CLIENTE, status: "em_andamento", total_conciliadas: 0, total_pendentes: 3 };
  pares = ["p1", "p2", "p3"].map((id, i) => ({
    id,
    conciliacao_id: CONCILIACAO_ID,
    transacao_id: `t${i}`,
    lancamento_id: `l${i}`,
    confianca: "provavel",
    confirmado_em: null,
    confirmado_por: null,
  }));
}

function recalcular() {
  const conciliados = pares.filter((p) => p.confianca === "automatico" || (p.confianca === "provavel" && p.confirmado_em));
  const pendentes = pares.filter(
    (p) => (p.confianca === "provavel" && !p.confirmado_em) || (p.confianca === "sem_par" && p.transacao_id),
  );
  conciliacao.total_conciliadas = conciliados.length;
  conciliacao.total_pendentes = pendentes.length;
}

const originalFrom = supabase.from;
const originalRpc = supabase.rpc;

supabase.rpc = async (nome) => {
  assert.equal(nome, "recalcular_totais_conciliacao");
  recalcular();
  return { data: null, error: null };
};

supabase.from = function (tabela) {
  const filtros = [];
  let operacao = "select";
  let campos = null;
  const casa = (linha) => filtros.every((f) => (f.nulo ? linha[f.col] == null : linha[f.col] === f.val));
  const builder = {
    select() { return builder; },
    insert(c) { operacao = "insert"; campos = c; return builder; },
    update(c) { operacao = "update"; campos = c; return builder; },
    delete() { operacao = "delete"; return builder; },
    eq(col, val) { filtros.push({ col, val }); return builder; },
    is(col) { filtros.push({ col, nulo: true }); return builder; },
    async maybeSingle() {
      await Promise.resolve(); // cede a vez: os dois pedidos leem antes de qualquer escrita
      const fonte = tabela === "conciliacoes" ? [conciliacao] : pares;
      const achada = fonte.find(casa);
      return { data: achada ? { ...achada } : null, error: null };
    },
    async single() {
      const novo = { id: `novo${pares.length}`, ...campos };
      pares.push(novo);
      return { data: { id: novo.id }, error: null };
    },
    then(resolve, reject) {
      let linhas = [];
      if (tabela === "pares_conciliacao" && operacao === "update") {
        linhas = pares.filter(casa);
        linhas.forEach((l) => Object.assign(l, campos));
      }
      if (tabela === "pares_conciliacao" && operacao === "delete") {
        pares = pares.filter((p) => !casa(p));
      }
      return Promise.resolve({ data: linhas.map((l) => ({ id: l.id })), error: null }).then(resolve, reject);
    },
  };
  return builder;
};

after(() => {
  supabase.from = originalFrom;
  supabase.rpc = originalRpc;
});

beforeEach(novoEstado);

function pedir(handler, pareId) {
  const res = {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
  const req = {
    usuario: { id: USUARIO_ID, perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE },
    params: { id: CONCILIACAO_ID, pareId },
    body: {},
    query: {},
  };
  return handler(req, res).then(() => res.statusCode);
}

describe("concorrência em confirmar/rejeitar par (#690)", () => {
  it("3× confirmar o mesmo par em paralelo: um 200 e dois 409", async () => {
    const status = await Promise.all([1, 2, 3].map(() => pedir(confirmarPar, "p1")));

    assert.deepEqual([...status].sort(), [200, 409, 409]);
    assert.equal(pares.find((p) => p.id === "p1").confianca, "provavel");
    assert.ok(pares.find((p) => p.id === "p1").confirmado_em);
    assert.equal(conciliacao.total_conciliadas, 1);
    assert.equal(conciliacao.total_pendentes, 2);
  });

  it("confirmar × rejeitar o mesmo par em paralelo: um 200 e um 409, estado coerente", async () => {
    const status = await Promise.all([pedir(confirmarPar, "p1"), pedir(rejeitarPar, "p1")]);

    assert.deepEqual([...status].sort(), [200, 409]);
    const p1 = pares.find((p) => p.id === "p1");
    // nunca "sem_par" e confirmado ao mesmo tempo, e o lançamento não aparece duplicado
    assert.ok(!(p1.confianca === "sem_par" && p1.confirmado_em));
    assert.equal(pares.filter((p) => p.lancamento_id === "l0").length, 1);
  });

  it("2× rejeitar o mesmo par em paralelo: um 200 e um 409, um único par de lançamento", async () => {
    const status = await Promise.all([pedir(rejeitarPar, "p1"), pedir(rejeitarPar, "p1")]);

    assert.deepEqual([...status].sort(), [200, 409]);
    assert.equal(pares.filter((p) => p.lancamento_id === "l0" && p.transacao_id === null).length, 1);
  });

  it("decisões em pares diferentes ao mesmo tempo: os totais batem com os pares", async () => {
    await Promise.all([pedir(confirmarPar, "p1"), pedir(confirmarPar, "p2"), pedir(rejeitarPar, "p3")]);

    assert.equal(conciliacao.total_conciliadas, 2);
    assert.equal(conciliacao.total_pendentes, 1); // a transação do p3 rejeitado segue pendente
    assert.equal(
      conciliacao.total_conciliadas + conciliacao.total_pendentes,
      pares.filter((p) => p.transacao_id).length,
    );
  });
});
