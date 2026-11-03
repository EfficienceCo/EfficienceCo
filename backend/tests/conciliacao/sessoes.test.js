// TEST-9 (#686): criar, listar e abrir uma sessão de conciliação, com HTTP, usuário e banco reais.
//
// Origem dos números: o cenário de novembro/2026 (CENARIO_NOVEMBRO, em helpers/conciliacao-http.js)
// tem a conta feita à mão a partir da regra do matching (conciliacao-matching.util.js). A sessão
// aberta da massa #680 tem 21 pares: automáticos nos índices 0,3,...,18 (7), prováveis em 1,4,...,19
// (7, só o 1 confirmado) e sem par em 2,5,...,20 (7); total_conciliadas 8 = 7 + 1 confirmado e
// total_pendentes 13 = 6 prováveis + 7 sem par. A concluída tem 2 pares (automático e provável
// confirmado), totais 2 / 0.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, atoresDe, buscarLinha, buscarLinhas, criarExtratoProcessado,
  criarLancamentos, montarCenarioNovembro, provarOutroEscritorio404, conhecido, UUID_INEXISTENTE, PERFIL, paraEpoch,
} from "../helpers/conciliacao-http.js";

const porId = (a, b) => String(a.id).localeCompare(String(b.id));

describe("TEST-9: POST /conciliacoes (criar a sessão e rodar o matching)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const criar = (a, corpo) => chamar(api, a, { metodo: "POST", caminho: "/conciliacoes", corpo });

  describe("caminho feliz: 201 e o banco conferido depois", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
      it(`${perfil}: cenário de novembro gera 1 automático, 1 provável e 4 sem par`, async () => {
        const quem = ator(A, perfil);
        const cenario = await montarCenarioNovembro(banco, A.cliente.id);
        // Dado do outro escritório que casaria com a T1 do A se o filtro vazasse: mesmo valor, tipo e dia.
        const [lancamentoDoB] = await criarLancamentos(banco, B.cliente.id, [{ data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "L-B casaria com T1" }]);
        const antesDoB = await fotografar(banco, B.cliente.id);

        const resposta = await criar(quem, { extrato_id: cenario.extrato.id, mes: 11, ano: 2026 });

        assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
        // Os 4 pares sem par são T3, T4 (transações) e L3, L4 (lançamentos).
        assert.deepEqual({ ...resposta.corpo, conciliacao_id: undefined }, {
          conciliacao_id: undefined, total_transacoes: 4, automaticos: 1, provaveis: 1, sem_par: 4, lancamentos_em_outra_conciliacao: 0,
        });
        const sessao = await buscarLinha(banco, "conciliacoes", resposta.corpo.conciliacao_id);
        // Totais: conciliadas = 1 automático; pendentes = 1 provável + 2 transações sem par = 3; 1 + 3 = 4 transações.
        assert.deepEqual(
          { cliente_id: sessao.cliente_id, extrato_id: sessao.extrato_id, mes: sessao.mes, ano: sessao.ano, status: sessao.status, total_transacoes: sessao.total_transacoes, total_conciliadas: sessao.total_conciliadas, total_pendentes: sessao.total_pendentes, concluida_em: sessao.concluida_em },
          { cliente_id: A.cliente.id, extrato_id: cenario.extrato.id, mes: 11, ano: 2026, status: "em_andamento", total_transacoes: 4, total_conciliadas: 1, total_pendentes: 3, concluida_em: null },
        );
        const pares = await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: sessao.id });
        const forma = pares.map(p => [p.transacao_id, p.lancamento_id, p.confianca]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
        const esperado = [
          [cenario.T(1).id, cenario.L(1).id, "automatico"],
          [cenario.T(2).id, cenario.L(2).id, "provavel"],
          [cenario.T(3).id, null, "sem_par"],
          [cenario.T(4).id, null, "sem_par"],
          [null, cenario.L(3).id, "sem_par"],
          [null, cenario.L(4).id, "sem_par"],
        ].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
        assert.deepEqual(forma, esperado);
        assert.ok(pares.every(p => p.confirmado_em === null && p.confirmado_por === null), "nada nasce confirmado");
        assert.ok(!pares.some(p => p.lancamento_id === lancamentoDoB.id), "lançamento do B não entra no matching do A");

        // Criar a sessão não marca nada como conciliado: isso só acontece ao concluir.
        const transacoes = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: cenario.extrato.id });
        assert.ok(transacoes.every(t => t.conciliado === false));
        assert.equal((await buscarLinha(banco, "lancamentos_contabeis", lancamentoDoB.id)).conciliado, false);
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("extrato sem transações e mês sem lançamentos: 201 com tudo zerado e nenhum par", async () => {
      const { extrato } = await criarExtratoProcessado(banco, A.cliente.id, { mes: 12, ano: 2026 });
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extrato.id, mes: 12, ano: 2026 });
      assert.equal(resposta.status, 201);
      assert.deepEqual({ ...resposta.corpo, conciliacao_id: undefined }, { conciliacao_id: undefined, total_transacoes: 0, automaticos: 0, provaveis: 0, sem_par: 0, lancamentos_em_outra_conciliacao: 0 });
      assert.deepEqual(await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: resposta.corpo.conciliacao_id }), []);
    });

    it("lançamento já conciliado (concluída de 09/2026) não é casado de novo em outro extrato do mesmo mês (PRB-C-03, #556)", async () => {
      // A transação nova tem o mesmo valor, tipo e dia do lançamento já conciliado (i=0: 2026-09-01, 10, crédito).
      const { extrato, transacoes } = await criarExtratoProcessado(banco, A.cliente.id, {
        mes: 9, ano: 2026, nome: "setembro-2.ofx", transacoes: [{ data: "2026-09-01", valor: 10, tipo: "credito", descricao: "repete o já conciliado" }],
      });
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extrato.id, mes: 9, ano: 2026 });
      assert.equal(resposta.status, 201);
      const pares = await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: resposta.corpo.conciliacao_id });
      assert.ok(!pares.some(p => p.lancamento_id === A.lancamentoConcluido(0)), "lançamento conciliado não pode voltar");
      assert.deepEqual(pares.map(p => [p.transacao_id, p.lancamento_id, p.confianca]), [[transacoes[0].id, null, "sem_par"]]);
    });
  });

  describe("transação já conciliada não volta para o matching (filtro conciliado=false das transações)", () => {
    it("extrato processado sem sessão, com uma transação conciliada e outra não: só a pendente vira par e entra nos totais", async () => {
      // Conta à mão: T1 (crédito 1.000,00 em 03/11) já conciliada e T2 (débito 250,50 em 10/11) pendente,
      // cada uma com um lançamento idêntico (L1 e L2). Só T2 entra: 1 transação, 1 automático (T2 x L2),
      // 0 prováveis; L1 sobra como lançamento sem par (1). Totais: conciliadas 1, pendentes 0.
      // Se o filtro sumir, T1 casaria com L1 e daria 2 transações e 2 automáticos.
      const { extrato, transacoes } = await criarExtratoProcessado(banco, A.cliente.id, {
        mes: 11, ano: 2026, nome: "conciliada-e-pendente.ofx",
        transacoes: [
          { data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "T1 ja conciliada" },
          { data: "2026-11-10", valor: 250.5, tipo: "debito", descricao: "T2 pendente" },
        ],
      });
      const [t1, t2] = transacoes;
      const { error } = await banco.from("transacoes_extrato").update({ conciliado: true }).eq("id", t1.id);
      assert.equal(error, null);
      const [l1, l2] = await criarLancamentos(banco, A.cliente.id, [
        { data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "L1 casaria com T1" },
        { data: "2026-11-10", valor: 250.5, tipo: "debito", descricao: "L2 casa com T2" },
      ]);
      assert.deepEqual(await buscarLinhas(banco, "conciliacoes", { extrato_id: extrato.id }), [], "extrato sem sessão");
      const t1Antes = await buscarLinha(banco, "transacoes_extrato", t1.id);

      const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extrato.id, mes: 11, ano: 2026 });

      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      assert.deepEqual({ ...resposta.corpo, conciliacao_id: undefined }, { conciliacao_id: undefined, total_transacoes: 1, automaticos: 1, provaveis: 0, sem_par: 1, lancamentos_em_outra_conciliacao: 0 });
      const sessao = await buscarLinha(banco, "conciliacoes", resposta.corpo.conciliacao_id);
      assert.deepEqual([sessao.total_transacoes, sessao.total_conciliadas, sessao.total_pendentes], [1, 1, 0]);
      const pares = await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: sessao.id });
      assert.deepEqual(
        pares.map(p => [p.transacao_id, p.lancamento_id, p.confianca]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
        [[t2.id, l2.id, "automatico"], [null, l1.id, "sem_par"]].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
      );
      assert.ok(!pares.some(p => p.transacao_id === t1.id), "transação já conciliada virou par");
      assert.deepEqual(await buscarLinha(banco, "transacoes_extrato", t1.id), t1Antes, "a transação conciliada não muda");
    });
  });

  describe("outro escritório: 404 igual ao de inexistente, com extrato do B presente", () => {
    it("extrato do B pedido por quem é do A (e pelo admin_efficience escolhendo o A): mesmo 404 do id inexistente, nenhuma sessão criada", async () => {
      const doB = await montarCenarioNovembro(banco, B.cliente.id, { nome: "nov-b.ofx" });
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "extratos_bancarios", id: doB.extrato.id },
        atores: atoresDe(A),
        montar: id => ({ metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: id, mes: 11, ano: 2026 } }),
        mensagem: "Extrato bancário não encontrado",
      });
      assert.deepEqual(await buscarLinhas(banco, "conciliacoes", { extrato_id: doB.extrato.id }), [], "o B continua sem sessão");
    });
  });

  describe("entrada inválida: 400 com a mensagem e nada criado", () => {
    const CASOS = [
      ["sem extrato_id", { mes: 11, ano: 2026 }, "extrato_id é obrigatório"],
      ["extrato_id que não é UUID", { extrato_id: "abc", mes: 11, ano: 2026 }, "extrato_id deve ser um UUID válido"],
      ["sem mes e ano", { extrato_id: UUID_INEXISTENTE }, "mes e ano são obrigatórios e devem ser válidos"],
      ["mes=0", { extrato_id: UUID_INEXISTENTE, mes: 0, ano: 2026 }, "mes e ano são obrigatórios e devem ser válidos"],
      ["mes=13", { extrato_id: UUID_INEXISTENTE, mes: 13, ano: 2026 }, "mes e ano são obrigatórios e devem ser válidos"],
      ["mes=abc", { extrato_id: UUID_INEXISTENTE, mes: "abc", ano: 2026 }, "mes e ano são obrigatórios e devem ser válidos"],
      ["ano=0 (abriria o histórico inteiro, PRB-C-20)", { extrato_id: UUID_INEXISTENTE, mes: 11, ano: 0 }, "mes e ano são obrigatórios e devem ser válidos"],
      ["ano negativo", { extrato_id: UUID_INEXISTENTE, mes: 11, ano: -2026 }, "mes e ano são obrigatórios e devem ser válidos"],
    ];
    for (const [nome, corpo, mensagem] of CASOS) {
      it(`${nome}: 400`, async () => {
        const antes = await fotografar(banco);
        const resposta = await criar(ator(A, PERFIL.CLIENTE), corpo);
        assert.equal(resposta.status, 400);
        assert.deepEqual(resposta.corpo, { erro: mensagem });
        assert.deepEqual(await fotografar(banco), antes);
      });
    }

    it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
      const resposta = await api.requisitar("/conciliacoes", { usuario: A.usuario(PERFIL.EFFICIENCE), metodo: "POST", corpo: { extrato_id: A.extrato.processado, mes: 10, ano: 2026 } });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
    });

    it("mes/ano diferentes dos do extrato (extrato de novembro, pedido para outubro): 400", async () => {
      const cenario = await montarCenarioNovembro(banco, A.cliente.id);
      const antes = await fotografar(banco);
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: cenario.extrato.id, mes: 10, ano: 2026 });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "mes/ano informados não correspondem ao período do extrato" });
      assert.deepEqual(await fotografar(banco), antes);
    });
  });

  describe("conflitos: 409", () => {
    it("extrato ainda aguardando ou com erro: 409 'ainda não foi processado'", async () => {
      for (const extratoId of [A.extrato.aguardando, A.extrato.erro]) {
        const antes = await fotografar(banco);
        const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extratoId, mes: 10, ano: 2026 });
        assert.equal(resposta.status, 409, extratoId);
        assert.deepEqual(resposta.corpo, { erro: "Extrato bancário ainda não foi processado com sucesso" });
        assert.deepEqual(await fotografar(banco), antes);
      }
    });

    it("extrato que já tem sessão em andamento (10/2026) ou concluída (09/2026): 409, sem segunda sessão", async () => {
      for (const [extratoId, mes] of [[A.extrato.processado, 10], [A.extrato.processadoMes9, 9]]) {
        const antes = await fotografar(banco);
        const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extratoId, mes, ano: 2026 });
        assert.equal(resposta.status, 409, extratoId);
        assert.deepEqual(resposta.corpo, { erro: "Este extrato já tem uma conciliação associada (em andamento ou concluída)" });
        assert.deepEqual(await fotografar(banco), antes);
      }
    });
  });

  it("dois extratos criados em paralelo não casam o mesmo lançamento (#691)", async () => {
    const [lancamento] = await criarLancamentos(banco, A.cliente.id, [
      { data: "2026-12-03", valor: 170.13, tipo: "credito" },
    ]);
    const extratos = [];
    for (const nome of ["dezembro-a.ofx", "dezembro-b.ofx"]) {
      extratos.push(await criarExtratoProcessado(banco, A.cliente.id, {
        mes: 12, ano: 2026, nome,
        transacoes: [{ data: "2026-12-03", valor: 170.13, tipo: "credito" }],
      }));
    }
    const quem = ator(A, PERFIL.CLIENTE);
    const respostas = await Promise.all(extratos.map(({ extrato }) => criar(quem, {
      extrato_id: extrato.id, mes: 12, ano: 2026,
    })));
    assert.ok(respostas.some(r => r.status === 201), JSON.stringify(respostas));
    assert.ok(respostas.every(r => r.status === 201 || r.status === 409), JSON.stringify(respostas));
    const pares = await buscarLinhas(banco, "pares_conciliacao", { lancamento_id: lancamento.id });
    assert.equal(pares.filter(p => ["automatico", "provavel"].includes(p.confianca)).length, 1,
      "o mesmo lançamento deve ter um único par ativo");
    const sessoes = (await buscarLinhas(banco, "conciliacoes", { cliente_id: A.cliente.id }))
      .filter(s => extratos.some(({ extrato }) => extrato.id === s.extrato_id));
    assert.deepEqual(sessoes.map(s => s.id).sort(),
      respostas.filter(r => r.status === 201).map(r => r.corpo.conciliacao_id).sort(),
      "uma tentativa recusada não pode deixar conciliação órfã");
    for (const sessao of sessoes) {
      const resposta = await chamar(api, quem, { metodo: "POST", caminho: `/conciliacoes/${sessao.id}/concluir` });
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    }
    const paresConcluidos = await buscarLinhas(banco, "pares_conciliacao", { lancamento_id: lancamento.id });
    assert.equal(paresConcluidos.filter(p => ["automatico", "provavel"].includes(p.confianca)).length, 1);
  });

  describe("regressões conhecidas (skip apenas enquanto a correção estiver pendente)", () => {
    it("duplo clique: dois POST em paralelo para o mesmo extrato dão um 201 e um 409, e uma só sessão (PRB-C-21)",
      conhecido("BUG PRB-C-21 (sem issue; precisa de issue `bug`): checagem é leitura seguida de insert e conciliacoes.extrato_id não tem UNIQUE; os dois pedidos criam sessão"), async () => {
        const cenario = await montarCenarioNovembro(banco, A.cliente.id);
        const quem = ator(A, PERFIL.CLIENTE);
        const respostas = await Promise.all([1, 2].map(() => criar(quem, { extrato_id: cenario.extrato.id, mes: 11, ano: 2026 })));
        assert.deepEqual(respostas.map(r => r.status).sort(), [201, 409]);
        assert.equal((await buscarLinhas(banco, "conciliacoes", { extrato_id: cenario.extrato.id })).length, 1);
      });

    it("lançamento que está numa sessão em andamento de outro extrato não é casado de novo (PRB-C-04, #691)",
      async () => {
        // Lançamento I+300 (10/2026, 10, crédito) está num par automático da sessão aberta do A.
        // Um segundo extrato de outubro com a mesma transação não pode pegá-lo.
        const { extrato } = await criarExtratoProcessado(banco, A.cliente.id, {
          mes: 10, ano: 2026, nome: "outubro-2.ofx", transacoes: [{ data: "2026-10-01", valor: 10, tipo: "credito", descricao: "repete o lançamento já casado" }],
        });
        const resposta = await criar(ator(A, PERFIL.CLIENTE), { extrato_id: extrato.id, mes: 10, ano: 2026 });
        assert.equal(resposta.status, 201);
        const pares = await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: resposta.corpo.conciliacao_id });
        assert.ok(!pares.some(p => p.lancamento_id === A.lancamentoAberto(0)), "o lançamento da sessão aberta foi casado duas vezes");
      });
  });

  describe("auditoria: criado_por (PRB-C-24, #695)", () => {
    it("a sessão guarda quem a criou: criado_por = id do token", async () => {
      const cenario = await montarCenarioNovembro(banco, A.cliente.id);
      const quem = ator(A, PERFIL.FUNCIONARIO);
      const resposta = await criar(quem, {
        extrato_id: cenario.extrato.id, mes: 11, ano: 2026, criado_por: UUID_INEXISTENTE,
      });
      assert.equal(resposta.status, 201);
      assert.equal((await buscarLinha(banco, "conciliacoes", resposta.corpo.conciliacao_id)).criado_por, quem.usuario.id);
    });
  });
});

