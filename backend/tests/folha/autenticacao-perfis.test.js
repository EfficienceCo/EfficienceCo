// TEST-FOLHA-2 (#750): quem entra em cada rota da Folha. Requisição HTTP de verdade, usuário, licença e banco
// descartável de verdade (massa #680, com folha pronta nos DOIS escritórios para provar que a recusa não mexe
// em nada). Por rota: deslogado 401; perfil que não existe no produto 403; escritório sem licença ativa 403
// (e a licença do outro escritório não salva); os três perfis do produto chegam ao handler.
//
// Quem pode o quê, decidido pelo código (folha.routes.js: exigirPerfil dos três perfis + exigirLicencaAtiva)
// e pela matriz-acesso.js. Os três perfis do produto entram, então "perfil errado" aqui é um perfil que não
// existe no produto no token (ex.: "visitante"), como no TEST-9. A bateria de POST /folha/upload/agente
// (token do agente, sem JWT) está no TEST-11 (folha-upload-agente-http.test.js).
import { describe, it, before, after, mock } from "node:test";
import { contextoDb } from "../../src/config/db-usuario.js";
import assert from "node:assert/strict";
import { alterarLicenca } from "../helpers/licenca-agente.js";
import {
  iniciarBateriaFolha, folhaPronta, fotografarFolha, UUID_INEXISTENTE, PERFIL, MARIA, JOSE,
} from "../helpers/folha-http.js";

const ID = UUID_INEXISTENTE;
const ROTAS = [
  { nome: "GET /folha/template", metodo: "GET", caminho: "/folha/template", handler: [200] },
  { nome: "POST /folha/upload", metodo: "POST", caminho: "/folha/upload", handler: [400] },
  { nome: "POST /folha/:processamento_id/calcular", metodo: "POST", caminho: `/folha/${ID}/calcular`, handler: [404] },
  { nome: "POST /folha/:processamento_id/gerar-saida", metodo: "POST", caminho: `/folha/${ID}/gerar-saida`, handler: [404] },
  { nome: "GET /folha/:processamento_id", metodo: "GET", caminho: `/folha/${ID}`, handler: [404] },
  { nome: "GET /folha/:processamento_id/download/:arquivo", metodo: "GET", caminho: `/folha/${ID}/download/${ID}`, handler: [404] },
];
// Rotas do router sem JWT de usuário: a bateria delas mora em outro arquivo.
const FORA_DESTA_BATERIA = ["POST /folha/upload/agente"];

