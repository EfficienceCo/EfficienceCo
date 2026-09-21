import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { atualizarCliente, criarCliente } from "../src/controllers/clientes.controller.js";
import { validarHistoricoReceita } from "../src/utils/regime-tributario.util.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// Mock de supabase — mesmo padrão de tests/clientes-atualizar.test.js, com o
// acréscimo de `operacoes`, que guarda o payload de insert/update para checar o
// que de fato seria gravado (tests/apuracoes.test.js usa a mesma ideia).
// ---------------------------------------------------------------------------
const originalFrom = supabase.from;
const filas = new Map();
const operacoes = [];
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
    insert(payload) { operacoes.push({ tabela, metodo: "insert", payload }); return builder; },
    update(payload) { operacoes.push({ tabela, metodo: "update", payload }); return builder; },
    eq() { return builder; },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
  };
  return builder;
};

after(() => { supabase.from = originalFrom; });
beforeEach(() => { filas.clear(); operacoes.length = 0; });

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}

/** Pré-checagem de existência + linha devolvida pelo update. */
function queueClienteExistente(atual = {}, gravado = {}) {
  queue("clientes", "single", { data: { id: CLIENTE_ID, ...atual }, error: null });
  queue("clientes", "single", { data: { id: CLIENTE_ID, ...atual, ...gravado }, error: null });
}

function ultimaOperacao(metodo) {
  return operacoes.filter((operacao) => operacao.metodo === metodo).at(-1);
}

// ---------------------------------------------------------------------------
// POST /clientes — o cadastro já nasce com o regime (#496)
// ---------------------------------------------------------------------------
describe("criarCliente — campos tributários", () => {
  it("grava regime, anexo e histórico de receita informados no cadastro", async () => {
    queue("clientes", "single", { data: { id: CLIENTE_ID, nome: "Alfa" }, error: null });

    const req = {
      body: {
        nome: "Alfa",
        regime_tributario: "simples_nacional",
        anexo_simples: "III",
        historico_receita: [{ mes: 8, ano: 2025, receita: 100000 }],
      },
    };
    const res = criarResposta();
    await criarCliente(req, res);

    assert.equal(res.statusCode, 201);
    const insert = ultimaOperacao("insert");
    assert.equal(insert.payload.regime_tributario, "simples_nacional");
    assert.equal(insert.payload.anexo_simples, "III");
    assert.deepEqual(insert.payload.historico_receita, [{ mes: 8, ano: 2025, receita: 100000 }]);
  });

  it("não inclui as colunas tributárias quando o body não as manda", async () => {
    queue("clientes", "single", { data: { id: CLIENTE_ID, nome: "Alfa" }, error: null });

    const res = criarResposta();
    await criarCliente({ body: { nome: "Alfa" } }, res);

    assert.equal(res.statusCode, 201);
    const insert = ultimaOperacao("insert");
    assert.equal("regime_tributario" in insert.payload, false);
    assert.equal("anexo_simples" in insert.payload, false);
    assert.equal("historico_receita" in insert.payload, false);
  });

  it("400 quando o Simples Nacional vem sem anexo — é o estado que trava a apuração", async () => {
    const res = criarResposta();
    await criarCliente({ body: { nome: "Alfa", regime_tributario: "simples_nacional" } }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /anexo/i);
    assert.equal(operacoes.length, 0);
  });

  it("400 quando o anexo vem sem o regime do Simples Nacional", async () => {
    const res = criarResposta();
    await criarCliente({ body: { nome: "Alfa", anexo_simples: "III" } }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /Simples Nacional/i);
    assert.equal(operacoes.length, 0);
  });

  it("400 quando o regime não é um dos suportados", async () => {
    const res = criarResposta();
    await criarCliente({ body: { nome: "Alfa", regime_tributario: "mei" } }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /Regime tribut/i);
  });
});

