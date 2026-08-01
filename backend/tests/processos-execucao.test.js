import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PERFIS } from "../src/config/perfis.js";
import supabase from "../src/config/database.js";
import {
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
    insert() {
      return builder;
    },
    update() {
      return builder;
    },
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    single() {
      return Promise.resolve(consumir("single"));
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
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, tipo: "automatizada", acao: "gerar_contrato_social", concluida: false },
      error: null,
    });
    const payload = { socios: [{ nome: "Fulano", cpf: "111", participacao: 100 }], capital_social: 1000 };
    queue("etapas", "single", {
      data: { id: ETAPA_ID, status: "pronta_para_execucao", payload_execucao: payload },
      error: null,
    });

    const res = criarRes();
    await executarAcaoEtapaJwt(reqAdmin({ id: PROCESSO_ID, etapaId: ETAPA_ID }, payload), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "pronta_para_execucao");
    assert.deepEqual(res.body.payload_execucao, payload);
  });
});

describe("processos.controller — listarEtapasProntasAgente (issue #266, polling)", () => {
  beforeEach(() => {
    filas.clear();
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
          acao: "gerar_contrato_social",
          payload_execucao: { capital_social: 1000 },
          processos: { cliente_id: CLIENTE_A, nome_empresa: "Empresa X", pasta_base: "Empresa_X" },
        },
      ],
      error: null,
    });

    const res = criarRes();
    await listarEtapasProntasAgente({ headers: { "x-licenca-token": "token-valido" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].acao, "gerar_contrato_social");
    assert.equal(res.body.data[0].nome_empresa, "Empresa X");
    assert.deepEqual(res.body.data[0].payload, { capital_social: 1000 });
  });
});

describe("processos.controller — concluirExecucaoEtapaAgente (issue #266, conclusão)", () => {
  beforeEach(() => {
    filas.clear();
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
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, status: "pronta_para_execucao", processos: { cliente_id: CLIENTE_B } },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      { headers: { "x-licenca-token": "token-valido" }, params: { etapaId: ETAPA_ID }, body: { sucesso: true } },
      res,
    );
    assert.equal(res.statusCode, 403);
  });

  it("400 quando a etapa não está aguardando execução", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, status: "pendente", processos: { cliente_id: CLIENTE_A } },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      { headers: { "x-licenca-token": "token-valido" }, params: { etapaId: ETAPA_ID }, body: { sucesso: true } },
      res,
    );
    assert.equal(res.statusCode, 400);
  });

  it("sucesso: marca a etapa como concluida e conclui o processo se era a última etapa", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, status: "pronta_para_execucao", processos: { cliente_id: CLIENTE_A } },
      error: null,
    });
    queue("etapas", "single", {
      data: { id: ETAPA_ID, status: "concluida", concluida: true, arquivo_gerado: "C:/x/contrato.docx" },
      error: null,
    });
    queue("etapas", "await", { data: [{ concluida: true }], error: null });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: true, arquivo_gerado: "C:/x/contrato.docx" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "concluida");
    assert.equal(res.body.arquivo_gerado, "C:/x/contrato.docx");
  });

  it("erro: volta a etapa pra pronta_para_execucao guardando a mensagem de erro (contador pode tentar de novo)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("etapas", "single", {
      data: { id: ETAPA_ID, processo_id: PROCESSO_ID, status: "pronta_para_execucao", processos: { cliente_id: CLIENTE_A } },
      error: null,
    });
    queue("etapas", "single", {
      data: { id: ETAPA_ID, status: "pronta_para_execucao", erro_execucao: "Template não encontrado" },
      error: null,
    });

    const res = criarRes();
    await concluirExecucaoEtapaAgente(
      {
        headers: { "x-licenca-token": "token-valido" },
        params: { etapaId: ETAPA_ID },
        body: { sucesso: false, erro: "Template não encontrado" },
      },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "pronta_para_execucao");
    assert.equal(res.body.erro_execucao, "Template não encontrado");
  });
});
