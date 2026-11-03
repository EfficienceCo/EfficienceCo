// TEST-9 (#686): concluir a conciliação (decisão irreversível do contador), relatório em PDF e o
// fluxo completo do upload ao PDF, com HTTP, usuário e banco reais.
//
// Origem dos números (massa #680, sessão aberta do A): 21 pares; automáticos em 0,3,...,18 (7) e
// prováveis em 1,4,...,19 (7, só o 1 confirmado); sem par em 2,5,...,20 (7). Depois de decidir todos
// os prováveis, casados = 7 + 7 = 14 (transação e lançamento de cada um viram conciliado); os 7 sem
// par ficam como estão. A concluída (09/2026) já tem 2 transações e 2 lançamentos conciliados, então
// o escritório A passa a ter 16 de cada com conciliado=true.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, atoresDe, buscarLinha, buscarLinhas, provarOutroEscritorio404,
  montarOfx, OFX_NOVEMBRO, formularioOfx, criarExtratoProcessado, PERFIL, paraEpoch,
} from "../helpers/conciliacao-http.js";

const AUTOMATICOS = [0, 3, 6, 9, 12, 15, 18];
const PROVAVEIS = [1, 4, 7, 10, 13, 16, 19];
const SEM_PAR = [2, 5, 8, 11, 14, 17, 20];

describe("TEST-9: POST /conciliacoes/:id/concluir", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const concluir = (a, id) => chamar(api, a, { metodo: "POST", caminho: `/conciliacoes/${id}/concluir` });
  // Decide os prováveis pendentes direto no banco (o HTTP de confirmar tem bateria própria em pares.test.js).
  const confirmarPendentesNoBanco = async () => {
    const { error } = await banco.from("pares_conciliacao").update({ confirmado_em: "2026-10-16T12:00:00Z", confirmado_por: A.usuario(PERFIL.CLIENTE).id })
      .eq("conciliacao_id", A.sessaoAberta).eq("confianca", "provavel").is("confirmado_em", null);
    assert.equal(error, null, error?.message);
  };

  for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
    it(`${perfil}: conclui marcando conciliado só os 14 casados; os 7 sem par e o outro escritório ficam como estavam`, async () => {
      await confirmarPendentesNoBanco();
      const quem = ator(A, perfil);
      const antesDoB = await fotografar(banco, B.cliente.id);

      const resposta = await concluir(quem, A.sessaoAberta);

      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.deepEqual(resposta.corpo, { conciliacao_id: A.sessaoAberta, status: "concluida", total_conciliadas: 14 });
      const sessao = await buscarLinha(banco, "conciliacoes", A.sessaoAberta);
      assert.equal(sessao.status, "concluida");
      assert.ok(Math.abs(Date.now() - paraEpoch(sessao.concluida_em)) < 60_000, "concluida_em é agora");

      const transacoes = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: A.extrato.processado });
      const conciliadas = new Set(transacoes.filter(t => t.conciliado).map(t => t.id));
      assert.deepEqual([...conciliadas].sort(), [...AUTOMATICOS, ...PROVAVEIS].map(i => A.transacaoAberta(i)).sort(), "só as 14 casadas");
      assert.ok(SEM_PAR.every(i => !conciliadas.has(A.transacaoAberta(i))), "transações sem par não são conciliadas");
      const lancamentos = await buscarLinhas(banco, "lancamentos_contabeis", { cliente_id: A.cliente.id, conciliado: true });
      assert.equal(lancamentos.length, 16, "14 desta sessão + 2 da concluída de setembro");
      assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
    });
  }

  it("com prováveis pendentes de decisão (6 na massa): 409 e nada é marcado", async () => {
    for (const quem of atoresDe(A)) {
      const antes = await fotografar(banco);
      const resposta = await concluir(quem, A.sessaoAberta);
      assert.equal(resposta.status, 409, quem.perfil);
      assert.deepEqual(resposta.corpo, { erro: "Há pares prováveis pendentes de decisão" }, quem.perfil);
      assert.deepEqual(await fotografar(banco), antes, quem.perfil);
    }
  });

  it("sessão já concluída: 409 e depois disso nada se edita (transações e lançamentos seguem conciliados)", async () => {
    for (const quem of atoresDe(A)) {
      const antes = await fotografar(banco);
      const resposta = await concluir(quem, A.sessaoConcluida);
      assert.equal(resposta.status, 409, quem.perfil);
      assert.deepEqual(resposta.corpo, { erro: "Conciliação já foi concluída" }, quem.perfil);
      assert.deepEqual(await fotografar(banco), antes, quem.perfil);
    }
  });

  it("concluir duas vezes seguidas: 200 e depois 409, sem remarcar nada", async () => {
    await confirmarPendentesNoBanco();
    const quem = ator(A, PERFIL.CLIENTE);
    assert.equal((await concluir(quem, A.sessaoAberta)).status, 200);
    const depois = await fotografar(banco);
    assert.equal((await concluir(quem, A.sessaoAberta)).status, 409);
    assert.deepEqual(await fotografar(banco), depois);
  });

  it("sessão do outro escritório: mesmo 404 da inexistente, com a sessão do B presente e o banco intacto", async () => {
    await provarOutroEscritorio404(api, banco, {
      alvo: { tabela: "conciliacoes", id: B.sessaoAberta },
      atores: atoresDe(A),
      montar: id => ({ metodo: "POST", caminho: `/conciliacoes/${id}/concluir` }),
      mensagem: "Conciliação não encontrada",
    });
  });

  it("id que não é UUID: 400; admin_efficience sem cliente_id: 400", async () => {
    const sessao = await concluir(ator(A, PERFIL.CLIENTE), "abc");
    assert.deepEqual([sessao.status, sessao.corpo], [400, { erro: "id deve ser um UUID válido" }]);
    const semCliente = await api.requisitar(`/conciliacoes/${A.sessaoAberta}/concluir`, { usuario: A.usuario(PERFIL.EFFICIENCE), metodo: "POST" });
    assert.deepEqual([semCliente.status, semCliente.corpo], [400, { erro: "cliente_id é obrigatório" }]);
  });
});

