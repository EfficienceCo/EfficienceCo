/**
 * TEST-6 (#683): exigirPerfil e resolverClienteId (src/middlewares/permissao.middleware.js).
 * Roda o middleware de produção num Express mínimo, por HTTP real, sem banco.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { exigirPerfil, resolverClienteId, PERFIS } from "../src/middlewares/permissao.middleware.js";
import { bearer, responderOk, subirMiniApp } from "./helpers/mini-app.js";

process.env.JWT_SECRET ??= "segredo-de-teste-permissao";

const CLIENTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const comPerfil = perfil => bearer({ id: "u1", perfil, cliente_id: CLIENTE });

describe("PERFIS", () => {
  it("são os três perfis do sistema, em minúscula com underscore", () => {
    assert.deepEqual(PERFIS, {
      ADMIN_EFFICIENCE: "admin_efficience",
      ADMIN_CLIENTE: "admin_cliente",
      FUNCIONARIO: "funcionario",
    });
  });
});

describe("exigirPerfil", () => {
  let app;
  before(async () => {
    app = await subirMiniApp(servidor => {
      servidor.get("/so-efficience", exigirPerfil(PERFIS.ADMIN_EFFICIENCE), responderOk);
      servidor.get("/admins", exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE), responderOk);
      servidor.get("/todos", exigirPerfil(...Object.values(PERFIS)), responderOk);
      servidor.get("/ninguem", exigirPerfil(), responderOk);
      // Rota exigindo o valor em MAIÚSCULA, para provar o sentido inverso da comparação.
      servidor.get("/exige-maiuscula", exigirPerfil("ADMIN_CLIENTE"), responderOk);
    });
  });
  after(() => app.fechar());

  it("já autentica sozinho: sem token 401, com token de outro segredo 401", async () => {
    assert.equal((await app.requisitar("/admins")).status, 401);
    const forjado = await app.requisitar("/admins", { headers: bearer({ perfil: "admin_efficience" }, { segredo: "forjado" }) });
    assert.equal(forjado.status, 401);
  });

  it("perfil permitido passa (200) e o handler vê o usuário", async () => {
    const resposta = await app.requisitar("/admins", { headers: comPerfil("admin_cliente") });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.usuario.perfil, "admin_cliente");
  });

  it("cada perfil só entra onde a rota o lista", async () => {
    const esperado = {
      "/so-efficience": { admin_efficience: 200, admin_cliente: 403, funcionario: 403 },
      "/admins": { admin_efficience: 200, admin_cliente: 200, funcionario: 403 },
      "/todos": { admin_efficience: 200, admin_cliente: 200, funcionario: 200 },
    };
    for (const [caminho, porPerfil] of Object.entries(esperado)) {
      for (const [perfil, status] of Object.entries(porPerfil)) {
        const resposta = await app.requisitar(caminho, { headers: comPerfil(perfil) });
        assert.equal(resposta.status, status, `${perfil} em ${caminho}`);
      }
    }
  });

  it("perfil negado: 403 com mensagem fixa e sem executar o handler", async () => {
    const resposta = await app.requisitar("/so-efficience", { headers: comPerfil("funcionario") });
    assert.equal(resposta.status, 403);
    assert.deepEqual(resposta.corpo, { erro: "Acesso negado: perfil sem permissão" });
  });

  // Decisão: comparação por igualdade exata, nos DOIS sentidos. Os perfis nascem do banco em
  // minúscula; aceitar outra caixa ampliaria o acesso por acidente. Referência EyeConnect: o
  // teste de um sentido só deixou passar uma mutação que removia a proteção no sentido inverso.
  describe("maiúscula/minúscula, nos dois sentidos", () => {
    it("token em MAIÚSCULA contra rota em minúscula: 403", async () => {
      const resposta = await app.requisitar("/admins", { headers: comPerfil("ADMIN_CLIENTE") });
      assert.equal(resposta.status, 403);
    });

    it("token em minúscula contra rota que exige MAIÚSCULA: 403", async () => {
      const resposta = await app.requisitar("/exige-maiuscula", { headers: comPerfil("admin_cliente") });
      assert.equal(resposta.status, 403);
    });

    it("token em MAIÚSCULA contra rota que exige o mesmo valor em MAIÚSCULA: 200 (igualdade exata, não lista fixa)", async () => {
      const resposta = await app.requisitar("/exige-maiuscula", { headers: comPerfil("ADMIN_CLIENTE") });
      assert.equal(resposta.status, 200);
    });

    it("caixa mista e espaços nas pontas: 403", async () => {
      for (const perfil of ["Admin_Cliente", "admin_Cliente", " admin_cliente", "admin_cliente ", "admin_cliente\n"]) {
        const resposta = await app.requisitar("/admins", { headers: comPerfil(perfil) });
        assert.equal(resposta.status, 403, JSON.stringify(perfil));
      }
    });
  });

  describe("perfil ausente ou de tipo inesperado no token: 403", () => {
    const casos = {
      "sem o campo perfil": undefined,
      "perfil vazio": "",
      "perfil nulo": null,
      "perfil numérico": 1,
      "perfil lista com um perfil válido": ["admin_efficience"],
      "perfil objeto": { nome: "admin_efficience" },
      "perfil inventado": "superadmin",
    };
    for (const [nome, perfil] of Object.entries(casos)) {
      it(nome, async () => {
        const resposta = await app.requisitar("/so-efficience", { headers: comPerfil(perfil) });
        assert.equal(resposta.status, 403);
      });
    }
  });

  it("exigirPerfil() sem perfis não deixa ninguém entrar (nega por padrão)", async () => {
    for (const perfil of Object.values(PERFIS)) {
      assert.equal((await app.requisitar("/ninguem", { headers: comPerfil(perfil) })).status, 403, perfil);
    }
  });

  it("devolve [autenticar, verificação de perfil], nessa ordem (autenticação nunca é pulada)", () => {
    const camadas = exigirPerfil("admin_cliente");
    assert.equal(camadas.length, 2);
    assert.equal(camadas[0].name, "autenticar");
  });
});

describe("resolverClienteId", () => {
  const OUTRO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("admin_efficience escolhe o escritório por body ou query (clienteId e cliente_id)", () => {
    const usuario = { perfil: "admin_efficience", cliente_id: null };
    assert.equal(resolverClienteId({ usuario, body: { clienteId: OUTRO } }), OUTRO);
    assert.equal(resolverClienteId({ usuario, body: { cliente_id: OUTRO } }), OUTRO);
    assert.equal(resolverClienteId({ usuario, query: { clienteId: OUTRO } }), OUTRO);
    assert.equal(resolverClienteId({ usuario, query: { cliente_id: OUTRO } }), OUTRO);
    assert.equal(resolverClienteId({ usuario, body: {}, query: {} }), undefined);
  });

  it("admin_cliente e funcionario usam SEMPRE o cliente do token, mesmo que body/query apontem outro", () => {
    for (const perfil of ["admin_cliente", "funcionario"]) {
      const req = { usuario: { perfil, cliente_id: CLIENTE }, body: { clienteId: OUTRO, cliente_id: OUTRO }, query: { clienteId: OUTRO, cliente_id: OUTRO } };
      assert.equal(resolverClienteId(req), CLIENTE, perfil);
    }
  });

  it("perfil em outra caixa não ganha o poder do admin_efficience", () => {
    const req = { usuario: { perfil: "ADMIN_EFFICIENCE", cliente_id: CLIENTE }, body: { clienteId: OUTRO } };
    assert.equal(resolverClienteId(req), CLIENTE);
  });

  it("sem usuário: undefined", () => {
    assert.equal(resolverClienteId({ body: { clienteId: OUTRO } }), undefined);
  });
});
