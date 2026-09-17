import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERFIS } from "../src/config/perfis.js";
import { listarNotificacoes } from "../src/controllers/notificacoes.controller.js";
import { listarProcessos } from "../src/controllers/processos.controller.js";
import { proximasObrigacoes } from "../src/controllers/obrigacoes.controller.js";

// #501 / QA-F §F11 — shell do dashboard chama os 3 GETs sem cliente_id para
// admin_efficience. Antes: 400; agora: 200 []. Mutações / listagens de tela
// que exigem cliente continuam com 400 (não cobertas aqui).

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

function reqAdminSemCliente(query = {}) {
  return {
    usuario: { perfil: PERFIS.ADMIN_EFFICIENCE, email: "admin@teste.com" },
    query,
    body: {},
  };
}

describe("Shell admin_efficience sem cliente_id (#501)", () => {
  it("GET /notificacoes → 200 []", async () => {
    const res = criarResposta();
    await listarNotificacoes(reqAdminSemCliente(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  it("GET /processos?status=em_andamento → 200 []", async () => {
    const res = criarResposta();
    await listarProcessos(reqAdminSemCliente({ status: "em_andamento" }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });

  it("GET /obrigacoes/proximas?dias=7 → 200 []", async () => {
    const res = criarResposta();
    await proximasObrigacoes(reqAdminSemCliente({ dias: "7" }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
  });
});
