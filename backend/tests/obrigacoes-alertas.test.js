import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { calcularDiasRestantes } from "../src/utils/prazo.util.js";
import {
  MARCOS_ALERTA_OBRIGACAO,
  varrearAlertasObrigacoes,
} from "../src/services/obrigacoes-alertas.service.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const OBG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OBG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Data fixa: 2026-09-07 (segunda) — evita flakiness de fuso/relógio. */
const HOJE = new Date(2026, 8, 7);

function dataEmDias(hoje, n) {
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function criarMockSupabase() {
  const filas = new Map();
  const chamadas = [];
  const insercoes = [];
  const updates = [];

  function chave(tabela, metodo) {
    return `${tabela}:${metodo}`;
  }

  return {
    chamadas,
    insercoes,
    updates,
    queue(tabela, metodo, resultado) {
      const k = chave(tabela, metodo);
      if (!filas.has(k)) filas.set(k, []);
      filas.get(k).push(resultado);
    },
    from(tabela) {
      const consumir = (metodo, fallback = { data: null, error: null }) => {
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
          chamadas.push({ tabela, metodo: "update", dados });
          return builder;
        },
        eq(campo, valor) {
          chamadas.push({ tabela, metodo: "eq", campo, valor });
          return builder;
        },
        in(campo, valores) {
          chamadas.push({ tabela, metodo: "in", campo, valores });
          return builder;
        },
        gte(campo, valor) {
          chamadas.push({ tabela, metodo: "gte", campo, valor });
          return builder;
        },
        lte(campo, valor) {
          chamadas.push({ tabela, metodo: "lte", campo, valor });
          return builder;
        },
        or(expr) {
          chamadas.push({ tabela, metodo: "or", expr });
          return builder;
        },
        then(resolve, reject) {
          return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function obrigacaoAberta({
  id = OBG_A,
  clienteId = CLIENTE_A,
  dias,
  ultimoMarco = null,
  status = "pendente",
  nome = "DAS Simples Nacional",
}) {
  return {
    id,
    cliente_id: clienteId,
    nome,
    data_vencimento: dataEmDias(HOJE, dias),
    status,
    ultimo_marco_alertado: ultimoMarco,
  };
}

describe("#529 — varrearAlertasObrigacoes", () => {
  let supabase;
  let notificacoes;

  beforeEach(() => {
    supabase = criarMockSupabase();
    notificacoes = [];
  });

  async function varrear() {
    return varrearAlertasObrigacoes({
      supabase,
      hoje: HOJE,
      criarNotificacao: async (clienteId, tipo, mensagem) => {
        notificacoes.push({ clienteId, tipo, mensagem });
      },
    });
  }

  function enfileirarAlertaCompleto(obrigacao, idEvento = "evt-1") {
    supabase.queue("obrigacoes", "await", { data: [obrigacao], error: null });
    supabase.queue("obrigacoes", "await", { data: [{ id: obrigacao.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: idEvento }], error: null });
  }

  it("marcos configurados são 60/30/7/3/0", () => {
    assert.deepEqual([...MARCOS_ALERTA_OBRIGACAO], [60, 30, 7, 3, 0]);
  });

  for (const marco of [60, 30, 7, 3]) {
    it(`aceite: obrigação a ${marco} dias → 1 evento + 1 notificação obrigacao_vencendo + claim ${marco}`, async () => {
      const obrigacao = obrigacaoAberta({ dias: marco });
      enfileirarAlertaCompleto(obrigacao, `evt-${marco}`);

      const resultado = await varrear();

      assert.equal(resultado.alertados, 1);
      assert.equal(resultado.erros, 0);
      assert.equal(notificacoes.length, 1);
      assert.equal(notificacoes[0].tipo, "obrigacao_vencendo");
      assert.equal(notificacoes[0].clienteId, CLIENTE_A);
      assert.match(notificacoes[0].mensagem, new RegExp(obrigacao.id));
      assert.match(notificacoes[0].mensagem, new RegExp(`vence em ${marco} dia\\(s\\)`));
      assert.match(notificacoes[0].mensagem, /DAS Simples Nacional/);

      const eventos = supabase.insercoes.filter((i) => i.tabela === "eventos");
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0].dados.cliente_id, CLIENTE_A);
      assert.equal(eventos[0].dados.sucesso, true);

      assert.ok(
        supabase.updates.some(
          (u) => u.tabela === "obrigacoes" && u.dados.ultimo_marco_alertado === marco,
        ),
      );
    });
  }

  it("aceite: segunda varredura no mesmo marco → nada (idempotente)", async () => {
    supabase.queue("obrigacoes", "await", {
      data: [obrigacaoAberta({ dias: 7, ultimoMarco: 7 })],
      error: null,
    });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(notificacoes.length, 0);
    assert.equal(supabase.insercoes.length, 0);
    assert.equal(supabase.updates.filter((u) => u.tabela === "obrigacoes").length, 0);
  });

  it("aceite: marco seguinte após o anterior já alertado → alerta de novo", async () => {
    const obrigacao = obrigacaoAberta({ dias: 30, ultimoMarco: 60 });
    enfileirarAlertaCompleto(obrigacao, "evt-30");

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
    assert.match(notificacoes[0].mensagem, /vence em 30 dia\(s\)/);
  });

  for (const dias of [1, 2, 8, 29, 59, 61]) {
    it(`${dias} dias (fora dos marcos) → nenhum alerta`, async () => {
      supabase.queue("obrigacoes", "await", {
        data: [obrigacaoAberta({ dias })],
        error: null,
      });

      const resultado = await varrear();

      assert.equal(resultado.alertados, 0);
      assert.equal(notificacoes.length, 0);
      assert.equal(supabase.insercoes.length, 0);
    });
  }

  it("aceite: vencimento hoje (marco 0) → notificação \"vence hoje\", sem \"0 dia(s)\"", async () => {
    const obrigacao = obrigacaoAberta({ dias: 0 });
    enfileirarAlertaCompleto(obrigacao, "evt-0");

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
    assert.equal(notificacoes[0].tipo, "obrigacao_vencendo");
    assert.match(notificacoes[0].mensagem, /vence hoje/);
    assert.doesNotMatch(notificacoes[0].mensagem, /dia\(s\)/);
    assert.ok(
      supabase.updates.some(
        (u) => u.tabela === "obrigacoes" && u.dados.ultimo_marco_alertado === 0,
      ),
    );
  });

  it("obrigação atrasada ainda em janela também alerta", async () => {
    const obrigacao = obrigacaoAberta({ dias: 7, status: "atrasada" });
    enfileirarAlertaCompleto(obrigacao, "evt-atrasada");

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
  });

  it("concluídas ficam fora: filtro de status e janela de 0..60 dias na query", async () => {
    supabase.queue("obrigacoes", "await", { data: [], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.ok(
      supabase.chamadas.some(
        (c) =>
          c.tabela === "obrigacoes" &&
          c.metodo === "in" &&
          c.campo === "status" &&
          c.valores.includes("pendente") &&
          c.valores.includes("atrasada") &&
          !c.valores.includes("concluida"),
      ),
    );
    assert.ok(
      supabase.chamadas.some(
        (c) =>
          c.tabela === "obrigacoes" &&
          c.metodo === "gte" &&
          c.campo === "data_vencimento" &&
          c.valor === dataEmDias(HOJE, 0),
      ),
    );
    assert.ok(
      supabase.chamadas.some(
        (c) =>
          c.tabela === "obrigacoes" &&
          c.metodo === "lte" &&
          c.campo === "data_vencimento" &&
          c.valor === dataEmDias(HOJE, 60),
      ),
    );
  });

  it("claim perdido para outra instância (0 linhas) → não duplica alerta", async () => {
    supabase.queue("obrigacoes", "await", {
      data: [obrigacaoAberta({ dias: 7 })],
      error: null,
    });
    supabase.queue("obrigacoes", "await", { data: [], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(notificacoes.length, 0);
    assert.equal(supabase.insercoes.filter((i) => i.tabela === "eventos").length, 0);
  });

  it("duas obrigações de clientes diferentes no marco 7 → 2 eventos + 2 notifs", async () => {
    const a = obrigacaoAberta({ id: OBG_A, clienteId: CLIENTE_A, dias: 7 });
    const b = obrigacaoAberta({ id: OBG_B, clienteId: CLIENTE_B, dias: 7 });
    supabase.queue("obrigacoes", "await", { data: [a, b], error: null });
    supabase.queue("obrigacoes", "await", { data: [{ id: a.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-a" }], error: null });
    supabase.queue("obrigacoes", "await", { data: [{ id: b.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-b" }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 2);
    assert.equal(notificacoes.length, 2);
    assert.deepEqual(
      notificacoes.map((n) => n.clienteId).sort(),
      [CLIENTE_A, CLIENTE_B].sort(),
    );
  });

  it("falha no insert de evento após claim → rollback do ultimo_marco_alertado", async () => {
    const obrigacao = obrigacaoAberta({ dias: 7 });
    supabase.queue("obrigacoes", "await", { data: [obrigacao], error: null });
    supabase.queue("obrigacoes", "await", { data: [{ id: obrigacao.id }], error: null });
    supabase.queue("eventos", "await", { data: null, error: { message: "falha insert" } });
    supabase.queue("obrigacoes", "await", { data: [{ id: obrigacao.id }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(resultado.erros, 1);
    assert.equal(notificacoes.length, 0);

    const updatesObg = supabase.updates.filter((u) => u.tabela === "obrigacoes");
    assert.ok(updatesObg.some((u) => u.dados.ultimo_marco_alertado === 7));
    assert.ok(updatesObg.some((u) => u.dados.ultimo_marco_alertado === null));
  });

  it("erro ao listar → { alertados: 0, erros: 1 } sem quebrar o job", async () => {
    supabase.queue("obrigacoes", "await", { data: null, error: { message: "timeout" } });

    const resultado = await varrear();

    assert.deepEqual(resultado, { alertados: 0, erros: 1 });
    assert.equal(notificacoes.length, 0);
  });

  it("prazo.util: hoje+30 → 30; vencimento hoje → 0", () => {
    assert.equal(calcularDiasRestantes(dataEmDias(HOJE, 30), HOJE), 30);
    assert.equal(calcularDiasRestantes(dataEmDias(HOJE, 0), HOJE), 0);
  });
});
