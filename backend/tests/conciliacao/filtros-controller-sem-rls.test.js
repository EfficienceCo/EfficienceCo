// TEST-9 (#686): o isolamento entre escritórios na camada do CONTROLLER, sem a RLS por baixo.
//
// Por que existe: desde a SEG-1 (#666) o banco devolve 404 sozinho para linha de outro escritório
// quando a requisição fala com o token do usuário. Então, nos outros arquivos desta pasta, apagar
// uma checagem de escritório do controller (`cliente_id !== clienteId`, `.eq("cliente_id", ...)`)
// não deixa nenhum teste de admin_cliente/funcionario vermelho: a RLS cobre o buraco. Aqui o
// controller é isolado: o client do banco da requisição passa a ser o de serviço (que ignora a RLS)
// e os cenários de "outro escritório" rodam de novo, com o banco real e a consulta indo ao banco
// de verdade. Se o filtro do controller sumir, o dado do B aparece e o teste reprova.
//
// Como: `contextoDb.getStore()` é o que database.js consulta para saber qual client usar; trocá-lo
// por `undefined` (mock.method, restaurado no after) faz `supabase` cair no `servicoDb`. Nada de
// banco falso: continua a mesma instância Postgres descartável, só muda quem assina a consulta.
//
// Cobre os filtros de escritório de todas as rotas com id ou lista; admin_efficience fica de fora
// porque ele escolhe o escritório por cliente_id (os demais arquivos já o exercitam sem RLS).
import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, buscarLinha, buscarLinhas, provarOutroEscritorio404,
  criarExtratoProcessado, criarLancamentos, montarCenarioNovembro, UUID_INEXISTENTE, PERFIL,
} from "../helpers/conciliacao-http.js";
import { contextoDb, criarDbDoUsuario } from "../../src/config/db-usuario.js";
import supabase from "../../src/config/database.js";

const ESCRITORIO = [PERFIL.CLIENTE, PERFIL.FUNCIONARIO];