describe("TEST-9: GET /conciliacoes/:id/relatorio (PDF)", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const baixar = (a, id) => chamar(api, a, { caminho: `/conciliacoes/${id}/relatorio` });

  it("sessão concluída: 200, PDF de verdade e nome do arquivo com ano, mês e nome do cliente, para os três perfis", async () => {
    for (const quem of atoresDe(A)) {
      const resposta = await baixar(quem, A.sessaoConcluida);
      assert.equal(resposta.status, 200, quem.perfil);
      assert.match(resposta.headers.get("content-type"), /^application\/pdf/);
      // Regra de sanitizarNomeArquivo aplicada à mão em "Contexto sintético A #680": sem acento,
      // minúsculo, espaço vira _ e "#" some -> contexto_sintetico_a_680. Sessão de 09/2026.
      assert.equal(resposta.headers.get("content-disposition"), 'attachment; filename="conciliacao-2026-09-contexto_sintetico_a_680.pdf"', quem.perfil);
      assert.ok(Buffer.isBuffer(resposta.corpo) && resposta.corpo.subarray(0, 5).toString("latin1") === "%PDF-", `${quem.perfil}: não é um PDF`);
      assert.ok(resposta.corpo.length > 1000, `${quem.perfil}: PDF pequeno demais (${resposta.corpo.length} bytes)`);
    }
  });

  it("o B baixa o próprio relatório, com o nome do cliente B no arquivo", async () => {
    const resposta = await baixar(ator(B, PERFIL.CLIENTE), B.sessaoConcluida);
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("content-disposition"), 'attachment; filename="conciliacao-2026-09-contexto_sintetico_b_680.pdf"');
  });

  it("sessão em andamento: 409 'ainda não foi concluída'", async () => {
    const antes = await fotografar(banco);
    const resposta = await baixar(ator(A, PERFIL.CLIENTE), A.sessaoAberta);
    assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Conciliação ainda não foi concluída" }]);
    assert.deepEqual(await fotografar(banco), antes);
  });

  it("sessão concluída do outro escritório: mesmo 404 da inexistente, com a sessão do B presente e o banco intacto", async () => {
    await provarOutroEscritorio404(api, banco, {
      alvo: { tabela: "conciliacoes", id: B.sessaoConcluida },
      atores: atoresDe(A),
      montar: id => ({ caminho: `/conciliacoes/${id}/relatorio` }),
      mensagem: "Conciliação não encontrada",
    });
  });

  it("id que não é UUID: 400; admin_efficience sem cliente_id: 400", async () => {
    const sessao = await baixar(ator(A, PERFIL.CLIENTE), "abc");
    assert.deepEqual([sessao.status, sessao.corpo], [400, { erro: "id deve ser um UUID válido" }]);
    const semCliente = await api.requisitar(`/conciliacoes/${A.sessaoConcluida}/relatorio`, { usuario: A.usuario(PERFIL.EFFICIENCE) });
    assert.deepEqual([semCliente.status, semCliente.corpo], [400, { erro: "cliente_id é obrigatório" }]);
  });
});