describe("TEST-FOLHA-2: autenticação, perfis e licença nas rotas da Folha (HTTP, banco real)", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let memoria; let A; let B;

  // Uma recriação só: nada aqui grava (cada teste confere a fotografia antes e depois).
  before(async () => {
    bateria = await iniciarBateriaFolha();
    api = bateria.api;
    ({ banco, memoria, A, B } = await bateria.recriar());
    await folhaPronta(api, banco, A.usuario(PERFIL.CLIENTE), [MARIA, JOSE]);
    await folhaPronta(api, banco, B.usuario(PERFIL.CLIENTE), [MARIA, JOSE], { mes: "2026-09" });
  });
  after(() => bateria.encerrar());

  it("a lista cobre as rotas registradas no router, nos dois sentidos (rota nova fica sem bateria = reprova)", async () => {
    const { default: router } = await import("../../src/routes/folha.routes.js");
    const registradas = router.stack.filter(camada => camada.route).flatMap(camada => {
      const caminho = camada.route.path === "/" ? "/folha" : `/folha${camada.route.path}`;
      return Object.keys(camada.route.methods).map(metodo => `${metodo.toUpperCase()} ${caminho}`);
    });
    const listadas = [...ROTAS.map(r => r.nome), ...FORA_DESTA_BATERIA];
    assert.equal(new Set(listadas).size, listadas.length, "linha repetida");
    assert.deepEqual(registradas.filter(r => !listadas.includes(r)), [], "rota registrada sem linha nesta bateria");
    assert.deepEqual(listadas.filter(r => !registradas.includes(r)), [], "linha sem rota registrada");
    for (const rota of ROTAS) {
      const padrao = new RegExp(`^${rota.nome.split(" ")[1].replace(/:[^/]+/g, "[^/]+")}$`);
      assert.match(rota.caminho, padrao, `${rota.nome}: caminho de teste não casa com a rota`);
    }
  });

  for (const rota of ROTAS) {
    describe(rota.nome, () => {
      const chamar = (usuario, opcoes = {}) => api.requisitar(rota.caminho, { usuario, metodo: rota.metodo, ...opcoes });

      it("deslogado: 401 e nada muda nas tabelas da Folha nem no Storage (dois escritórios)", async () => {
        const antes = await fotografarFolha(banco, memoria);
        assert.ok(antes.processamentos_folha.some(p => p.cliente_id === B.cliente.id), "dado do escritório B presente");
        const resposta = await chamar(null);
        assert.equal(resposta.status, 401);
        assert.deepEqual(resposta.corpo, { erro: "Token nao fornecido" });
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });

      it("token inválido: 401", async () => {
        const antes = await fotografarFolha(banco, memoria);
        const resposta = await api.requisitar(rota.caminho, {
          metodo: rota.metodo, cabecalhos: { Authorization: "Bearer isto-nao-e-um-jwt" },
        });
        assert.equal(resposta.status, 401);
        assert.deepEqual(resposta.corpo, { erro: "Token invalido" });
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });

      it("perfil que não existe no produto: 403 e nada muda", async () => {
        const antes = await fotografarFolha(banco, memoria);
        const resposta = await chamar({ ...A.usuario(PERFIL.CLIENTE), perfil: "visitante" });
        assert.equal(resposta.status, 403);
        assert.deepEqual(resposta.corpo, { erro: "Acesso negado: perfil sem permissão" });
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });

      it("escritório com licença desligada ou vencida: 403; a licença ativa do outro escritório não vale; admin_efficience não depende dela", async () => {
        const antes = await fotografarFolha(banco, memoria);
        try {
          for (const [rotulo, campos] of [["desligada", { ativa: false }], ["vencida", { ativa: true, validade: "2020-01-01T00:00:00Z" }]]) {
            await alterarLicenca(banco, A.token, campos);
            for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
              const resposta = await chamar(A.usuario(perfil));
              assert.equal(resposta.status, 403, `${perfil} com licença ${rotulo}`);
              assert.deepEqual(resposta.corpo, { erro: "Licença inativa ou expirada" });
            }
            // O B segue com a licença dele ativa e serve normalmente (a recusa é do A).
            assert.ok(![401, 403].includes((await chamar(B.usuario(PERFIL.CLIENTE))).status), `B com a licença ativa (A ${rotulo})`);
            assert.ok(![401, 403].includes((await chamar(A.usuario(PERFIL.EFFICIENCE))).status), `admin_efficience (A ${rotulo})`);
          }
        } finally {
          await alterarLicenca(banco, A.token, { ativa: true, validade: null });
        }
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
        assert.ok(![401, 403].includes((await chamar(A.usuario(PERFIL.CLIENTE))).status), "controle: com a licença de volta, o A entra");
      });

      it("usuário sem escritório vinculado: 400", async () => {
        const resposta = await chamar({ ...A.usuario(PERFIL.CLIENTE), cliente_id: null });
        assert.equal(resposta.status, 400);
        assert.deepEqual(resposta.corpo, { erro: "Usuario sem cliente vinculado" });
      });

      it("os três perfis do produto passam pelo 401/403 e chegam ao handler (nunca 5xx)", async () => {
        const antes = await fotografarFolha(banco, memoria);
        for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
          const resposta = await chamar(A.usuario(perfil));
          assert.ok(rota.handler.includes(resposta.status), `${perfil} recebeu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
        }
        assert.deepEqual(await fotografarFolha(banco, memoria), antes);
      });
    });
  }

  describe("licença com a RLS neutralizada (o filtro por escritório é do código)", () => {
    let troca;
    before(() => { troca = mock.method(contextoDb, "getStore", () => undefined); });
    after(() => troca.mock.restore());

    it("A com a licença desligada e B com a licença ativa (a mais recente): o A continua barrado, só a licença dele conta", async () => {
      const usuarioA = A.usuario(PERFIL.CLIENTE);
      try {
        await alterarLicenca(banco, A.token, { ativa: false });
        const resposta = await api.requisitar("/folha/template", { usuario: usuarioA });
        assert.deepEqual([resposta.status, resposta.corpo], [403, { erro: "Licença inativa ou expirada" }]);
        assert.equal((await api.requisitar("/folha/template", { usuario: B.usuario(PERFIL.CLIENTE) })).status, 200, "controle: o B, com licença ativa, entra");
      } finally {
        await alterarLicenca(banco, A.token, { ativa: true, validade: null });
      }
      assert.equal((await api.requisitar("/folha/template", { usuario: usuarioA })).status, 200);
    });
  });
});