describe("TEST-9: GET /conciliacoes (lista de sessões)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const listar = (a, consulta = "") => chamar(api, a, { caminho: `/conciliacoes${consulta}` });

  it("lista só as 2 sessões do escritório, com totais e banco/conta do extrato, para os três perfis", async () => {
    for (const quem of atoresDe(A)) {
      const resposta = await listar(quem);
      assert.equal(resposta.status, 200, quem.perfil);
      const sessoes = [...resposta.corpo].sort(porId);
      assert.deepEqual(sessoes.map(s => s.id), [A.sessaoAberta, A.sessaoConcluida].sort(), quem.perfil);
      const aberta = sessoes.find(s => s.id === A.sessaoAberta);
      const concluida = sessoes.find(s => s.id === A.sessaoConcluida);
      assert.deepEqual({ ...aberta, criado_em: undefined }, {
        id: A.sessaoAberta, mes: 10, ano: 2026, status: "em_andamento", total_transacoes: 21, total_conciliadas: 8, total_pendentes: 13,
        criado_em: undefined, extrato: { banco: "Banco sintético #680", conta: "conta-a" },
      }, quem.perfil);
      assert.deepEqual({ ...concluida, criado_em: undefined }, {
        id: A.sessaoConcluida, mes: 9, ano: 2026, status: "concluida", total_transacoes: 2, total_conciliadas: 2, total_pendentes: 0,
        criado_em: undefined, extrato: { banco: "Banco sintético #680", conta: "conta-a" },
      }, quem.perfil);
    }
  });

  it("filtros: mes=10 traz só a aberta, mes=9&ano=2026 só a concluída, ano=2025 nenhuma", async () => {
    const quem = ator(A, PERFIL.CLIENTE);
    assert.deepEqual((await listar(quem, "?mes=10")).corpo.map(s => s.id), [A.sessaoAberta]);
    assert.deepEqual((await listar(quem, "?mes=9&ano=2026")).corpo.map(s => s.id), [A.sessaoConcluida]);
    assert.deepEqual((await listar(quem, "?ano=2025")).corpo, []);
    assert.equal((await listar(quem, "?ano=2026")).corpo.length, 2);
  });

  it("outro escritório: cada lado vê só as suas; cliente_id do B na query não muda o que o A recebe", async () => {
    const antes = await fotografar(banco);
    const doB = [B.sessaoAberta, B.sessaoConcluida];
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
      const resposta = await api.requisitar(`/conciliacoes?cliente_id=${B.cliente.id}&clienteId=${B.cliente.id}`, { usuario: A.usuario(perfil) });
      assert.equal(resposta.status, 200, perfil);
      assert.ok(resposta.corpo.length === 2 && !resposta.corpo.some(s => doB.includes(s.id)), `${perfil} do A recebeu sessão do B`);
    }
    const escolhendoA = await listar(ator(A, PERFIL.EFFICIENCE));
    assert.deepEqual(escolhendoA.corpo.map(s => s.id).sort(), [A.sessaoAberta, A.sessaoConcluida].sort(), "admin_efficience escolhendo o A não recebe as do B");
    const doProprioB = await listar(ator(B, PERFIL.CLIENTE));
    assert.deepEqual(doProprioB.corpo.map(s => s.id).sort(), doB.sort(), "controle: o B vê as suas");
    assert.deepEqual(await fotografar(banco), antes);
  });

  it("escritório sem nenhuma sessão: 200 com lista vazia", async () => {
    await banco.from("pares_conciliacao").delete().eq("conciliacao_id", A.sessaoAberta);
    await banco.from("pares_conciliacao").delete().eq("conciliacao_id", A.sessaoConcluida);
    await banco.from("conciliacoes").delete().eq("cliente_id", A.cliente.id);
    const resposta = await listar(ator(A, PERFIL.CLIENTE));
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, []);
  });

  it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
    const resposta = await api.requisitar("/conciliacoes", { usuario: A.usuario(PERFIL.EFFICIENCE) });
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
  });

  for (const consulta of ["?mes=0", "?mes=13", "?mes=abc", "?ano=0", "?ano=abc"]) {
    it(`${consulta}: 400 em vez de devolver a lista inteira (PRB-C-09, #696)`,
      conhecido("BUG #696 (PRB-C-09): mes/ano inválidos são ignorados e a lista inteira volta com 200; corrigido no PR #715, ainda aberto"), async () => {
        const resposta = await listar(ator(A, PERFIL.CLIENTE), consulta);
        assert.equal(resposta.status, 400, `devolveu ${resposta.status} com ${Array.isArray(resposta.corpo) ? resposta.corpo.length : "?"} sessões`);
      });
  }
});

