import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PERFIS } from "../src/config/perfis.js";
import supabase from "../src/config/database.js";
import {
  concluirEtapaJwt,
  executarAcaoEtapaJwt,
  listarEtapasProntasAgente,
  concluirExecucaoEtapaAgente,
} from "../src/controllers/processos.controller.js";

// Mesmo padrão de mock em memória usado em regras.test.js — mutar `supabase.from`
// diretamente já que o client é um singleton importado por referência (ES modules).
const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const PROCESSO_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ETAPA_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const EXECUCAO_TOKEN = "123e4567-e89b-42d3-a456-426614174000";

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const filas = new Map();
const chamadas = [];
function chave(tabela, metodo) {
  return `${tabela}:${metodo}`;
}
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback = { data: null, error: null }) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };

  const builder = {
    insert(...args) {
      chamadas.push({ tabela, metodo: "insert", args });
      return builder;
    },
    update(...args) {
      chamadas.push({ tabela, metodo: "update", args });
      return builder;
    },
    select(...args) {
      chamadas.push({ tabela, metodo: "select", args });
      return builder;
    },
    eq(...args) {
      chamadas.push({ tabela, metodo: "eq", args });
      return builder;
    },
    is(...args) {
      chamadas.push({ tabela, metodo: "is", args });
      return builder;
    },
    lt(...args) {
      chamadas.push({ tabela, metodo: "lt", args });
      return builder;
    },
    in(...args) {
      chamadas.push({ tabela, metodo: "in", args });
      return builder;
    },
    or(...args) {
      chamadas.push({ tabela, metodo: "or", args });
      return builder;
    },
    order(...args) {
      chamadas.push({ tabela, metodo: "order", args });
      return builder;
    },
    limit(...args) {
      chamadas.push({ tabela, metodo: "limit", args });
      return builder;
    },
    single() {
      return Promise.resolve(consumir("single"));
    },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle"));
    },
    then(resolve, reject) {
      return Promise.resolve(consumir("await")).then(resolve, reject);
    },
  };
  return builder;
};

function tokenLicencaValido(clienteId = CLIENTE_A) {
  queue("licencas", "single", {
    data: { cliente_id: clienteId, ativa: true, validade: null },
    error: null,
  });
}

function reqAdmin(params, body = {}) {
  return {
    params,
    body,
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
  };
}

describe("processos.controller — executarAcaoEtapaJwt (issue #266)", () => {
  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
  });

  it("404 quando processo não existe", async () => {
    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);
    assert.equal(res.statusCode, 404);
  });

  it("403 quando processo pertence a outro cliente", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_B, status: "em_andamento" },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);
    assert.equal(res.statusCode, 403);
  });

  it("400 quando etapa é manual — orienta a usar o PATCH existente", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, tipo: "manual", acao: null, concluida: false },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /PATCH/);
  });

  it("400 quando acao é desconhecida", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, tipo: "automatizada", acao: "acao_inexistente", concluida: false },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /acao desconhecida/);
  });

  it("400 quando etapa já está concluída", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, tipo: "automatizada", acao: "gerar_contrato_social", concluida: true },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /concluída/);
  });

  it("200 marca a etapa como pronta_para_execucao guardando o payload", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        acao: "gerar_contrato_social",
        status: "pendente",
        concluida: false,
        erro_execucao: null,
      },
      error: null,
    });
    const payload = {
      socios: [{ nome: "Fulano", cpf: "111", participacao: 100 }],
      capital_social: 1000,
      objeto_social: "Serviços contábeis",
      endereco: "Rua Exemplo, 123",
    };
    queue("etapas", "maybeSingle", {
      data: { id: ETAPA_ID, status: "pronta_para_execucao", payload_execucao: payload },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }, payload), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "pronta_para_execucao");
    assert.deepEqual(res.body.payload_execucao, payload);
  });

  it("400 quando o processo está cancelado", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "cancelado" },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /andamento/);
    assert.equal(chamadas.filter((chamada) => chamada.tabela === "etapas").length, 0);
  });

  it("409 não sobrescreve payload de etapa que já aguarda execução", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        acao: "criar_pastas",
        status: "pronta_para_execucao",
        concluida: false,
        erro_execucao: null,
      },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(chamadas.some((chamada) => chamada.metodo === "update"), false);
  });

  it("retry explícito limpa o erro antes de recolocar a etapa no polling", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        acao: "criar_pastas",
        status: "pronta_para_execucao",
        concluida: false,
        erro_execucao: "Falha anterior",
      },
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: { id: ETAPA_ID, status: "pronta_para_execucao", erro_execucao: null },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 200);
    const update = chamadas.find(
      (chamada) => chamada.tabela === "etapas" && chamada.metodo === "update",
    );
    assert.equal(update.args[0].erro_execucao, null);
    assert.equal(update.args[0].status, "pronta_para_execucao");
  });
});