// ---------------------------------------------------------------------------
// PATCH /clientes/:id — edição do regime (#496)
// ---------------------------------------------------------------------------
describe("atualizarCliente — campos tributários", () => {
  it("marca o cliente como Simples Nacional com anexo e histórico", async () => {
    queueClienteExistente({}, { regime_tributario: "simples_nacional", anexo_simples: "I" });

    const req = {
      params: { id: CLIENTE_ID },
      body: {
        regime_tributario: "simples_nacional",
        anexo_simples: "I",
        historico_receita: [
          { mes: 7, ano: 2025, receita: 50000 },
          { mes: 8, ano: 2025, receita: 60000 },
        ],
      },
    };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    const update = ultimaOperacao("update");
    assert.equal(update.payload.regime_tributario, "simples_nacional");
    assert.equal(update.payload.anexo_simples, "I");
    assert.equal(update.payload.historico_receita.length, 2);
  });

  it("normaliza o anexo em minúsculas antes de gravar (o CHECK da coluna é maiúsculo)", async () => {
    queueClienteExistente({ regime_tributario: "simples_nacional", anexo_simples: "I" });

    const req = { params: { id: CLIENTE_ID }, body: { anexo_simples: "iii" } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ultimaOperacao("update").payload.anexo_simples, "III");
  });

  it("aceita receita como string numérica e normaliza para número", async () => {
    queueClienteExistente();

    const req = {
      params: { id: CLIENTE_ID },
      body: { historico_receita: [{ mes: "8", ano: "2025", receita: "1500.50" }] },
    };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(ultimaOperacao("update").payload.historico_receita, [
      { mes: 8, ano: 2025, receita: 1500.5 },
    ]);
  });

  it("limpa as colunas quando o valor vem null ou string vazia", async () => {
    queueClienteExistente({ regime_tributario: "lucro_presumido", anexo_simples: "II" });

    const req = {
      params: { id: CLIENTE_ID },
      body: { regime_tributario: null, anexo_simples: "" },
    };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    const update = ultimaOperacao("update").payload;
    assert.equal(update.regime_tributario, null);
    assert.equal(update.anexo_simples, null);
  });

  it("400 ao remover o anexo de um cliente que segue no Simples Nacional", async () => {
    queueClienteExistente({ regime_tributario: "simples_nacional", anexo_simples: "III" });

    const req = { params: { id: CLIENTE_ID }, body: { anexo_simples: null } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(operacoes.filter((o) => o.metodo === "update").length, 0);
  });

  it("aceita trocar só o regime quando o anexo já está gravado", async () => {
    queueClienteExistente({ regime_tributario: "lucro_presumido", anexo_simples: "III" });

    const req = { params: { id: CLIENTE_ID }, body: { regime_tributario: "simples_nacional" } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ultimaOperacao("update").payload.regime_tributario, "simples_nacional");
  });

  it("sair do Simples limpa o anexo mesmo sem o cliente mandar o campo", async () => {
    queueClienteExistente({ regime_tributario: "simples_nacional", anexo_simples: "III" });

    const req = { params: { id: CLIENTE_ID }, body: { regime_tributario: "lucro_presumido" } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    const update = ultimaOperacao("update").payload;
    assert.equal(update.regime_tributario, "lucro_presumido");
    assert.equal(update.anexo_simples, null);
  });

  it("não barra um PATCH de status só porque o cadastro já estava incoerente", async () => {
    // Estado real do Supabase de dev antes do #496: anexo preenchido com regime
    // nulo (e o inverso). Um PATCH que não toca em nenhum dos dois não deve
    // herdar a validação e travar uma operação sem relação com o regime.
    queueClienteExistente({ regime_tributario: "simples_nacional", anexo_simples: null });

    const req = { params: { id: CLIENTE_ID }, body: { status: "inativo" } };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ultimaOperacao("update").payload.status, "inativo");
  });

  it("400 quando o histórico repete a mesma competência", async () => {
    queueClienteExistente();

    const req = {
      params: { id: CLIENTE_ID },
      body: {
        historico_receita: [
          { mes: 8, ano: 2025, receita: 1000 },
          { mes: 8, ano: 2025, receita: 2000 },
        ],
      },
    };
    const res = criarResposta();
    await atualizarCliente(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /Hist[óo]rico de receita/i);
  });

  it("400 quando o histórico tem mês fora de 1–12, ano antigo ou receita inválida", async () => {
    for (const entrada of [
      { mes: 13, ano: 2025, receita: 1000 },
      { mes: 0, ano: 2025, receita: 1000 },
      { mes: 8, ano: 2019, receita: 1000 },
      { mes: 8, ano: 2025, receita: -1 },
      { mes: 8, ano: 2025, receita: "abc" },
    ]) {
      filas.clear();
      operacoes.length = 0;
      queueClienteExistente();

      const res = criarResposta();
      await atualizarCliente(
        { params: { id: CLIENTE_ID }, body: { historico_receita: [entrada] } },
        res,
      );

      assert.equal(res.statusCode, 400, `deveria recusar ${JSON.stringify(entrada)}`);
    }
  });

  it("400 quando o histórico não é uma lista", async () => {
    queueClienteExistente();

    const res = criarResposta();
    await atualizarCliente(
      { params: { id: CLIENTE_ID }, body: { historico_receita: { mes: 8, ano: 2025, receita: 1 } } },
      res,
    );

    assert.equal(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// O validador é compartilhado com apuracoes.controller.js (somarHistoricoReceita).
// Se as duas pontas divergirem, a tela grava um histórico que a apuração recusa
// depois com HISTORICO_RECEITA_INVALIDO — a classe de problema que o QA-F expôs.
// ---------------------------------------------------------------------------
describe("validarHistoricoReceita — contrato compartilhado com a apuração", () => {
  it("trata ausência de histórico como lista vazia", () => {
    assert.deepEqual(validarHistoricoReceita(null), { entradas: [] });
    assert.deepEqual(validarHistoricoReceita(undefined), { entradas: [] });
  });

  it("aceita receita zero", () => {
    assert.deepEqual(validarHistoricoReceita([{ mes: 1, ano: 2026, receita: 0 }]), {
      entradas: [{ mes: 1, ano: 2026, receita: 0 }],
    });
  });

  it("devolve HISTORICO_RECEITA_INVALIDO no mesmo código que a apuração usa", () => {
    assert.equal(validarHistoricoReceita("nao-e-lista").erro, "HISTORICO_RECEITA_INVALIDO");
  });
});
