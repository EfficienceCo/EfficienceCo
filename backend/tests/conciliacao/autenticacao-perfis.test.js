// TEST-9 (#686): as 14 rotas da Conciliação e dos lançamentos contábeis, com requisição HTTP de
// verdade e banco descartável: deslogado dá 401, perfil fora da lista dá 403, e os três perfis
// do produto chegam ao handler. Nos recusados, as tabelas da Conciliação (dois escritórios) ficam iguais.
//
// Quem pode o quê, decidido pelo código e pela SEG-1 (migration 103), e não por este teste:
// as rotas usam exigirPerfil(admin_efficience, admin_cliente, funcionario) e o RLS deixa o
// funcionario escrever nas tabelas da Conciliação (rls_pode_escrever). Nenhum dos três é barrado.
// Então "perfil sem permissão: 403" aqui é um perfil que não existe no produto no token (ex.:
// "visitante"). Se alguém decidir que algum dos três deve ser barrado em confirmar/concluir,
// isso é mudança de regra (vira teste novo), não bug achado por este arquivo.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, ator, atoresDe, UUID_INEXISTENTE, PERFIL,
} from "../helpers/conciliacao-http.js";

const ID = UUID_INEXISTENTE;

// `corpo`/`caminho` mínimos para o pedido chegar ao handler sem alterar nada.
const ROTAS = [
  { nome: "POST /conciliacoes/extrato", metodo: "POST", caminho: "/conciliacoes/extrato" },
  { nome: "GET /conciliacoes/extrato", metodo: "GET", caminho: "/conciliacoes/extrato" },
  { nome: "GET /conciliacoes/extrato/:id/transacoes", metodo: "GET", caminho: `/conciliacoes/extrato/${ID}/transacoes` },
  { nome: "POST /conciliacoes", metodo: "POST", caminho: "/conciliacoes", corpo: {} },
  { nome: "GET /conciliacoes", metodo: "GET", caminho: "/conciliacoes" },
  { nome: "GET /conciliacoes/:id", metodo: "GET", caminho: `/conciliacoes/${ID}` },
  { nome: "PATCH /conciliacoes/:id/pares/:pareId/confirmar", metodo: "PATCH", caminho: `/conciliacoes/${ID}/pares/${ID}/confirmar` },
  { nome: "PATCH /conciliacoes/:id/pares/:pareId/rejeitar", metodo: "PATCH", caminho: `/conciliacoes/${ID}/pares/${ID}/rejeitar` },
  { nome: "POST /conciliacoes/:id/concluir", metodo: "POST", caminho: `/conciliacoes/${ID}/concluir` },
  { nome: "GET /conciliacoes/:id/relatorio", metodo: "GET", caminho: `/conciliacoes/${ID}/relatorio` },
  { nome: "POST /lancamentos-contabeis", metodo: "POST", caminho: "/lancamentos-contabeis", corpo: {} },
  { nome: "GET /lancamentos-contabeis", metodo: "GET", caminho: "/lancamentos-contabeis" },
  { nome: "PATCH /lancamentos-contabeis/:id", metodo: "PATCH", caminho: `/lancamentos-contabeis/${ID}`, corpo: {} },
  { nome: "DELETE /lancamentos-contabeis/:id", metodo: "DELETE", caminho: `/lancamentos-contabeis/${ID}` },
];

describe("TEST-9: autenticação e perfis nas rotas da Conciliação (HTTP, usuário e banco reais)", { timeout: 300_000 }, () => {
  let bateria;
  let api;
  let banco;
  let A;
  let B;

  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  it("a lista cobre as rotas registradas nos dois routers, nos dois sentidos (nenhuma rota nova fica sem bateria)", async () => {
    // Lê o stack real do Express dos routers montados em /conciliacoes e /lancamentos-contabeis
    // (src/app.js). Rota nova no router sem linha em ROTAS, ou linha em ROTAS sem rota, reprova.
    const { default: conciliacoes } = await import("../../src/routes/conciliacoes.routes.js");
    const { default: lancamentos } = await import("../../src/routes/lancamentos-contabeis.routes.js");
    const registradas = [["/conciliacoes", conciliacoes], ["/lancamentos-contabeis", lancamentos]].flatMap(([prefixo, router]) =>
      router.stack.filter(camada => camada.route).flatMap(camada => {
        const caminho = camada.route.path === "/" ? prefixo : `${prefixo}${camada.route.path}`;
        return Object.keys(camada.route.methods).map(metodo => `${metodo.toUpperCase()} ${caminho}`);
      }));
    const listadas = ROTAS.map(r => r.nome);
    assert.equal(new Set(listadas).size, listadas.length, "ROTAS tem linha repetida");
    assert.deepEqual(registradas.filter(r => !listadas.includes(r)), [], "rota registrada no router sem linha em ROTAS");
    assert.deepEqual(listadas.filter(r => !registradas.includes(r)), [], "linha em ROTAS sem rota registrada no router");
    // O caminho concreto de cada linha tem de casar com o padrão do nome (ex.: :id, :pareId).
    for (const rota of ROTAS) {
      const padrao = new RegExp(`^${rota.nome.split(" ")[1].replace(/:[^/]+/g, "[^/]+")}$`);
      assert.match(rota.caminho, padrao, `${rota.nome}: caminho de teste não casa com a rota`);
    }
  });

  for (const rota of ROTAS) {
    describe(rota.nome, () => {
      it("deslogado: 401 e as tabelas da Conciliação (dois escritórios) ficam iguais", async () => {
        const antes = await fotografar(banco);
        assert.ok(antes.conciliacoes.some(c => c.cliente_id === B.cliente.id), "dado do escritório B presente");
        const resposta = await api.requisitar(rota.caminho, { metodo: rota.metodo, corpo: rota.corpo });
        assert.equal(resposta.status, 401);
        assert.deepEqual(resposta.corpo, { erro: "Token nao fornecido" });
        assert.deepEqual(await fotografar(banco), antes);
      });

      it("perfil que não existe no produto: 403 e as tabelas da Conciliação ficam iguais", async () => {
        const antes = await fotografar(banco);
        const usuario = { ...A.usuario(PERFIL.CLIENTE), perfil: "visitante" };
        const resposta = await api.requisitar(rota.caminho, { usuario, metodo: rota.metodo, corpo: rota.corpo });
        assert.equal(resposta.status, 403);
        assert.deepEqual(resposta.corpo, { erro: "Acesso negado: perfil sem permissão" });
        assert.deepEqual(await fotografar(banco), antes);
      });

      it("os três perfis do produto passam pelo 401/403 e chegam ao handler (nunca 5xx)", async () => {
        for (const quem of atoresDe(A)) {
          const resposta = await api.requisitar(rota.caminho, { usuario: quem.usuario, metodo: rota.metodo, corpo: rota.corpo });
          assert.ok(![401, 403].includes(resposta.status), `${quem.perfil} recebeu ${resposta.status}`);
          assert.ok(resposta.status < 500, `${quem.perfil} recebeu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
        }
      });
    });
  }

  it("o escritório B também tem seus três perfis servidos (a massa não favorece o A)", async () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
      const resposta = await api.requisitar("/conciliacoes", { usuario: ator(B, perfil).usuario });
      assert.equal(resposta.status, 200, perfil);
      assert.ok(resposta.corpo.every(sessao => [B.sessaoAberta, B.sessaoConcluida].includes(sessao.id)), perfil);
    }
  });
});