describe("TEST-9: GET /conciliacoes/:id (detalhe da sessão)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const abrir = (a, id) => chamar(api, a, { caminho: `/conciliacoes/${id}` });

  it("sessão aberta: totais 21/8/13 e 7 pares em cada grupo, com transação e lançamento completos", async () => {
    for (const quem of atoresDe(A)) {
      const resposta = await abrir(quem, A.sessaoAberta);
      assert.equal(resposta.status, 200, quem.perfil);
      const corpo = resposta.corpo;
      assert.deepEqual(
        { id: corpo.id, status: corpo.status, mes: corpo.mes, ano: corpo.ano, extrato: corpo.extrato, total_transacoes: corpo.total_transacoes, total_conciliadas: corpo.total_conciliadas, total_pendentes: corpo.total_pendentes },
        { id: A.sessaoAberta, status: "em_andamento", mes: 10, ano: 2026, extrato: { banco: "Banco sintético #680", conta: "conta-a" }, total_transacoes: 21, total_conciliadas: 8, total_pendentes: 13 },
        quem.perfil,
      );
      assert.deepEqual(Object.keys(corpo.pares).sort(), ["automatico", "provavel", "sem_par"]);
      assert.deepEqual([corpo.pares.automatico.length, corpo.pares.provavel.length, corpo.pares.sem_par.length], [7, 7, 7], quem.perfil);

      // Automático i = 0: transação 10 crédito 2026-10-01 e lançamento do mesmo valor.
      const par0 = corpo.pares.automatico.find(p => p.id === A.parAberto(0));
      assert.deepEqual([par0.transacao.id, par0.transacao.valor, par0.transacao.tipo, par0.transacao.data_lancamento], [A.transacaoAberta(0), 10, "credito", "2026-10-01"]);
      assert.deepEqual([par0.lancamento.id, par0.lancamento.valor, par0.lancamento.tipo, par0.lancamento.conciliado], [A.lancamentoAberto(0), 10, "credito", false]);
      assert.equal("confirmado_em" in par0, false, "automático não expõe confirmação");

      // Provável i = 1 está confirmado (pelo admin_cliente do A, em 2026-10-15T12:00Z); i = 4 está pendente.
      const confirmado = corpo.pares.provavel.find(p => p.id === A.parAberto(1));
      assert.equal(confirmado.confirmado_por, A.usuario(PERFIL.CLIENTE).id);
      assert.equal(paraEpoch(confirmado.confirmado_em), Date.parse("2026-10-15T12:00:00.000Z"));
      const pendente = corpo.pares.provavel.find(p => p.id === A.parAberto(4));
      assert.deepEqual([pendente.confirmado_por, pendente.confirmado_em], [null, null]);
      assert.deepEqual([pendente.transacao.id, pendente.lancamento.id], [A.transacaoAberta(4), A.lancamentoAberto(4)]);

      // Sem par i = 2: só a transação, crédito de R$ 30,00 (na massa #680 o índice par é crédito); não há lançamento.
      const semPar = corpo.pares.sem_par.find(p => p.id === A.parAberto(2));
      assert.deepEqual([semPar.transacao.id, semPar.transacao.valor, semPar.transacao.tipo, semPar.lancamento], [A.transacaoAberta(2), 30, "credito", null]);
    }
  });

  it("sessão concluída: status, totais 2/0 e os 2 pares", async () => {
    const resposta = await abrir(ator(A, PERFIL.FUNCIONARIO), A.sessaoConcluida);
    assert.equal(resposta.status, 200);
    assert.deepEqual([resposta.corpo.status, resposta.corpo.mes, resposta.corpo.total_transacoes, resposta.corpo.total_conciliadas, resposta.corpo.total_pendentes], ["concluida", 9, 2, 2, 0]);
    assert.deepEqual([resposta.corpo.pares.automatico.length, resposta.corpo.pares.provavel.length, resposta.corpo.pares.sem_par.length], [1, 1, 0]);
    assert.equal(resposta.corpo.pares.provavel[0].transacao.conciliado, true);
  });

  it("outro escritório e id inexistente têm o mesmo 404, com a sessão do B presente e o banco intacto", async () => {
    await provarOutroEscritorio404(api, banco, {
      alvo: { tabela: "conciliacoes", id: B.sessaoAberta },
      atores: atoresDe(A),
      montar: id => ({ caminho: `/conciliacoes/${id}` }),
      mensagem: "Conciliação não encontrada",
    });
  });

  it("o B abre a própria sessão sem ver nada do A (controle nos dois sentidos)", async () => {
    const resposta = await abrir(ator(B, PERFIL.CLIENTE), B.sessaoAberta);
    assert.equal(resposta.status, 200);
    const linhas = Object.values(resposta.corpo.pares).flat();
    assert.ok(linhas.every(p => (!p.transacao || p.transacao.cliente_id === B.cliente.id) && (!p.lancamento || p.lancamento.cliente_id === B.cliente.id)));
  });

  it("id que não é UUID: 400 'id deve ser um UUID válido'", async () => {
    const resposta = await abrir(ator(A, PERFIL.CLIENTE), "nao-e-uuid");
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "id deve ser um UUID válido" });
  });

  it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
    const resposta = await api.requisitar(`/conciliacoes/${A.sessaoAberta}`, { usuario: A.usuario(PERFIL.EFFICIENCE) });
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
  });
});
