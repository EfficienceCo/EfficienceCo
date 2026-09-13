import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { calcularDiasRestantes } from "../src/utils/certificado-prazo.util.js";
import { varrearAlertasCertificados } from "../src/services/certificados-alertas.service.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const CERT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CERT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

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
    clear() {
      filas.clear();
      chamadas.length = 0;
      insercoes.length = 0;
      updates.length = 0;
    },
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
        neq(campo, valor) {
          chamadas.push({ tabela, metodo: "neq", campo, valor });
          return builder;
        },
        is(campo, valor) {
          chamadas.push({ tabela, metodo: "is", campo, valor });
          return builder;
        },
        or(expr) {
          chamadas.push({ tabela, metodo: "or", expr });
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
    },
  };
}

function certAtivo({ id = CERT_A, clienteId = CLIENTE_A, dias, ultimoMarco = null }) {
  return {
    id,
    cliente_id: clienteId,
    validade: dataEmDias(HOJE, dias),
    titular: "Padaria Teste",
    ultimo_marco_alertado: ultimoMarco,
    status: "ativo",
  };
}

describe("certificado-prazo.util — calcularDiasRestantes", () => {
  it("hoje+7 → 7; validade = hoje → 0", () => {
    assert.equal(calcularDiasRestantes(dataEmDias(HOJE, 7), HOJE), 7);
    assert.equal(calcularDiasRestantes(dataEmDias(HOJE, 0), HOJE), 0);
  });
});

describe("CD-3 — varrearAlertasCertificados", () => {
  let supabase;
  let notificacoes;

  beforeEach(() => {
    supabase = criarMockSupabase();
    notificacoes = [];
  });

  async function varrear() {
    return varrearAlertasCertificados({
      supabase,
      hoje: HOJE,
      criarNotificacao: async (clienteId, tipo, mensagem) => {
        notificacoes.push({ clienteId, tipo, mensagem });
      },
    });
  }

  it("aceite: certificado a 7 dias → 1 evento + 1 notificação certificado_vencendo + claim 7", async () => {
    const cert = certAtivo({ dias: 7 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: cert.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-1" }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
    assert.equal(notificacoes.length, 1);
    assert.equal(notificacoes[0].tipo, "certificado_vencendo");
    assert.equal(notificacoes[0].clienteId, CLIENTE_A);
    assert.match(notificacoes[0].mensagem, new RegExp(cert.id));
    assert.match(notificacoes[0].mensagem, /vence em 7 dia\(s\)/);

    const eventos = supabase.insercoes.filter((i) => i.tabela === "eventos");
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].dados.cliente_id, CLIENTE_A);
    assert.equal(eventos[0].dados.sucesso, true);
    assert.match(eventos[0].dados.descricao, new RegExp(cert.id));

    const claim = supabase.updates.find(
      (u) => u.tabela === "certificados_digitais" && u.dados.ultimo_marco_alertado === 7,
    );
    assert.ok(claim);
  });

  it("aceite: segunda varredura no mesmo marco 7 → nada (idempotente)", async () => {
    const cert = certAtivo({ dias: 7, ultimoMarco: 7 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(notificacoes.length, 0);
    assert.equal(supabase.insercoes.filter((i) => i.tabela === "eventos").length, 0);
    assert.equal(
      supabase.updates.filter((u) => u.tabela === "certificados_digitais").length,
      0,
    );
  });

  it("marco 60: alerta + claim ultimo_marco_alertado = 60", async () => {
    const cert = certAtivo({ dias: 60 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: cert.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-60" }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
    assert.equal(notificacoes[0].tipo, "certificado_vencendo");
    assert.match(notificacoes[0].mensagem, /vence em 60 dia\(s\)/);
    assert.ok(
      supabase.updates.some(
        (u) => u.tabela === "certificados_digitais" && u.dados.ultimo_marco_alertado === 60,
      ),
    );
  });

  it("marco 30: alerta + claim ultimo_marco_alertado = 30", async () => {
    const cert = certAtivo({ dias: 30, ultimoMarco: 60 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: cert.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-30" }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 1);
    assert.match(notificacoes[0].mensagem, /vence em 30 dia\(s\)/);
    assert.ok(
      supabase.updates.some(
        (u) => u.tabela === "certificados_digitais" && u.dados.ultimo_marco_alertado === 30,
      ),
    );
  });

  it("dias_restantes = 8 (fora dos marcos) → nenhum alerta", async () => {
    const cert = certAtivo({ dias: 8 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(notificacoes.length, 0);
    assert.equal(supabase.insercoes.length, 0);
  });

  it("apenas status=ativo entram na varredura (filtro na query)", async () => {
    // Simula o banco: select com status=ativo não devolve renovacao/substituido/vencido.
    supabase.queue("certificados_digitais", "await", { data: [], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.ok(
      supabase.chamadas.some(
        (c) => c.tabela === "certificados_digitais" && c.metodo === "eq" && c.campo === "status" && c.valor === "ativo",
      ),
    );
  });

  it("dois certificados ativos no marco 7 → 2 eventos + 2 notifs", async () => {
    const a = certAtivo({ id: CERT_A, clienteId: CLIENTE_A, dias: 7 });
    const b = certAtivo({ id: CERT_B, clienteId: CLIENTE_B, dias: 7 });
    supabase.queue("certificados_digitais", "await", { data: [a, b], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: a.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-a" }], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: b.id }], error: null });
    supabase.queue("eventos", "await", { data: [{ id: "evt-b" }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 2);
    assert.equal(notificacoes.length, 2);
    assert.equal(supabase.insercoes.filter((i) => i.tabela === "eventos").length, 2);
    assert.deepEqual(
      notificacoes.map((n) => n.clienteId).sort(),
      [CLIENTE_A, CLIENTE_B].sort(),
    );
  });

  it("falha no insert de evento após claim → rollback do ultimo_marco_alertado", async () => {
    const cert = certAtivo({ dias: 7 });
    supabase.queue("certificados_digitais", "await", { data: [cert], error: null });
    supabase.queue("certificados_digitais", "await", { data: [{ id: cert.id }], error: null });
    supabase.queue("eventos", "await", { data: null, error: { message: "falha insert" } });
    // rollback update
    supabase.queue("certificados_digitais", "await", { data: [{ id: cert.id }], error: null });

    const resultado = await varrear();

    assert.equal(resultado.alertados, 0);
    assert.equal(notificacoes.length, 0);

    const updatesCert = supabase.updates.filter((u) => u.tabela === "certificados_digitais");
    assert.ok(updatesCert.some((u) => u.dados.ultimo_marco_alertado === 7));
    assert.ok(updatesCert.some((u) => u.dados.ultimo_marco_alertado === null));
  });
});
