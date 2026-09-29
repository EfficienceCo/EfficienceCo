import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import {
  atualizarObrigacao,
  concluirObrigacao,
  deletarObrigacao,
} from "../src/controllers/obrigacoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const OBRIGACAO_ID = "33333333-3333-3333-3333-333333333333";

const originalFrom = supabase.from;
const buscas = [];
const chamadas = [];
const mutacoes = [];

function queueBusca(resultado) {
  buscas.push(resultado);
}

supabase.from = function (tabela) {
  const builder = {
    select() {
      return builder;
    },
    update(dados) {
      mutacoes.push({ tabela, metodo: "update", dados });
      return builder;
    },
    delete() {
      mutacoes.push({ tabela, metodo: "delete" });
      return builder;
    },
    eq(campo, valor) {
      chamadas.push({ tabela, campo, valor });
      return builder;
    },
    single() {
      return Promise.resolve(buscas.shift() ?? { data: null, error: null });
    },
    maybeSingle() {
      return Promise.resolve(buscas.shift() ?? { data: null, error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };

  return builder;
};

after(() => {
  supabase.from = originalFrom;
});

beforeEach(() => {
  buscas.length = 0;
  chamadas.length = 0;
  mutacoes.length = 0;
});

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

function criarRequisicao(tipo) {
  return {
    params: { id: OBRIGACAO_ID },
    body: tipo === "atualizar" ? { nome: "Obrigação atualizada" } : {},
    file:
      tipo === "concluir"
        ? { mimetype: "application/pdf", buffer: Buffer.from("comprovante") }
        : undefined,
    usuario: {
      id: "usuario-cliente-a",
      perfil: PERFIS.ADMIN_CLIENTE,
      cliente_id: CLIENTE_A,
    },
  };
}

const CENARIOS = [
  ["atualizar", atualizarObrigacao],
  ["deletar", deletarObrigacao],
  ["concluir", concluirObrigacao],
];

describe("Obrigações — isolamento multi-tenant (#530)", () => {
  for (const [rotulo, handler] of CENARIOS) {
    it(`${rotulo}: outro tenant recebe o mesmo 404 de um id inexistente`, async () => {
      queueBusca({ data: null, error: null });
      const respostaInexistente = criarResposta();
      await handler(criarRequisicao(rotulo), respostaInexistente);

      queueBusca({
        data: {
          id: OBRIGACAO_ID,
          cliente_id: CLIENTE_B,
          nome: "Obrigação do cliente B",
          tipo: "mensal",
          status: "pendente",
          recorrente: false,
          comprovante_path: null,
        },
        error: null,
      });
      const respostaOutroTenant = criarResposta();
      await handler(criarRequisicao(rotulo), respostaOutroTenant);

      assert.equal(respostaInexistente.statusCode, 404);
      assert.equal(respostaOutroTenant.statusCode, 404);
      assert.notEqual(respostaOutroTenant.statusCode, 403);
      assert.deepEqual(respostaOutroTenant.body, respostaInexistente.body);
      assert.deepEqual(respostaOutroTenant.body, { erro: "Obrigação não encontrada" });

      const filtrosTenant = chamadas.filter(
        (chamada) =>
          chamada.tabela === "obrigacoes" &&
          chamada.campo === "cliente_id" &&
          chamada.valor === CLIENTE_A,
      );
      assert.equal(filtrosTenant.length, 2);
      assert.equal(mutacoes.length, 0);
    });
  }
});
