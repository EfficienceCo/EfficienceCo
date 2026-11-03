import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { confirmarPar, rejeitarPar } from "../src/controllers/conciliacoes.controller.js";

// #690 (BUG-CONC-13). Banco em memória: as functions confirmar_par_conciliacao e
// rejeitar_par_conciliacao (migration 105) são imitadas em JS e executam sem ceder a vez, como
// a transação do Postgres. Prova que o controller traduz o resultado delas em 200/409 e que
// ele não escreve nada fora da function; NÃO prova o SQL nem o lock do banco (isso é teste
// com banco real, TEST-9/#686).

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

supabase.rpc = async (nome, args) => {
  const par = pares.find((p) => p.id === args.p_par_id);
  const disponivel = par && par.confianca === "provavel" && !par.confirmado_em;
  if (nome === "confirmar_par_conciliacao") {
    if (!disponivel) return { data: false, error: null };
    par.confirmado_em = "agora";
    par.confirmado_por = args.p_usuario_id;
    recalcular();
    return { data: true, error: null };
  }
  assert.equal(nome, "rejeitar_par_conciliacao");
  if (!disponivel) return { data: null, error: null };
  const lancamentoId = par.lancamento_id;
  Object.assign(par, { lancamento_id: null, confianca: "sem_par" });
  const novo = { id: `novo${pares.length}`, conciliacao_id: CONCILIACAO_ID, transacao_id: null, lancamento_id: lancamentoId, confianca: "sem_par" };
  pares.push(novo);
  return { data: novo.id, error: null };
};

supabase.from = function (tabela) {
  const filtros = [];
  const casa = (linha) => filtros.every((f) => linha[f.col] === f.val);
  const builder = {
    select() { return builder; },
    eq(col, val) { filtros.push({ col, val }); return builder; },
    async maybeSingle() {
      await Promise.resolve(); // cede a vez: os dois pedidos leem antes de qualquer escrita
      const fonte = tabela === "conciliacoes" ? [conciliacao] : pares;
      const achada = fonte.find(casa);
      return { data: achada ? { ...achada } : null, error: null };
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