describe("TEST-9: filtros de escritório do controller, com a RLS neutralizada (banco real)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => {
    bateria = await iniciarBateria();
    api = bateria.api;
    mock.method(contextoDb, "getStore", () => undefined);
  });
  after(async () => {
    mock.restoreAll();
    await bateria.encerrar();
  });
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const atoresA = () => ESCRITORIO.map(perfil => ator(A, perfil));

  it("controle: com a troca do client, a consulta de um usuário do A enxerga também o B (a RLS saiu de cena)", async () => {
    const usuario = A.usuario(PERFIL.CLIENTE);
    const comRls = await criarDbDoUsuario(usuario).from("conciliacoes").select("cliente_id");
    assert.equal(comRls.error, null);
    assert.deepEqual([...new Set(comRls.data.map(c => c.cliente_id))], [A.cliente.id], "controle: o client do usuário só vê o A");
    const semRls = await contextoDb.run(criarDbDoUsuario(usuario), () => supabase.from("conciliacoes").select("cliente_id"));
    assert.equal(semRls.error, null);
    assert.deepEqual([...new Set(semRls.data.map(c => c.cliente_id))].sort(), [A.cliente.id, B.cliente.id].sort());
  });

  describe("id de outro escritório: mesmo 404 do inexistente, dado do B presente, banco intacto", () => {
    it("GET /conciliacoes/extrato/:id/transacoes", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "extratos_bancarios", id: B.extrato.processado },
        atores: atoresA(),
        montar: id => ({ caminho: `/conciliacoes/extrato/${id}/transacoes` }),
        mensagem: "Extrato bancário não encontrado",
      });
    });

    it("POST /conciliacoes (extrato do B)", async () => {
      const doB = await montarCenarioNovembro(banco, B.cliente.id, { nome: "nov-b.ofx" });
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "extratos_bancarios", id: doB.extrato.id },
        atores: atoresA(),
        montar: id => ({ metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: id, mes: 11, ano: 2026 } }),
        mensagem: "Extrato bancário não encontrado",
      });
      assert.deepEqual(await buscarLinhas(banco, "conciliacoes", { extrato_id: doB.extrato.id }), [], "o B continua sem sessão nova");
    });

    // Sessão do B nas cinco rotas que passam por buscarConciliacaoDoCliente.
    const POR_SESSAO = [
      ["GET /conciliacoes/:id", () => B.sessaoAberta, id => ({ caminho: `/conciliacoes/${id}` })],
      ["PATCH /conciliacoes/:id/pares/:pareId/confirmar", () => B.sessaoAberta, id => ({ metodo: "PATCH", caminho: `/conciliacoes/${id}/pares/${B.parAberto(4)}/confirmar` })],
      ["PATCH /conciliacoes/:id/pares/:pareId/rejeitar", () => B.sessaoAberta, id => ({ metodo: "PATCH", caminho: `/conciliacoes/${id}/pares/${B.parAberto(4)}/rejeitar` })],
      ["POST /conciliacoes/:id/concluir", () => B.sessaoAberta, id => ({ metodo: "POST", caminho: `/conciliacoes/${id}/concluir` })],
      ["GET /conciliacoes/:id/relatorio", () => B.sessaoConcluida, id => ({ caminho: `/conciliacoes/${id}/relatorio` })],
    ];
    for (const [nome, sessao, montar] of POR_SESSAO) {
      it(nome, async () => {
        await provarOutroEscritorio404(api, banco, {
          alvo: { tabela: "conciliacoes", id: sessao() },
          atores: atoresA(),
          montar,
          mensagem: "Conciliação não encontrada",
        });
      });
    }

    it("PATCH /lancamentos-contabeis/:id", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "lancamentos_contabeis", id: B.lancamentoAberto(0) },
        atores: atoresA(),
        montar: id => ({ metodo: "PATCH", caminho: `/lancamentos-contabeis/${id}`, corpo: { descricao: "invasão" } }),
        mensagem: "Lançamento contábil não encontrado",
      });
    });

    it("DELETE /lancamentos-contabeis/:id", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "lancamentos_contabeis", id: B.lancamentoAberto(0) },
        atores: atoresA(),
        montar: id => ({ metodo: "DELETE", caminho: `/lancamentos-contabeis/${id}` }),
        mensagem: "Lançamento contábil não encontrado",
      });
    });
  });

  describe("par do B dentro de uma sessão do A: 404 igual ao par inexistente", () => {
    for (const acao of ["confirmar", "rejeitar"]) {
      it(acao, async () => {
        for (const quem of atoresA()) {
          const antes = await fotografar(banco);
          const parDoB = await buscarLinha(banco, "pares_conciliacao", B.parAberto(4));
          const doB = await chamar(api, quem, { metodo: "PATCH", caminho: `/conciliacoes/${A.sessaoAberta}/pares/${B.parAberto(4)}/${acao}` });
          const inexistente = await chamar(api, quem, { metodo: "PATCH", caminho: `/conciliacoes/${A.sessaoAberta}/pares/${UUID_INEXISTENTE}/${acao}` });
          assert.deepEqual([doB.status, doB.corpo], [404, { erro: "Par de conciliação não encontrado" }], quem.perfil);
          assert.deepEqual([inexistente.status, inexistente.corpo], [doB.status, doB.corpo], quem.perfil);
          assert.deepEqual(await fotografar(banco), antes, quem.perfil);
          assert.deepEqual(await buscarLinha(banco, "pares_conciliacao", B.parAberto(4)), parDoB, quem.perfil);
        }
      });
    }
  });

  describe("listas: o A recebe só o que é do A, mesmo mandando o cliente do B na query", () => {
    it("GET /conciliacoes", async () => {
      const antes = await fotografar(banco);
      for (const quem of atoresA()) {
        const resposta = await api.requisitar(`/conciliacoes?cliente_id=${B.cliente.id}&clienteId=${B.cliente.id}`, { usuario: quem.usuario });
        assert.equal(resposta.status, 200, quem.perfil);
        assert.deepEqual(resposta.corpo.map(s => s.id).sort(), [A.sessaoAberta, A.sessaoConcluida].sort(), quem.perfil);
      }
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("GET /conciliacoes/extrato (extrato atual do período)", async () => {
      // O B tem extrato processado em novembro/2026; o A não tem nenhum nesse mês.
      const { extrato: doB } = await criarExtratoProcessado(banco, B.cliente.id, {
        mes: 11, ano: 2026, nome: "do-b.ofx", transacoes: [{ data: "2026-11-03", valor: 10, tipo: "credito" }],
      });
      for (const quem of atoresA()) {
        const resposta = await chamar(api, quem, { caminho: "/conciliacoes/extrato?mes=11&ano=2026" });
        assert.deepEqual([resposta.status, resposta.corpo], [200, { extrato: null }], `${quem.perfil} não pode ver o extrato ${doB.id} do B`);
      }
    });

    it("GET /lancamentos-contabeis", async () => {
      const doB = new Set((await buscarLinhas(banco, "lancamentos_contabeis", { cliente_id: B.cliente.id })).map(l => l.id));
      assert.equal(doB.size, 16, "dado do B presente");
      for (const quem of atoresA()) {
        const resposta = await api.requisitar(`/lancamentos-contabeis?clienteId=${B.cliente.id}`, { usuario: quem.usuario });
        assert.equal(resposta.status, 200, quem.perfil);
        assert.equal(resposta.corpo.length, 16, quem.perfil);
        assert.ok(!resposta.corpo.some(l => doB.has(l.id)), `${quem.perfil} do A recebeu lançamento do B`);
      }
    });
  });

  describe("escrita e matching: nada do B entra no A, nada do A é gravado no B", () => {
    it("POST /lancamentos-contabeis com cliente_id do B: 404 'Cliente não encontrado' e o B não ganha lançamento", async () => {
      for (const quem of atoresA()) {
        const antes = await fotografar(banco);
        const resposta = await api.requisitar("/lancamentos-contabeis", {
          usuario: quem.usuario, metodo: "POST",
          corpo: { cliente_id: B.cliente.id, data_lancamento: "2026-11-05", valor: 10, tipo: "credito", descricao: "invasão" },
        });
        assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Cliente não encontrado" }], quem.perfil);
        assert.deepEqual(await fotografar(banco), antes, quem.perfil);
      }
    });

    it("POST /conciliacoes: lançamento do B que casaria com a transação do A não entra no matching", async () => {
      const doA = await montarCenarioNovembro(banco, A.cliente.id);
      const [doB] = await criarLancamentos(banco, B.cliente.id, [{ data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "L-B casaria com T1" }]);
      const antesDoB = await fotografar(banco, B.cliente.id);
      const resposta = await chamar(api, ator(A, PERFIL.CLIENTE), { metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: doA.extrato.id, mes: 11, ano: 2026 } });
      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      assert.deepEqual({ ...resposta.corpo, conciliacao_id: undefined }, { conciliacao_id: undefined, total_transacoes: 4, automaticos: 1, provaveis: 1, sem_par: 4, lancamentos_em_outra_conciliacao: 0 });
      const pares = await buscarLinhas(banco, "pares_conciliacao", { conciliacao_id: resposta.corpo.conciliacao_id });
      assert.ok(!pares.some(p => p.lancamento_id === doB.id), "lançamento do B no matching do A");
      assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
    });
  });
});
