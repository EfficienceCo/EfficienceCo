/**
 * TEST-6 (#683): exigirLicencaAtiva (src/middlewares/licenca.middleware.js).
 *
 * Consulta a tabela licencas, então usa o banco descartável de verdade (regra do
 * projeto: permissão/licença que lê o banco não se testa com mock). Só dados sintéticos.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { autenticar } from "../src/middlewares/auth.middleware.js";
import { exigirLicencaAtiva } from "../src/middlewares/licenca.middleware.js";
import { exigirPerfil, PERFIS } from "../src/middlewares/permissao.middleware.js";
import { criarCenarioBanco } from "./helpers/banco.js";
import { bearer, responderOk, subirMiniApp } from "./helpers/mini-app.js";

const DIA = 86_400_000;
const cenario = criarCenarioBanco();
const clientes = {}; // nome do cenário -> id do cliente
let app;

async function criarLicenca(clienteId, campos) {
  const { error } = await cenario.banco.from("licencas")
    .insert({ cliente_id: clienteId, token: `teste-683-${randomUUID()}`, ...campos });
  assert.equal(error, null, error?.message);
}

const comoUsuario = (perfil, clienteId) => bearer({ id: randomUUID(), perfil, cliente_id: clienteId });

before(async () => {
  const agora = Date.now();
  const definicoes = {
    ativaSemValidade: [{ ativa: true, validade: null }],
    ativaFutura: [{ ativa: true, validade: new Date(agora + DIA).toISOString() }],
    vencida: [{ ativa: true, validade: new Date(agora - DIA).toISOString() }],
    inativaFutura: [{ ativa: false, validade: new Date(agora + DIA).toISOString() }],
    inativaSemValidade: [{ ativa: false, validade: null }],
    ausente: [],
    // O schema tem UNIQUE(cliente_id) em licencas (licencas_cliente_id_unique): um cliente tem no máximo uma licença.
  };
  for (const [nome, licencas] of Object.entries(definicoes)) {
    const cliente = await cenario.criarCliente({ nome: `Cliente ${nome} sintético #683` });
    clientes[nome] = cliente.id;
    for (const licenca of licencas) await criarLicenca(cliente.id, licenca);
  }

  app = await subirMiniApp(servidor => {
    servidor.get(
      "/folha-teste",
      exigirPerfil(PERFIS.ADMIN_EFFICIENCE, PERFIS.ADMIN_CLIENTE, PERFIS.FUNCIONARIO),
      exigirLicencaAtiva,
      responderOk,
    );
    // Só autenticar + licença, SEM exigirPerfil: assim o perfil chega ao exigirLicencaAtiva
    // e o teste de caixa realmente exercita o bypass do admin_efficience.
    servidor.get("/so-licenca", autenticar, exigirLicencaAtiva, responderOk);
  });
});

after(async () => {
  await app?.fechar();
  const ids = Object.values(clientes);
  try {
    if (ids.length) await cenario.banco.from("licencas").delete().in("cliente_id", ids);
  } finally {
    await cenario.limpar();
  }
});

describe("exigirLicencaAtiva: licença que libera", () => {
  for (const nome of ["ativaSemValidade", "ativaFutura"]) {
    it(`${nome}: admin_cliente e funcionario passam (200)`, async () => {
      for (const perfil of ["admin_cliente", "funcionario"]) {
        const resposta = await app.requisitar("/folha-teste", { headers: comoUsuario(perfil, clientes[nome]) });
        assert.equal(resposta.status, 200, perfil);
      }
    });
  }
});

describe("exigirLicencaAtiva: licença que bloqueia (403 'Licença inativa ou expirada')", () => {
  const motivos = {
    vencida: "ativa=true mas validade já passou",
    inativaFutura: "validade no futuro mas ativa=false",
    inativaSemValidade: "ativa=false sem validade",
    ausente: "cliente sem nenhuma linha em licencas",
  };
  for (const [nome, motivo] of Object.entries(motivos)) {
    it(`${nome} (${motivo})`, async () => {
      for (const perfil of ["admin_cliente", "funcionario"]) {
        const resposta = await app.requisitar("/folha-teste", { headers: comoUsuario(perfil, clientes[nome]) });
        assert.equal(resposta.status, 403, perfil);
        assert.deepEqual(resposta.corpo, { erro: "Licença inativa ou expirada" });
      }
    });
  }

  it("a licença ativa de OUTRO escritório não vale para quem não tem a sua", async () => {
    // clientes.ativaFutura tem licença ativa; clientes.ausente não: o token de 'ausente' continua barrado.
    const resposta = await app.requisitar("/folha-teste", { headers: comoUsuario("admin_cliente", clientes.ausente) });
    assert.equal(resposta.status, 403);
  });

  it("cliente_id do token inexistente no banco: 403", async () => {
    const resposta = await app.requisitar("/folha-teste", { headers: comoUsuario("admin_cliente", randomUUID()) });
    assert.equal(resposta.status, 403);
  });
});

describe("exigirLicencaAtiva: admin_efficience e usuário sem cliente", () => {
  it("admin_efficience passa sem licença e sem cliente (equipe interna, não pertence a um escritório)", async () => {
    const semCliente = await app.requisitar("/folha-teste", { headers: comoUsuario("admin_efficience", null) });
    assert.equal(semCliente.status, 200);
    const comLicencaVencida = await app.requisitar("/folha-teste", { headers: comoUsuario("admin_efficience", clientes.vencida) });
    assert.equal(comLicencaVencida.status, 200);
  });

  // Decisão: o bypass é por igualdade exata com "admin_efficience". Em maiúscula o usuário é um
  // perfil desconhecido e segue a regra comum: sem cliente_id -> 400; com cliente de licença
  // vencida -> 403. Nunca 200.
  it("ADMIN_EFFICIENCE em MAIÚSCULA não ganha o bypass (rota sem exigirPerfil)", async () => {
    const semCliente = await app.requisitar("/so-licenca", { headers: comoUsuario("ADMIN_EFFICIENCE", null) });
    assert.equal(semCliente.status, 400);
    const vencida = await app.requisitar("/so-licenca", { headers: comoUsuario("ADMIN_EFFICIENCE", clientes.vencida) });
    assert.equal(vencida.status, 403);
    assert.deepEqual(vencida.corpo, { erro: "Licença inativa ou expirada" });
  });

  it("controle: admin_efficience em minúscula passa pela mesma rota sem cliente (200)", async () => {
    const resposta = await app.requisitar("/so-licenca", { headers: comoUsuario("admin_efficience", null) });
    assert.equal(resposta.status, 200);
  });

  for (const perfil of ["admin_cliente", "funcionario"]) {
    it(`${perfil} sem cliente_id no token: 400 'Usuario sem cliente vinculado'`, async () => {
      const resposta = await app.requisitar("/folha-teste", { headers: comoUsuario(perfil, null) });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "Usuario sem cliente vinculado" });
    });
  }

  it("admin_cliente não escolhe o escritório por query: vale o cliente do token", async () => {
    // Token do cliente sem licença tentando apontar para o cliente com licença ativa.
    const resposta = await app.requisitar(`/folha-teste?clienteId=${clientes.ativaFutura}&cliente_id=${clientes.ativaFutura}`, {
      headers: comoUsuario("admin_cliente", clientes.ausente),
    });
    assert.equal(resposta.status, 403);
  });
});
