// TEST-9 (#686): rede da SEG-1 (#666) por baixo do controller. Os controllers da Conciliação já
// filtram por escritório, então, nos testes HTTP, tirar só a policy do RLS não muda nenhuma
// resposta (admin_cliente e funcionario seguem recebendo 404 pelo filtro do controller). Este
// arquivo fecha essa brecha: fala com o banco pelo MESMO client que as rotas usam
// (criarDbDoUsuario, token do usuário + chave anon) e confere o que o RLS devolve e aceita,
// sem passar por nenhum controller.
//
// Origem dos números (massa #680, por escritório): 4 extratos, 23 transações (21 + 2), 16
// lançamentos (14 + 2), 2 conciliações e 23 pares (21 + 2).
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarDbDoUsuario } from "../../src/config/db-usuario.js";
import { iniciarBateria, buscarLinha, PERFIL } from "../helpers/conciliacao-http.js";

const ESPERADO_POR_ESCRITORIO = {
  extratos_bancarios: 4, transacoes_extrato: 23, lancamentos_contabeis: 16, conciliacoes: 2, pares_conciliacao: 23,
};

describe("TEST-9: RLS da área da Conciliação, direto no banco com o token do usuário", { timeout: 300_000 }, () => {
  let bateria; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const comoUsuario = (escritorio, perfil) => criarDbDoUsuario(escritorio.usuario(perfil));

  for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
    it(`${perfil} do A lê só as linhas do A em todas as tabelas (o B tem o mesmo tanto e fica invisível)`, async () => {
      const db = comoUsuario(A, perfil);
      for (const [tabela, quantidade] of Object.entries(ESPERADO_POR_ESCRITORIO)) {
        const { data: tudo } = await banco.from(tabela).select("*");
        assert.equal(tudo.length, quantidade * 2, `${tabela}: a massa tem os dois escritórios`);
        const { data, error } = await db.from(tabela).select("*");
        assert.equal(error, null, `${tabela}: ${error?.message}`);
        assert.equal(data.length, quantidade, `${tabela}: o ${perfil} do A deveria ver só as do A`);
        if (tabela === "pares_conciliacao") {
          assert.ok(data.every(par => [A.sessaoAberta, A.sessaoConcluida].includes(par.conciliacao_id)), tabela);
        } else {
          assert.ok(data.every(linha => linha.cliente_id === A.cliente.id), `${tabela}: linha de outro escritório visível`);
        }
      }
    });

    it(`${perfil} do A não altera, não apaga nem insere no escritório B`, async () => {
      const db = comoUsuario(A, perfil);
      const lancamentoB = await buscarLinha(banco, "lancamentos_contabeis", B.lancamentoAberto(0));
      const parB = await buscarLinha(banco, "pares_conciliacao", B.parAberto(4));
      const sessaoB = await buscarLinha(banco, "conciliacoes", B.sessaoAberta);

      const alterar = await db.from("lancamentos_contabeis").update({ descricao: "invasão" }).eq("id", B.lancamentoAberto(0)).select();
      assert.deepEqual([alterar.error, alterar.data], [null, []], "o UPDATE no B não casa nenhuma linha");
      const confirmar = await db.from("pares_conciliacao").update({ confirmado_em: new Date().toISOString() }).eq("id", B.parAberto(4)).select();
      assert.deepEqual([confirmar.error, confirmar.data], [null, []]);
      const apagar = await db.from("conciliacoes").delete().eq("id", B.sessaoAberta).select();
      assert.deepEqual([apagar.error, apagar.data], [null, []]);
      const inserir = await db.from("lancamentos_contabeis").insert({
        cliente_id: B.cliente.id, data_lancamento: "2026-11-05", valor: 1, tipo: "credito", descricao: "invasão",
      });
      assert.equal(inserir.error?.code, "42501", "INSERT com cliente_id do B é recusado pelo WITH CHECK");

      assert.deepEqual(await buscarLinha(banco, "lancamentos_contabeis", B.lancamentoAberto(0)), lancamentoB);
      assert.deepEqual(await buscarLinha(banco, "pares_conciliacao", B.parAberto(4)), parB);
      assert.deepEqual(await buscarLinha(banco, "conciliacoes", B.sessaoAberta), sessaoB);
    });
  }

  it("o dono do escritório escreve no próprio escritório (o RLS não pode barrar o caminho feliz)", async () => {
    const db = comoUsuario(A, PERFIL.CLIENTE);
    const { data, error } = await db.from("lancamentos_contabeis").insert({
      cliente_id: A.cliente.id, data_lancamento: "2026-11-05", valor: 1, tipo: "credito", descricao: "dentro do A",
    }).select();
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
  });

  it("admin_efficience enxerga os dois escritórios (equipe); a separação dele é do controller, por cliente_id", async () => {
    const db = comoUsuario(A, PERFIL.EFFICIENCE);
    for (const [tabela, quantidade] of Object.entries(ESPERADO_POR_ESCRITORIO)) {
      const { data, error } = await db.from(tabela).select("*");
      assert.equal(error, null, error?.message);
      assert.equal(data.length, quantidade * 2, tabela);
    }
  });

  it("perfil que não existe no produto não escreve nas tabelas da área, nem no próprio escritório", async () => {
    const db = criarDbDoUsuario({ ...A.usuario(PERFIL.CLIENTE), perfil: "visitante" });
    const inserir = await db.from("lancamentos_contabeis").insert({
      cliente_id: A.cliente.id, data_lancamento: "2026-11-05", valor: 1, tipo: "credito", descricao: "visitante",
    });
    assert.equal(inserir.error?.code, "42501");
    const alterar = await db.from("lancamentos_contabeis").update({ descricao: "visitante" }).eq("id", A.lancamentoAberto(0)).select();
    assert.deepEqual([alterar.error, alterar.data], [null, []]);
  });
});
