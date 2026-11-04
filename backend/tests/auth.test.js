/**
 * TEST-6 (#683): middleware de autenticação (src/middlewares/auth.middleware.js).
 *
 * Este arquivo era um placeholder de 2 linhas; agora é o teste do middleware
 * (o nome foi mantido; o executor da TEST-1, scripts/teste-678/executar.mjs, descobre
 * os testes por glob, filtrando *.test.js, e não cita este arquivo).
 * Roda o middleware de produção dentro de um Express mínimo, por HTTP real, sem banco.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { autenticar, autenticarOpcional } from "../src/middlewares/auth.middleware.js";
import { bearer, executarMiddleware, responderOk, subirMiniApp } from "./helpers/mini-app.js";

process.env.JWT_SECRET ??= "segredo-de-teste-auth";

const USUARIO = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "dono@example.invalid",
  perfil: "admin_cliente",
  cliente_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

// Token sem assinatura (alg none): o ataque clássico contra verificação mal feita.
function tokenSemAssinatura(payload) {
  const parte = objeto => Buffer.from(JSON.stringify(objeto)).toString("base64url");
  return `${parte({ alg: "none", typ: "JWT" })}.${parte(payload)}.`;
}

// Cada caso: header Authorization e a razão pela qual precisa ser recusado.
const CREDENCIAIS_RECUSADAS = {
  "esquema Basic": () => ({ Authorization: "Basic dXNlcjpzZW5oYQ==" }),
  "esquema sem valor ('Bearer' sozinho)": () => ({ Authorization: "Bearer" }),
  "token mal formado (não é JWT)": () => ({ Authorization: "Bearer isto-nao-e-um-jwt" }),
  "token com partes truncadas": () => ({ Authorization: `Bearer ${jwt.sign(USUARIO, process.env.JWT_SECRET).slice(0, -10)}` }),
  "token expirado": () => bearer(USUARIO, { expiresIn: -60 }),
  "token assinado com outro segredo": () => bearer(USUARIO, { segredo: "outro-segredo-qualquer" }),
  "token alg none (sem assinatura)": () => ({ Authorization: `Bearer ${tokenSemAssinatura(USUARIO)}` }),
  "token ainda não válido (nbf no futuro)": () => bearer(USUARIO, { notBefore: 3600 }),
};

describe("autenticar", () => {
  let app;
  before(async () => {
    app = await subirMiniApp(servidor => servidor.get("/protegida", autenticar, responderOk));
  });
  after(() => app.fechar());

  it("sem header Authorization: 401 'Token nao fornecido'", async () => {
    const resposta = await app.requisitar("/protegida");
    assert.equal(resposta.status, 401);
    assert.deepEqual(resposta.corpo, { erro: "Token nao fornecido" });
  });

  for (const [nome, montar] of Object.entries(CREDENCIAIS_RECUSADAS)) {
    it(`recusa ${nome}: 401`, async () => {
      const resposta = await app.requisitar("/protegida", { headers: montar() });
      assert.equal(resposta.status, 401);
      assert.ok(["Token invalido", "Token nao fornecido"].includes(resposta.corpo.erro), JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.usuario, undefined, "o handler não pode ter rodado");
    });
  }

  it("Bearer com token vazio ('Bearer '): 401, sem chamar o handler (direto, pois o HTTP corta o espaço final)", () => {
    const r = executarMiddleware(autenticar, { authorization: "Bearer " });
    assert.equal(r.status, 401);
    assert.equal(r.passou, false);
    assert.equal(r.req.usuario, undefined);
  });

  it("a mensagem não revela o motivo (expirado e segredo errado respondem igual)", async () => {
    const expirado = await app.requisitar("/protegida", { headers: bearer(USUARIO, { expiresIn: -60 }) });
    const outroSegredo = await app.requisitar("/protegida", { headers: bearer(USUARIO, { segredo: "outro-segredo-qualquer" }) });
    assert.deepEqual(expirado.corpo, outroSegredo.corpo);
  });

  it("token válido: passa e anexa id, email, perfil e cliente_id em req.usuario", async () => {
    const resposta = await app.requisitar("/protegida", { headers: bearer(USUARIO) });
    assert.equal(resposta.status, 200);
    for (const [campo, valor] of Object.entries(USUARIO)) assert.equal(resposta.corpo.usuario[campo], valor, campo);
  });

  it("o usuário vem só do token: cabeçalhos e query não o alteram", async () => {
    const resposta = await app.requisitar("/protegida?perfil=admin_efficience&cliente_id=outro", {
      headers: { ...bearer(USUARIO), "x-perfil": "admin_efficience" },
    });
    assert.equal(resposta.corpo.usuario.perfil, "admin_cliente");
    assert.equal(resposta.corpo.usuario.cliente_id, USUARIO.cliente_id);
  });
});

describe("autenticarOpcional", () => {
  let app;
  before(async () => {
    app = await subirMiniApp(servidor => servidor.get("/opcional", autenticarOpcional, responderOk));
  });
  after(() => app.fechar());

  it("sem header: segue como anônimo (req.usuario ausente)", async () => {
    const resposta = await app.requisitar("/opcional");
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.usuario, null);
  });

  it("token válido: anexa o usuário", async () => {
    const resposta = await app.requisitar("/opcional", { headers: bearer(USUARIO) });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.usuario.id, USUARIO.id);
    assert.equal(resposta.corpo.usuario.perfil, USUARIO.perfil);
  });

  // Decisão: "opcional" vale para AUSÊNCIA de credencial, nunca para credencial ruim.
  // Token inválido que virasse anônimo esconderia erro de login e deixaria a rota seguir
  // por outro caminho (ex.: x-licenca-token) sem avisar o cliente.
  for (const [nome, montar] of Object.entries(CREDENCIAIS_RECUSADAS)) {
    it(`recusa ${nome} com 401, em vez de tratar como anônimo`, async () => {
      const resposta = await app.requisitar("/opcional", { headers: montar() });
      assert.equal(resposta.status, 401);
      assert.equal(resposta.corpo.usuario, undefined, "o handler não pode ter rodado");
    });
  }

  it("Bearer com token vazio ('Bearer '): 401, em vez de tratar como anônimo (direto, pois o HTTP corta o espaço final)", () => {
    const r = executarMiddleware(autenticarOpcional, { authorization: "Bearer " });
    assert.equal(r.status, 401);
    assert.equal(r.passou, false);
    assert.equal(r.req.usuario, undefined);
  });
});