// Jornada pela API, do OFX ao PDF, sem tocar no banco a não ser para conferir.
describe("TEST-9: fluxo completo pela API (upload, lançamentos, sessão, decisão, concluir, relatório)", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  // Extrato (OFX_NOVEMBRO): T1 débito 150,00 em 05/11 e T2 crédito 1.500,00 em 10/11.
  // Lançamentos: L1 débito 150,00 em 05/11 (automático com T1), L2 crédito 1.500,00 em 12/11
  // (provável com T2, 2 dias) e L3 crédito 77,00 em 20/11 (sem transação).
  async function prepararSessao(quem) {
    const upload = await chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes/extrato", formulario: formularioOfx(montarOfx(OFX_NOVEMBRO)) });
    assert.equal(upload.status, 201, JSON.stringify(upload.corpo));
    const lancamentos = [];
    for (const l of [
      { data_lancamento: "2026-11-05", valor: 150, tipo: "debito", descricao: "L1 boleto" },
      { data_lancamento: "2026-11-12", valor: 1500, tipo: "credito", descricao: "L2 deposito" },
      { data_lancamento: "2026-11-20", valor: 77, tipo: "credito", descricao: "L3 sem transacao" },
    ]) {
      const criado = await api.requisitar("/lancamentos-contabeis", { usuario: A.usuario(PERFIL.CLIENTE), metodo: "POST", corpo: { cliente_id: A.cliente.id, ...l } });
      assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
      lancamentos.push(criado.corpo);
    }
    const sessao = await chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: upload.corpo.extrato_id, mes: 11, ano: 2026 } });
    assert.equal(sessao.status, 201, JSON.stringify(sessao.corpo));
    // 2 transações: 1 automático, 1 provável, 1 sem par (L3) -> conciliadas 1, pendentes 1.
    assert.deepEqual({ ...sessao.corpo, conciliacao_id: undefined }, { conciliacao_id: undefined, total_transacoes: 2, automaticos: 1, provaveis: 1, sem_par: 1 });
    const detalhe = await chamar(api, quem, { caminho: `/conciliacoes/${sessao.corpo.conciliacao_id}` });
    return { extratoId: upload.corpo.extrato_id, sessaoId: sessao.corpo.conciliacao_id, L: lancamentos, detalhe: detalhe.corpo };
  }

  it("confirmando o provável: concluir marca os 2 casados e deixa o lançamento sem par; depois nada edita nem apaga", async () => {
    const quem = ator(A, PERFIL.CLIENTE);
    const { extratoId, sessaoId, L, detalhe } = await prepararSessao(quem);
    const antesDoB = await fotografar(banco, B.cliente.id);
    const provavel = detalhe.pares.provavel[0];
    assert.deepEqual([detalhe.total_conciliadas, detalhe.total_pendentes], [1, 1]);

    assert.equal((await chamar(api, quem, { metodo: "PATCH", caminho: `/conciliacoes/${sessaoId}/pares/${provavel.id}/confirmar` })).status, 200);
    const concluir = await chamar(api, quem, { metodo: "POST", caminho: `/conciliacoes/${sessaoId}/concluir` });
    assert.deepEqual(concluir.corpo, { conciliacao_id: sessaoId, status: "concluida", total_conciliadas: 2 });

    const transacoes = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: extratoId });
    assert.deepEqual(Object.fromEntries(transacoes.map(t => [t.id_banco, t.conciliado])), { "NOV-1": true, "NOV-2": true });
    const flags = Object.fromEntries((await buscarLinhas(banco, "lancamentos_contabeis", { cliente_id: A.cliente.id })).filter(l => l.descricao.match(/^L\d/)).map(l => [l.descricao.slice(0, 2), l.conciliado]));
    assert.deepEqual(flags, { L1: true, L2: true, L3: false }, "só L1 e L2 foram casados");

    // Depois de concluir: lançamentos conciliados não se alteram nem se apagam.
    for (const lancamento of [L[0], L[1]]) {
      const alterar = await api.requisitar(`/lancamentos-contabeis/${lancamento.id}`, { usuario: quem.usuario, metodo: "PATCH", corpo: { descricao: "tentativa" } });
      assert.deepEqual([alterar.status, alterar.corpo], [409, { erro: "Lançamento já conciliado não pode ser alterado" }]);
      const apagar = await api.requisitar(`/lancamentos-contabeis/${lancamento.id}`, { usuario: quem.usuario, metodo: "DELETE" });
      assert.deepEqual([apagar.status, apagar.corpo], [409, { erro: "Lançamento já conciliado não pode ser removido" }]);
    }
    // L3 não foi conciliado, mas aparece num par da sessão: apagar quebraria o histórico (FK) e dá 409.
    const apagarL3 = await api.requisitar(`/lancamentos-contabeis/${L[2].id}`, { usuario: quem.usuario, metodo: "DELETE" });
    assert.deepEqual([apagarL3.status, apagarL3.corpo], [409, { erro: "Lançamento vinculado a uma conciliação não pode ser removido" }]);
    assert.equal((await buscarLinha(banco, "lancamentos_contabeis", L[0].id)).descricao, "L1 boleto");

    // Nova sessão para o mesmo extrato e segundo concluir: 409. O extrato some do painel de upload.
    const outra = await chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: extratoId, mes: 11, ano: 2026 } });
    assert.equal(outra.status, 409);
    assert.equal((await chamar(api, quem, { metodo: "POST", caminho: `/conciliacoes/${sessaoId}/concluir` })).status, 409);
    const atual = await chamar(api, quem, { caminho: "/conciliacoes/extrato?mes=11&ano=2026" });
    assert.deepEqual(atual.corpo, { extrato: null });

    const pdf = await chamar(api, quem, { caminho: `/conciliacoes/${sessaoId}/relatorio` });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-disposition"), 'attachment; filename="conciliacao-2026-11-contexto_sintetico_a_680.pdf"');
    assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
  });

  it("sessão sem nenhum par (extrato vazio, mês sem lançamentos): abre com grupos vazios, conclui sem marcar nada e gera o PDF", async () => {
    const quem = ator(A, PERFIL.CLIENTE);
    const { extrato } = await criarExtratoProcessado(banco, A.cliente.id, { mes: 12, ano: 2026 });
    const sessao = await chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: extrato.id, mes: 12, ano: 2026 } });
    assert.equal(sessao.status, 201);
    const id = sessao.corpo.conciliacao_id;

    const detalhe = await chamar(api, quem, { caminho: `/conciliacoes/${id}` });
    assert.equal(detalhe.status, 200);
    assert.deepEqual(detalhe.corpo.pares, { automatico: [], provavel: [], sem_par: [] });
    assert.deepEqual([detalhe.corpo.total_transacoes, detalhe.corpo.total_conciliadas, detalhe.corpo.total_pendentes], [0, 0, 0]);

    const antes = await fotografar(banco);
    const concluir = await chamar(api, quem, { metodo: "POST", caminho: `/conciliacoes/${id}/concluir` });
    assert.deepEqual([concluir.status, concluir.corpo], [200, { conciliacao_id: id, status: "concluida", total_conciliadas: 0 }]);
    const depois = await fotografar(banco);
    assert.deepEqual(depois.transacoes_extrato, antes.transacoes_extrato);
    assert.deepEqual(depois.lancamentos_contabeis, antes.lancamentos_contabeis);

    const pdf = await chamar(api, quem, { caminho: `/conciliacoes/${id}/relatorio` });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.corpo.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("rejeitando o provável: concluir marca só o automático; a transação e o lançamento rejeitados continuam livres", async () => {
    const quem = ator(A, PERFIL.FUNCIONARIO);
    const { extratoId, sessaoId, detalhe } = await prepararSessao(quem);
    const provavel = detalhe.pares.provavel[0];

    const rejeitado = await chamar(api, quem, { metodo: "PATCH", caminho: `/conciliacoes/${sessaoId}/pares/${provavel.id}/rejeitar` });
    assert.equal(rejeitado.status, 200);
    const concluir = await chamar(api, quem, { metodo: "POST", caminho: `/conciliacoes/${sessaoId}/concluir` });
    assert.deepEqual(concluir.corpo, { conciliacao_id: sessaoId, status: "concluida", total_conciliadas: 1 });

    const transacoes = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: extratoId });
    const porDescricao = Object.fromEntries(transacoes.map(t => [t.id_banco, t.conciliado]));
    assert.deepEqual(porDescricao, { "NOV-1": true, "NOV-2": false }, "só o débito de 150,00 (automático) foi casado");
    const lancamentos = (await buscarLinhas(banco, "lancamentos_contabeis", { cliente_id: A.cliente.id })).filter(l => /^L\d/.test(l.descricao));
    assert.deepEqual(Object.fromEntries(lancamentos.map(l => [l.descricao.slice(0, 2), l.conciliado])), { L1: true, L2: false, L3: false });
  });
});