describe("processos.controller — listarEtapasProntasAgente (issue #266, polling)", () => {
  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
  });

  it("401 quando token de licença é inválido", async () => {
    const res = criarRes();
    await listarEtapasProntasAgente({ headers: {} }, res);
    assert.equal(res.statusCode, 401);
  });

  it("200 retorna etapas prontas do cliente da licença, já achatadas", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "await", {
      data: [
        {
          id: ETAPA_ID,
          processo_id: PROCESSO_ID,
          status: "pronta_para_execucao",
          acao: "gerar_contrato_social",
          payload_execucao: { capital_social: 1000 },
          erro_execucao: null,
          execucao_iniciada_em: null,
          processos: {
            cliente_id: CLIENTE_A,
            status: "em_andamento",
            nome_empresa: "Empresa X",
            pasta_base: "Empresa_X",
          },
        },
      ],
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        acao: "gerar_contrato_social",
        payload_execucao: { capital_social: 1000 },
        execucao_token: EXECUCAO_TOKEN,
      },
      error: null,
    });

    const res = criarRes();
    await listarEtapasProntasAgente({ headers: { "x-licenca-token": "token-valido" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].acao, "gerar_contrato_social");
    assert.equal(res.body.data[0].nome_empresa, "Empresa X");
    assert.deepEqual(res.body.data[0].payload, { capital_social: 1000 });
    assert.equal(res.body.data[0].execucao_token, EXECUCAO_TOKEN);

    const updateClaim = chamadas.find(
      (chamada) => chamada.tabela === "etapas" && chamada.metodo === "update",
    );
    assert.equal(updateClaim.args[0].status, "processando");
    assert.equal(typeof updateClaim.args[0].execucao_token, "string");
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.metodo === "is" &&
          chamada.args[0] === "erro_execucao" &&
          chamada.args[1] === null,
      ),
    );
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.metodo === "eq" &&
          chamada.args[0] === "processos.status" &&
          chamada.args[1] === "em_andamento",
      ),
    );
  });

  it("não devolve a etapa quando outro polling vence o claim atômico", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "await", {
      data: [
        {
          id: ETAPA_ID,
          processo_id: PROCESSO_ID,
          status: "pronta_para_execucao",
          acao: "criar_pastas",
          payload_execucao: {},
          processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
        },
      ],
      error: null,
    });
    queue("etapas", "maybeSingle", { data: null, error: null });

    const res = criarRes();
    await listarEtapasProntasAgente(
      { headers: { "x-licenca-token": "token-valido" } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data, []);
  });

  it("retoma claim abandonado somente depois de o lease expirar", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "await", {
      data: [
        {
          id: ETAPA_ID,
          processo_id: PROCESSO_ID,
          status: "processando",
          acao: "criar_pastas",
          payload_execucao: {},
          execucao_iniciada_em: "2020-01-01T00:00:00.000Z",
          processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
        },
      ],
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        acao: "criar_pastas",
        payload_execucao: {},
        execucao_token: EXECUCAO_TOKEN,
      },
      error: null,
    });

    const res = criarRes();
    await listarEtapasProntasAgente(
      { headers: { "x-licenca-token": "token-valido" } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 1);
    assert.ok(
      chamadas.some(
        (chamada) =>
          chamada.metodo === "lt" && chamada.args[0] === "execucao_iniciada_em",
      ),
    );
  });
});

