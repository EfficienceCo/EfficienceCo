import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { criarProcesso } from "../src/controllers/processos.controller.js";
import {
  criarProcessoComEtapas,
  ETAPAS_PADRAO,
} from "../src/services/processos.service.js";

const CLIENTE_ID = "11111111-1111-1111-1111-111111111111";
const PROCESSO_ID = "22222222-2222-2222-2222-222222222222";
const originalFrom = supabase.from;
const pastaBaseEnvOriginal = process.env.PASTA_BASE;
const insercoes = [];

supabase.from = function (tabela) {
  let payloadInserido;

  const builder = {
    insert(payload) {
      payloadInserido = payload;
      insercoes.push({ tabela, payload });
      return builder;
    },
    select() {
      return builder;
    },
    single() {
      return Promise.resolve({
        data: { id: PROCESSO_ID, ...payloadInserido },
        error: null,
      });
    },
    then(resolve, reject) {
      const data = Array.isArray(payloadInserido)
        ? payloadInserido.map((etapa, indice) => ({ id: `etapa-${indice + 1}`, ...etapa }))
        : payloadInserido;

      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };

  return builder;
};

after(() => {
  supabase.from = originalFrom;
  if (pastaBaseEnvOriginal === undefined) {
    delete process.env.PASTA_BASE;
  } else {
    process.env.PASTA_BASE = pastaBaseEnvOriginal;
  }
});

beforeEach(() => {
  insercoes.length = 0;
  delete process.env.PASTA_BASE;
});

function obterInsercao(tabela) {
  return insercoes.find((insercao) => insercao.tabela === tabela)?.payload;
}

function criarResposta() {
  return {
    statusCode: 200,
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

function etapasEsperadas(processoId, etapas) {
  return etapas.map((etapa, indice) => ({
    processo_id: processoId,
    descricao: etapa.descricao,
    tipo: etapa.tipo,
    acao: etapa.acao,
    ordem: indice + 1,
  }));
}

describe("ETAPAS_PADRAO", () => {
  it("define as nove etapas de abertura com as duas automações corretas", () => {
    const etapas = ETAPAS_PADRAO.abertura_empresa;
    const automatizadas = etapas.filter((etapa) => etapa.tipo === "automatizada");

    assert.equal(etapas.length, 9);
    // #488: criar as pastas precede o contrato — o documento é gravado dentro delas.
    assert.deepEqual(automatizadas, [
      {
        descricao: "Criar estrutura de pastas",
        tipo: "automatizada",
        acao: "criar_pastas",
      },
      {
        descricao: "Gerar contrato social",
        tipo: "automatizada",
        acao: "gerar_contrato_social",
      },
    ]);

    for (const etapa of etapas.filter((item) => item.tipo === "manual")) {
      assert.equal(Object.hasOwn(etapa, "acao"), true);
      assert.equal(etapa.acao, null);
    }
  });

  it("mantém as cinco etapas de folha como manuais", () => {
    const etapas = ETAPAS_PADRAO.folha_pagamento;

    assert.deepEqual(
      etapas.map((etapa) => etapa.descricao),
      [
        "Inserir planilha Excel na pasta do mês",
        "Aguardar processamento automático pelo agente",
        "Revisar holerites gerados",
        "Enviar holerites às empresas",
        "Arquivar documentação do mês",
      ],
    );
    assert.equal(etapas.every((etapa) => etapa.tipo === "manual" && etapa.acao === null), true);
  });
});

describe("criarProcessoComEtapas", () => {
  it("persiste descrição, tipo e ação das etapas de abertura", async () => {
    const resultado = await criarProcessoComEtapas(CLIENTE_ID, "abertura_empresa", {
      nome_empresa: "Empresa Teste",
      pasta_base: "C:\\Souza",
      cenario: "nova",
      socios: [{ nome: "Maria", cpf: "123", participacao: 100 }],
      capital_social: 10000,
      endereco: "Rua Teste, 1",
      objeto_social: "Serviços contábeis",
    });

    assert.equal(resultado.erro, undefined);
    assert.deepEqual(
      obterInsercao("etapas"),
      etapasEsperadas(PROCESSO_ID, ETAPAS_PADRAO.abertura_empresa),
    );
    assert.deepEqual(obterInsercao("processos"), {
      cliente_id: CLIENTE_ID,
      tipo: "abertura_empresa",
      nome_empresa: "Empresa Teste",
      pasta_base: "C:\\Souza",
      mes_referencia: null,
      cenario: "nova",
      socios: [{ nome: "Maria", cpf: "123", participacao: 100 }],
      capital_social: 10000,
      endereco: "Rua Teste, 1",
      objeto_social: "Serviços contábeis",
    });
  });

  it("persiste tipo manual e ação nula também para folha", async () => {
    const resultado = await criarProcessoComEtapas(CLIENTE_ID, "folha_pagamento", {
      mes_referencia: "2026-08",
    });

    assert.equal(resultado.erro, undefined);
    assert.deepEqual(
      obterInsercao("etapas"),
      etapasEsperadas(PROCESSO_ID, ETAPAS_PADRAO.folha_pagamento),
    );
    assert.equal(obterInsercao("processos").mes_referencia, "2026-08");
  });

  it("recusa tipo desconhecido sem inserir dados", async () => {
    const resultado = await criarProcessoComEtapas(CLIENTE_ID, "tipo_inexistente");

    assert.deepEqual(resultado, { erro: "tipo inválido: tipo_inexistente" });
    assert.equal(insercoes.length, 0);
  });
});

describe("criarProcesso — abertura_empresa", () => {
  it("sem pasta_base no body nem no env: cria com null (agente usa PASTA_BASE local)", async () => {
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Empresa Nova",
        cenario: "nova",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.processo_id, PROCESSO_ID);
    assert.deepEqual(
      obterInsercao("etapas"),
      etapasEsperadas(PROCESSO_ID, ETAPAS_PADRAO.abertura_empresa),
    );
    // Sem fonte absoluta (#636) ainda pode nascer null; o agente cobre com env local.
    // Regressão #311: nunca fabricar a partir de nome_empresa.
    assert.equal(obterInsercao("processos").pasta_base, null);
    assert.equal(res.body.pasta_base, null);
  });

  it("persiste pasta_base absoluto informado no body (#636)", async () => {
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Empresa Com Raiz",
        cenario: "nova",
        pasta_base: "C:\\Clientes\\Raiz",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(obterInsercao("processos").pasta_base, "C:\\Clientes\\Raiz");
    assert.equal(res.body.pasta_base, "C:\\Clientes\\Raiz");
  });

  it("usa PASTA_BASE do ambiente quando o body omite a raiz (#636)", async () => {
    process.env.PASTA_BASE = "C:\\Souza";
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Empresa Via Env",
        cenario: "nova",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(obterInsercao("processos").pasta_base, "C:\\Souza");
    assert.equal(res.body.pasta_base, "C:\\Souza");
  });

  it("recusa pasta_base relativa/slug no body (regressão #311)", async () => {
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Empresa Slug",
        cenario: "nova",
        pasta_base: "Empresa_Slug",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.erro, /caminho absoluto/i);
    assert.equal(insercoes.length, 0);
  });

  it("preserva o checklist reduzido do cliente existente e automatiza a criação das pastas", async () => {
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Cliente Existente",
        cenario: "cliente_existente",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    const etapas = obterInsercao("etapas");
    const contrato = etapas.find((etapa) => etapa.acao === "gerar_contrato_social");
    const pastas = etapas.find((etapa) => etapa.acao === "criar_pastas");

    assert.equal(res.statusCode, 201);
    assert.equal(etapas.length, 7);
    assert.equal(contrato, undefined);
    assert.equal(pastas.descricao, "Criar estrutura de pastas");
    assert.equal(pastas.tipo, "automatizada");
  });
});
