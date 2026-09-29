import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { listarObrigacoes } from "../src/controllers/obrigacoes.controller.js";
import { promoverObrigacoesAtrasadas } from "../src/services/obrigacoes-atraso.service.js";
import { hojeNoBrasil } from "../src/utils/periodo.util.js";

// Bug #505 — o filtro Status=Atrasada nunca devolvia nada porque ninguém
// escrevia 'atrasada' na coluna. Cobre as duas pontas do fix: a varredura que
// persiste o status e o filtro do listar, que deriva o atraso pela data
// enquanto a varredura do dia não rodou.

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Mock de Supabase — registra a cadeia de filtros aplicada à query
// ---------------------------------------------------------------------------

const chamadas = [];
let respostaDaQuery = { data: [], error: null };

supabase.from = function (tabela) {
  const registrar = (metodo, payload) => {
    chamadas.push({ tabela, metodo, ...payload });
    return builder;
  };

  const builder = {
    select: () => builder,
    order: () => builder,
    update: (dados) => registrar("update", { dados }),
    eq: (campo, valor) => registrar("eq", { campo, valor }),
    gte: (campo, valor) => registrar("gte", { campo, valor }),
    lte: (campo, valor) => registrar("lte", { campo, valor }),
    lt: (campo, valor) => registrar("lt", { campo, valor }),
    or: (expr) => registrar("or", { expr }),
    then(resolve, reject) {
      return Promise.resolve(respostaDaQuery).then(resolve, reject);
    },
  };

  return builder;
};

function mockComSelect(resultado) {
  const registrado = [];
  const builder = {
    update(dados) {
      registrado.push({ metodo: "update", dados });
      return builder;
    },
    eq(campo, valor) {
      registrado.push({ metodo: "eq", campo, valor });
      return builder;
    },
    lt(campo, valor) {
      registrado.push({ metodo: "lt", campo, valor });
      return builder;
    },
    select() {
      return Promise.resolve(resultado);
    },
  };

  return { registrado, from: () => builder };
}

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function requisicao(query) {
  return {
    usuario: { id: "user-1", perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_ID },
    query,
    body: {},
  };
}

beforeEach(() => {
  chamadas.length = 0;
  respostaDaQuery = { data: [], error: null };
});

describe("hojeNoBrasil", () => {
  it("usa o dia de Brasília, não o de UTC, na virada da noite", () => {
    // 22:30 em Brasília do dia 18 — em UTC já é dia 19.
    assert.equal(hojeNoBrasil(new Date("2026-09-19T01:30:00Z")), "2026-09-18");
  });

  it("acompanha a virada do dia em Brasília", () => {
    assert.equal(hojeNoBrasil(new Date("2026-09-19T03:30:00Z")), "2026-09-19");
  });
});

describe("promoverObrigacoesAtrasadas", () => {
  it("marca como atrasada só o que está pendente e venceu antes de hoje", async () => {
    const mock = mockComSelect({ data: [{ id: "obg-1" }, { id: "obg-2" }], error: null });

    const resultado = await promoverObrigacoesAtrasadas({
      supabase: mock,
      agora: new Date("2026-09-18T12:00:00Z"),
    });

    assert.deepEqual(resultado, { promovidas: 2, erros: 0 });
    assert.deepEqual(mock.registrado, [
      { metodo: "update", dados: { status: "atrasada" } },
      { metodo: "eq", campo: "status", valor: "pendente" },
      { metodo: "lt", campo: "data_vencimento", valor: "2026-09-18" },
    ]);
  });

  it("não promove nada quando não há vencidas", async () => {
    const mock = mockComSelect({ data: [], error: null });

    const resultado = await promoverObrigacoesAtrasadas({ supabase: mock });

    assert.deepEqual(resultado, { promovidas: 0, erros: 0 });
  });

  it("conta erro e não derruba o job quando o update falha", async () => {
    const mock = mockComSelect({ data: null, error: { message: "timeout" } });

    const resultado = await promoverObrigacoesAtrasadas({ supabase: mock });

    assert.deepEqual(resultado, { promovidas: 0, erros: 1 });
  });
});

describe("listarObrigacoes — filtro de status", () => {
  it("status=atrasada inclui as pendentes já vencidas", async () => {
    const res = criarResposta();

    await listarObrigacoes(requisicao({ status: "atrasada" }), res);

    assert.equal(res.statusCode, 200);

    const filtroOr = chamadas.find((c) => c.metodo === "or");
    assert.ok(filtroOr, "esperava um filtro .or() para status=atrasada");
    assert.equal(
      filtroOr.expr,
      `status.eq.atrasada,and(status.eq.pendente,data_vencimento.lt.${hojeNoBrasil()})`,
    );

    // O bug original: comparação literal contra a coluna, que nunca é escrita.
    assert.equal(
      chamadas.some((c) => c.metodo === "eq" && c.campo === "status"),
      false,
    );
  });

  it("status=pendente exclui as vencidas, para não aparecerem nos dois filtros", async () => {
    const res = criarResposta();

    await listarObrigacoes(requisicao({ status: "pendente" }), res);

    assert.ok(
      chamadas.some((c) => c.metodo === "eq" && c.campo === "status" && c.valor === "pendente"),
    );
    assert.ok(
      chamadas.some(
        (c) => c.metodo === "gte" && c.campo === "data_vencimento" && c.valor === hojeNoBrasil(),
      ),
    );
  });

  it("status=concluida segue na comparação direta", async () => {
    const res = criarResposta();

    await listarObrigacoes(requisicao({ status: "concluida" }), res);

    assert.ok(
      chamadas.some((c) => c.metodo === "eq" && c.campo === "status" && c.valor === "concluida"),
    );
    assert.equal(chamadas.some((c) => c.metodo === "or"), false);
  });

  it("sem status não aplica filtro de status nenhum", async () => {
    const res = criarResposta();

    await listarObrigacoes(requisicao({}), res);

    assert.equal(
      chamadas.some((c) => c.metodo === "eq" && c.campo === "status"),
      false,
    );
    assert.equal(chamadas.some((c) => c.metodo === "or"), false);
  });
});