describe("processos.controller — concluirExecucaoEtapaAgente (issue #266, conclusão)", () => {
  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
  });

  it("401 quando token de licença é inválido", async () => {
    const res = criarRes();
    await concluirExecucaoEtapaAgente({ headers: {}, params: { etapaId: ETAPA_ID }, body: { sucesso: true } }, res);
    assert.equal(res.statusCode, 401);
  });

  it("400 quando campo sucesso está ausente", async () => {
    tokenLicencaValido(CLIENTE_A);
    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      { headers: { "x-licenca-token": "token-valido" }, params: { etapaId: ETAPA_ID }, body: {} },
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("403 quando a etapa pertence a outro cliente", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "processando",
        execucao_token: EXECUCAO_TOKEN,
        processos: { cliente_id: CLIENTE_B, status: "em_andamento" },
      },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: true, execucao_token: EXECUCAO_TOKEN },
      },
      res,
    );
    assert.equal(res.statusCode, 403);
  });

  it("409 quando a etapa não possui mais o claim informado", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "pendente",
        execucao_token: null,
        processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
      },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: true, execucao_token: EXECUCAO_TOKEN },
      },
      res,
    );
    assert.equal(res.statusCode, 409);
  });

  it("409 rejeita conclusão atrasada com token de claim anterior", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "processando",
        execucao_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
      },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: true, execucao_token: EXECUCAO_TOKEN },
      },
      res,
    );

    assert.equal(res.statusCode, 409);
    assert.equal(chamadas.some((chamada) => chamada.metodo === "update"), false);
  });

  it("sucesso: marca a etapa como concluida e conclui o processo se era a última etapa", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "processando",
        execucao_token: EXECUCAO_TOKEN,
        processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
      },
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: { id: ETAPA_ID, status: "concluida", concluida: true, arquivo_gerado: "C:/x/contrato.docx" },
      error: null,
    });
    queue("etapas", "await", { data: [{ concluida: true }], error: null });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: {
          sucesso: true,
          arquivo_gerado: "C:/x/contrato.docx",
          execucao_token: EXECUCAO_TOKEN,
        },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "concluida");
    assert.equal(res.body.arquivo_gerado, "C:/x/contrato.docx");
  });

  it("erro: volta a etapa pra pronta_para_execucao guardando a mensagem de erro (contador pode tentar de novo)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "maybeSingle", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "processando",
        execucao_token: EXECUCAO_TOKEN,
        processos: { cliente_id: CLIENTE_A, status: "em_andamento" },
      },
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: { id: ETAPA_ID, status: "pronta_para_execucao", erro_execucao: "Template não encontrado" },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: {
          sucesso: false,
          erro: "Template não encontrado",
          execucao_token: EXECUCAO_TOKEN,
        },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "pronta_para_execucao");
    assert.equal(res.body.erro_execucao, "Template não encontrado");

    const update = chamadas.find(
      (chamada) => chamada.tabela === "etapas" && chamada.metodo === "update",
    );
    assert.equal(update.args[0].execucao_token, null);
    assert.equal(update.args[0].execucao_iniciada_em, null);
  });

  it("400 rejeita string 'false' em vez de interpretar como sucesso", async () => {
    tokenLicencaValido(CLIENTE_A);
    const res = criarRes();

    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: "false", execucao_token: EXECUCAO_TOKEN },
      },
      res,
    );

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /booleano/);
    assert.equal(chamadas.filter((chamada) => chamada.tabela === "etapas").length, 0);
  });
});

describe("processos.controller — compatibilidade do fluxo manual", () => {
  beforeEach(() => {
    filas.clear();
    chamadas.length = 0;
  });

  it("sincroniza status e concluida ao concluir etapa manual", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "manual",
        status: "pendente",
        concluida: false,
      },
      error: null,
    });
    queue("etapas", "maybeSingle", {
      data: { id: ETAPA_ID, tipo: "manual", status: "concluida", concluida: true },
      error: null,
    });
    queue("etapas", "await", {
      data: [{ concluida: true }, { concluida: false }],
      error: null,
    });

    const res = criarRes();
    await concluirEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 200);
    const update = chamadas.find(
      (chamada) => chamada.tabela === "etapas" && chamada.metodo === "update",
    );
    assert.equal(update.args[0].status, "concluida");
    assert.equal(update.args[0].concluida, true);
  });

  it("rejeita conclusão manual de etapa automatizada", async () => {
    queue("processos", "single", {
      data: { id: PROCESSO_ID, cliente_id: CLIENTE_A, status: "em_andamento" },
      error: null,
    });
    queue("etapas", "single", {
      data: {
        id: ETAPA_ID,
        processo_id: PROCESSO_ID,
        tipo: "automatizada",
        status: "pendente",
        concluida: false,
      },
      error: null,
    });

    const res = criarRes();
    await concluirEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /automatizada/);
    assert.equal(chamadas.some((chamada) => chamada.metodo === "update"), false);
  });
});
