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
});

beforeEach(() => {
  insercoes.length = 0;
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
    assert.deepEqual(automatizadas, [
      {
        descricao: "Gerar contrato social",
        tipo: "automatizada",
        acao: "gerar_contrato_social",
      },
      {
        descricao: "Criar estrutura de pastas",
        tipo: "automatizada",
        acao: "criar_pastas",
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
      pasta_base: "Empresa_Teste",
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
      pasta_base: "Empresa_Teste",
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
  it("usa o catálogo tipado no fluxo real do endpoint para empresa nova", async () => {
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
    // Regressão #311: pasta_base não pode ser fabricada a partir de nome_empresa
    // (isso gerava um nome de pasta, não uma raiz absoluta, e quebrava as automações).
    assert.equal(obterInsercao("processos").pasta_base, null);
    assert.equal(res.body.pasta_base, null);
  });

  it("repassa pasta_base absoluta quando informada explicitamente", async () => {
    const req = {
      usuario: { perfil: "admin_cliente", cliente_id: CLIENTE_ID },
      query: {},
      body: {
        tipo: "abertura_empresa",
        nome_empresa: "Empresa Com Raiz",
        cenario: "nova",
        pasta_base: "C:\\Clientes\\Empresa Com Raiz",
      },
    };
    const res = criarResposta();

    await criarProcesso(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(obterInsercao("processos").pasta_base, "C:\\Clientes\\Empresa Com Raiz");
    assert.equal(res.body.pasta_base, "C:\\Clientes\\Empresa Com Raiz");
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
