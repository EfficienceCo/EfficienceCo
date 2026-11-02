// TEST-9 (#686): confirmar e rejeitar par provável, com HTTP, usuário e banco reais, incluindo
// pedidos em paralelo (o que o banco falso dos testes antigos não consegue reproduzir).
//
// Origem dos números (massa #680, sessão aberta do escritório A): 21 pares, índices 1,4,...,19 são
// prováveis e só o 1 está confirmado; totais da sessão 8 conciliadas / 13 pendentes (7 automáticos +
// 1 confirmado; 6 prováveis pendentes + 7 sem par). Confirmar o par 4 leva a 9 / 12. Rejeitar não
// muda o total_pendentes: ele conta só transações (conciliadas + pendentes = total_transacoes, #559).
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, atoresDe, buscarLinha, buscarLinhas, provarOutroEscritorio404,
  conhecido, UUID_INEXISTENTE, PERFIL, paraEpoch,
} from "../helpers/conciliacao-http.js";

describe("TEST-9: PATCH /conciliacoes/:id/pares/:pareId/confirmar e /rejeitar", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const patch = (a, acao, sessaoId, parId) => chamar(api, a, { metodo: "PATCH", caminho: `/conciliacoes/${sessaoId}/pares/${parId}/${acao}` });
  const confirmar = (a, sessaoId, parId) => patch(a, "confirmar", sessaoId, parId);
  const rejeitar = (a, sessaoId, parId) => patch(a, "rejeitar", sessaoId, parId);

  describe("confirmar", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
      it(`${perfil}: confirma o par 4, grava quem e quando, e os totais passam de 8/13 para 9/12`, async () => {
        const quem = ator(A, perfil);
        const antesDoB = await fotografar(banco, B.cliente.id);
        const antesDoA = await fotografar(banco, A.cliente.id);

        const resposta = await confirmar(quem, A.sessaoAberta, A.parAberto(4));

        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        assert.deepEqual(resposta.corpo, { id: A.parAberto(4), confianca: "provavel", confirmado_por: quem.usuario.id });
        const par = await buscarLinha(banco, "pares_conciliacao", A.parAberto(4));
        assert.equal(par.confirmado_por, quem.usuario.id);
        assert.ok(Math.abs(Date.now() - paraEpoch(par.confirmado_em)) < 60_000, "confirmado_em é agora");
        assert.deepEqual([par.confianca, par.transacao_id, par.lancamento_id], ["provavel", A.transacaoAberta(4), A.lancamentoAberto(4)]);
        const sessao = await buscarLinha(banco, "conciliacoes", A.sessaoAberta);
        assert.deepEqual([sessao.total_conciliadas, sessao.total_pendentes, sessao.status], [9, 12, "em_andamento"]);

        // Confirmar não marca conciliado (só concluir marca) e não mexe em nenhuma outra linha.
        const depoisDoA = await fotografar(banco, A.cliente.id);
        assert.deepEqual(depoisDoA.transacoes_extrato, antesDoA.transacoes_extrato);
        assert.deepEqual(depoisDoA.lancamentos_contabeis, antesDoA.lancamentos_contabeis);
        assert.deepEqual(
          depoisDoA.pares_conciliacao.filter(p => p.id !== A.parAberto(4)),
          antesDoA.pares_conciliacao.filter(p => p.id !== A.parAberto(4)),
        );
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("par que não está disponível (automático, sem par, já confirmado): 409 e o banco não muda", async () => {
      for (const [indice, nome] of [[0, "automático"], [2, "sem par"], [1, "já confirmado"]]) {
        const antes = await fotografar(banco);
        const resposta = await confirmar(ator(A, PERFIL.CLIENTE), A.sessaoAberta, A.parAberto(indice));
        assert.equal(resposta.status, 409, nome);
        assert.deepEqual(resposta.corpo, { erro: "Par não está disponível para confirmação" }, nome);
        assert.deepEqual(await fotografar(banco), antes, nome);
      }
    });

    it("confirmar duas vezes em sequência: 200 e depois 409 (o falso do bug de concorrência)", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      assert.equal((await confirmar(quem, A.sessaoAberta, A.parAberto(4))).status, 200);
      const depoisDaPrimeira = await fotografar(banco);
      assert.equal((await confirmar(quem, A.sessaoAberta, A.parAberto(4))).status, 409);
      assert.deepEqual(await fotografar(banco), depoisDaPrimeira);
    });

    it("sessão do outro escritório: mesmo 404 da sessão inexistente, com o par do B presente e o banco intacto", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "pares_conciliacao", id: B.parAberto(4) },
        atores: atoresDe(A),
        montar: id => ({ metodo: "PATCH", caminho: `/conciliacoes/${id === B.parAberto(4) ? B.sessaoAberta : id}/pares/${B.parAberto(4)}/confirmar` }),
        mensagem: "Conciliação não encontrada",
      });
    });

    it("par do B dentro de uma sessão do A: 404 'Par de conciliação não encontrado', igual ao par inexistente", async () => {
      for (const quem of atoresDe(A)) {
        const antes = await fotografar(banco);
        const doB = await confirmar(quem, A.sessaoAberta, B.parAberto(4));
        const inexistente = await confirmar(quem, A.sessaoAberta, UUID_INEXISTENTE);
        assert.equal(doB.status, 404, quem.perfil);
        assert.deepEqual(doB.corpo, { erro: "Par de conciliação não encontrado" }, quem.perfil);
        assert.deepEqual(doB, { ...inexistente, headers: doB.headers }, quem.perfil);
        assert.deepEqual(await fotografar(banco), antes, quem.perfil);
        assert.equal((await buscarLinha(banco, "pares_conciliacao", B.parAberto(4))).confirmado_em, null);
      }
    });

    it("par de outra sessão do mesmo escritório pedido na sessão errada: 404", async () => {
      const antes = await fotografar(banco);
      const resposta = await confirmar(ator(A, PERFIL.CLIENTE), A.sessaoConcluida, A.parAberto(4));
      assert.equal(resposta.status, 404);
      assert.deepEqual(resposta.corpo, { erro: "Par de conciliação não encontrado" });
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("ids que não são UUID: 400 dizendo qual (id ou pareId)", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const sessao = await confirmar(quem, "abc", A.parAberto(4));
      assert.deepEqual([sessao.status, sessao.corpo], [400, { erro: "id deve ser um UUID válido" }]);
      const par = await confirmar(quem, A.sessaoAberta, "abc");
      assert.deepEqual([par.status, par.corpo], [400, { erro: "pareId deve ser um UUID válido" }]);
    });

    it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
      const resposta = await api.requisitar(`/conciliacoes/${A.sessaoAberta}/pares/${A.parAberto(4)}/confirmar`, { usuario: A.usuario(PERFIL.EFFICIENCE), metodo: "PATCH" });
      assert.deepEqual([resposta.status, resposta.corpo], [400, { erro: "cliente_id é obrigatório" }]);
    });
  });

  describe("rejeitar", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
      it(`${perfil}: rejeita o par 4 e o lançamento continua visível como sem par (PRB-C-01, #555)`, async () => {
        const quem = ator(A, perfil);
        const antesDoB = await fotografar(banco, B.cliente.id);
        const antesDoA = await fotografar(banco, A.cliente.id);

        const resposta = await rejeitar(quem, A.sessaoAberta, A.parAberto(4));

        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.id, A.parAberto(4));
        assert.equal(resposta.corpo.confianca, "sem_par");
        assert.deepEqual({ ...resposta.corpo.par_lancamento, id: undefined }, { id: undefined, lancamento_id: A.lancamentoAberto(4), confianca: "sem_par" });

        // O par original fica só com a transação; um par novo fica só com o lançamento.
        const original = await buscarLinha(banco, "pares_conciliacao", A.parAberto(4));
        assert.deepEqual([original.transacao_id, original.lancamento_id, original.confianca, original.confirmado_em], [A.transacaoAberta(4), null, "sem_par", null]);
        const novo = await buscarLinha(banco, "pares_conciliacao", resposta.corpo.par_lancamento.id);
        assert.deepEqual([novo.conciliacao_id, novo.transacao_id, novo.lancamento_id, novo.confianca], [A.sessaoAberta, null, A.lancamentoAberto(4), "sem_par"]);

        // total_pendentes não muda (conta só transações) e a sessão tem um par a mais (22).
        const sessao = await buscarLinha(banco, "conciliacoes", A.sessaoAberta);
        assert.deepEqual([sessao.total_conciliadas, sessao.total_pendentes], [8, 13]);
        assert.equal((await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: A.sessaoAberta })).length, 22);

        const depoisDoA = await fotografar(banco, A.cliente.id);
        assert.deepEqual(depoisDoA.transacoes_extrato, antesDoA.transacoes_extrato);
        assert.deepEqual(depoisDoA.lancamentos_contabeis, antesDoA.lancamentos_contabeis);
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("par já confirmado não pode ser desconfirmado: 409 e o banco não muda (PRB-C-18)", async () => {
      const antes = await fotografar(banco);
      const resposta = await rejeitar(ator(A, PERFIL.CLIENTE), A.sessaoAberta, A.parAberto(1));
      assert.equal(resposta.status, 409);
      assert.deepEqual(resposta.corpo, { erro: "Par não está disponível para rejeição" });
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("par automático ou sem par: 409 e o banco não muda", async () => {
      for (const indice of [0, 2]) {
        const antes = await fotografar(banco);
        const resposta = await rejeitar(ator(A, PERFIL.CLIENTE), A.sessaoAberta, A.parAberto(indice));
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Par não está disponível para rejeição" }], `par ${indice}`);
        assert.deepEqual(await fotografar(banco), antes, `par ${indice}`);
      }
    });

    it("sessão do outro escritório: mesmo 404 da sessão inexistente, com o par do B presente e o banco intacto", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "pares_conciliacao", id: B.parAberto(4) },
        atores: atoresDe(A),
        montar: id => ({ metodo: "PATCH", caminho: `/conciliacoes/${id === B.parAberto(4) ? B.sessaoAberta : id}/pares/${B.parAberto(4)}/rejeitar` }),
        mensagem: "Conciliação não encontrada",
      });
    });

    it("par do B dentro de uma sessão do A: 404 igual ao par inexistente, sem criar par no B", async () => {
      for (const quem of atoresDe(A)) {
        const antes = await fotografar(banco);
        const doB = await rejeitar(quem, A.sessaoAberta, B.parAberto(4));
        assert.deepEqual([doB.status, doB.corpo], [404, { erro: "Par de conciliação não encontrado" }], quem.perfil);
        assert.deepEqual(await fotografar(banco), antes, quem.perfil);
      }
    });

    it("ids que não são UUID: 400 dizendo qual", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const sessao = await rejeitar(quem, "abc", A.parAberto(4));
      assert.deepEqual([sessao.status, sessao.corpo], [400, { erro: "id deve ser um UUID válido" }]);
      const par = await rejeitar(quem, A.sessaoAberta, "abc");
      assert.deepEqual([par.status, par.corpo], [400, { erro: "pareId deve ser um UUID válido" }]);
    });

    it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
      const resposta = await api.requisitar(`/conciliacoes/${A.sessaoAberta}/pares/${A.parAberto(4)}/rejeitar`, { usuario: A.usuario(PERFIL.EFFICIENCE), metodo: "PATCH" });
      assert.deepEqual([resposta.status, resposta.corpo], [400, { erro: "cliente_id é obrigatório" }]);
    });

    it("confirmar e depois rejeitar em sequência: 200 e 409, o par fica confirmado (PRB-C-13, parte sequencial)", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      assert.equal((await confirmar(quem, A.sessaoAberta, A.parAberto(4))).status, 200);
      assert.equal((await rejeitar(quem, A.sessaoAberta, A.parAberto(4))).status, 409);
      const par = await buscarLinha(banco, "pares_conciliacao", A.parAberto(4));
      assert.deepEqual([par.confianca, par.lancamento_id === A.lancamentoAberto(4)], ["provavel", true]);
    });
  });

  // Pedidos de verdade ao mesmo tempo contra o banco real. Hoje a leitura do estado e o UPDATE são
  // duas operações, então os dois passam. O teste do comportamento certo fica com skip (#690).
  describe("concorrência (PRB-C-13, 14 e 15)", () => {
    const MOTIVO = "BUG #690 (PRB-C-13/14/15): UPDATE não condiciona em confirmado_em IS NULL / estado lido e os totais são lidos e gravados em duas operações; aberto, PR #711";

    it("confirmar + rejeitar o mesmo par ao mesmo tempo: um 200 e um 409, e o par termina coerente", conhecido(MOTIVO), async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const respostas = await Promise.all([confirmar(quem, A.sessaoAberta, A.parAberto(4)), rejeitar(quem, A.sessaoAberta, A.parAberto(4))]);
      assert.deepEqual(respostas.map(r => r.status).sort(), [200, 409]);
      const par = await buscarLinha(banco, "pares_conciliacao", A.parAberto(4));
      const confirmado = par.confirmado_em !== null;
      // Um estado só: ou confirmado (provável, com lançamento) ou rejeitado (sem par, sem lançamento, nunca os dois).
      assert.ok(confirmado ? par.confianca === "provavel" && par.lancamento_id : par.confianca === "sem_par" && par.lancamento_id === null,
        `estado impossível: ${JSON.stringify(par)}`);
      const doLancamento = (await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: A.sessaoAberta })).filter(p => p.lancamento_id === A.lancamentoAberto(4));
      assert.ok(doLancamento.length <= 1, "o lançamento aparece em mais de um par");
    });

    it("confirmar o mesmo par 3 vezes ao mesmo tempo: um 200 e dois 409", conhecido(MOTIVO), async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const respostas = await Promise.all([1, 2, 3].map(() => confirmar(quem, A.sessaoAberta, A.parAberto(4))));
      assert.deepEqual(respostas.map(r => r.status).sort(), [200, 409, 409]);
      const sessao = await buscarLinha(banco, "conciliacoes", A.sessaoAberta);
      assert.deepEqual([sessao.total_conciliadas, sessao.total_pendentes], [9, 12], "contou uma confirmação só");
    });

    it("rejeitar o mesmo par em duas abas: um 200, um 409 e um único par novo para o lançamento", conhecido(MOTIVO), async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const respostas = await Promise.all([1, 2].map(() => rejeitar(quem, A.sessaoAberta, A.parAberto(4))));
      assert.deepEqual(respostas.map(r => r.status).sort(), [200, 409]);
      const doLancamento = (await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: A.sessaoAberta })).filter(p => p.lancamento_id === A.lancamentoAberto(4));
      assert.equal(doLancamento.length, 1, "o lançamento rejeitado aparece em um par só");
    });

    it("confirmar 3 pares diferentes ao mesmo tempo: os totais fecham em 11 conciliadas e 10 pendentes", conhecido(MOTIVO), async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      // 8 + 3 = 11 conciliadas; 13 - 3 = 10 pendentes (conta à mão sobre a massa).
      const respostas = await Promise.all([4, 7, 10].map(i => confirmar(quem, A.sessaoAberta, A.parAberto(i))));
      assert.deepEqual(respostas.map(r => r.status), [200, 200, 200]);
      const sessao = await buscarLinha(banco, "conciliacoes", A.sessaoAberta);
      assert.deepEqual([sessao.total_conciliadas, sessao.total_pendentes], [11, 10]);
    });
  });
});
