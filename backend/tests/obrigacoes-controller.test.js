import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  atualizarObrigacao,
  proximasObrigacoes,
} from "../src/controllers/obrigacoes.controller.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const OBRIGACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase — filas por `tabela:metodo`, consumidas em FIFO.
// Mesmo padrão de tests/clientes-atualizar.test.js.
// ---------------------------------------------------------------------------
const originalFrom = supabase.from;
const filas = new Map();
const chamadas = [];
const updates = [];
const insercoes = [];
const chave = (t, m) => `${t}:${m}`;

function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  chamadas.push(tabela);
  const consumir = (metodo, fallback) => {
    const fila = filas.get(chave(tabela, metodo));
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    insert(dados) { insercoes.push({ tabela, dados }); return builder; },
    update(dados) { updates.push({ tabela, dados }); return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    ilike() { return builder; },
    order() { return builder; },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => { supabase.from = originalFrom; });

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  updates.length = 0;
  insercoes.length = 0;
});

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

const usuario = { perfil: "admin_cliente", cliente_id: CLIENTE_ID };

function emDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// #529 — GET /obrigacoes/proximas deixou de gerar notificação como efeito
// colateral; quem alerta agora é o job diário.
// ---------------------------------------------------------------------------
describe("#529 — proximasObrigacoes não notifica mais", () => {
  it("obrigação vencendo em 1 dia: responde 200 sem tocar em notificacoes", async () => {
    queue("obrigacoes", "await", {
      data: [
        {
          id: OBRIGACAO_ID,
          cliente_id: CLIENTE_ID,
          nome: "DAS Simples Nacional",
          data_vencimento: emDias(1),
          status: "pendente",
        },
      ],
      error: null,
    });

    const req = { usuario, query: {} };
    const res = criarResposta();
    await proximasObrigacoes(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.ok(!chamadas.includes("notificacoes"), "não deve consultar notificacoes");
    assert.equal(insercoes.length, 0);
  });
});

// ---------------------------------------------------------------------------
// #529 — mover o vencimento reabre o ciclo de marcos da obrigação.
// ---------------------------------------------------------------------------
describe("#529 — atualizarObrigacao e o ciclo de marcos", () => {
  function enfileirarObrigacaoExistente() {
    queue("obrigacoes", "maybeSingle", {
      data: { cliente_id: CLIENTE_ID, tipo: "mensal", status: "pendente", recorrente: true },
      error: null,
    });
  }

  it("novo data_vencimento zera ultimo_marco_alertado", async () => {
    enfileirarObrigacaoExistente();
    queue("obrigacoes", "single", {
      data: { id: OBRIGACAO_ID, data_vencimento: emDias(45) },
      error: null,
    });

    const req = {
      usuario,
      params: { id: OBRIGACAO_ID },
      body: { data_vencimento: emDias(45) },
    };
    const res = criarResposta();
    await atualizarObrigacao(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].dados.ultimo_marco_alertado, null);
  });

  it("alterar só o nome preserva o marco já alertado", async () => {
    enfileirarObrigacaoExistente();
    queue("obrigacoes", "single", {
      data: { id: OBRIGACAO_ID, nome: "DAS renomeado" },
      error: null,
    });

    const req = {
      usuario,
      params: { id: OBRIGACAO_ID },
      body: { nome: "DAS renomeado" },
    };
    const res = criarResposta();
    await atualizarObrigacao(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updates.length, 1);
    assert.ok(!("ultimo_marco_alertado" in updates[0].dados));
  });
});
