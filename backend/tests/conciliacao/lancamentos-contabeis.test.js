// TEST-9 (#686): lançamentos contábeis (criar, listar, alterar, apagar) com HTTP, usuário e banco reais.
//
// Origem dos números (massa #680, escritório A): 16 lançamentos. 14 na sessão aberta (10/2026, índices
// 0,1,3,4,...,19: data 2026-10-(i+1), valor (i+1)*10, crédito se i é par, conciliado=false) e 2 na
// concluída (09/2026: 2026-09-01 e 2026-09-02, valores 10 e 20, conciliado=true). O mais novo é o i=19
// (2026-10-20, 200, débito). Todos aparecem em algum par, então apagar qualquer um esbarra na FK.
//
// Admin_efficience é equipe e o RLS dele enxerga tudo: nestas quatro rotas ele NÃO é preso a um
// cliente no PATCH/DELETE (o controller só escopa admin_cliente e funcionario). Por isso o "outro
// escritório: 404" de PATCH/DELETE vale para esses dois perfis; no POST e no GET o admin_efficience
// escolhe o escritório e é conferido com o mesmo rigor.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, atoresDe, buscarLinha, buscarLinhas, criarLancamentos,
  provarOutroEscritorio404, conhecido, UUID_INEXISTENTE, PERFIL,
} from "../helpers/conciliacao-http.js";

const ESCRITORIO = [PERFIL.CLIENTE, PERFIL.FUNCIONARIO];

describe("TEST-9: /lancamentos-contabeis", { timeout: 600_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const VALIDO = { data_lancamento: "2026-11-05", valor: 100, tipo: "credito", descricao: "Venda de balcão" };
  const criar = (quem, corpo) => api.requisitar("/lancamentos-contabeis", { usuario: quem.usuario, metodo: "POST", corpo: { cliente_id: quem.escritorio.cliente.id, ...corpo } });
  const listar = (quem, consulta = "") => chamar(api, quem, { caminho: `/lancamentos-contabeis${consulta}`, clienteIdCamelCase: true });
  const alterar = (quem, id, corpo) => api.requisitar(`/lancamentos-contabeis/${id}`, { usuario: quem.usuario, metodo: "PATCH", corpo });
  const apagar = (quem, id) => api.requisitar(`/lancamentos-contabeis/${id}`, { usuario: quem.usuario, metodo: "DELETE" });

  describe("POST", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
      it(`${perfil}: 201, valor string vira número, descrição sem espaços nas pontas, e o banco confere`, async () => {
        const quem = ator(A, perfil);
        const antesDoB = await fotografar(banco, B.cliente.id);
        const antesDoA = await fotografar(banco, A.cliente.id);

        const resposta = await criar(quem, { data_lancamento: "2026-11-05", valor: "1234.50", tipo: "credito", descricao: "  Venda de balcão  ", categoria: "vendas" });

        assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
        const esperado = {
          cliente_id: A.cliente.id, data_lancamento: "2026-11-05", valor: 1234.5, tipo: "credito",
          descricao: "Venda de balcão", categoria: "vendas", conciliado: false,
        };
        const { id, criado_em: criadoEm, criado_por: _, ...devolvido } = resposta.corpo;
        assert.deepEqual(devolvido, esperado);
        assert.ok(id && criadoEm);
        const gravado = await buscarLinha(banco, "lancamentos_contabeis", id);
        const { criado_em: __, criado_por: ___, ...gravadoSemData } = gravado;
        assert.deepEqual({ ...gravadoSemData, valor: Number(gravadoSemData.valor), id: undefined }, { ...esperado, id: undefined });
        const depoisDoA = await fotografar(banco, A.cliente.id);
        assert.equal(depoisDoA.lancamentos_contabeis.length, antesDoA.lancamentos_contabeis.length + 1);
        assert.deepEqual(depoisDoA.conciliacoes, antesDoA.conciliacoes);
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("aceita o valor máximo do NUMERIC(15,2) (9.999.999.999.999,99)", async () => {
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { ...VALIDO, valor: 9999999999999.99 });
      assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
      assert.equal(Number((await buscarLinha(banco, "lancamentos_contabeis", resposta.corpo.id)).valor), 9999999999999.99);
    });

    it("cliente_id do outro escritório: 404 'Cliente não encontrado', igual ao de cliente inexistente, e o B não ganha lançamento", async () => {
      for (const quem of ESCRITORIO.map(perfil => ator(A, perfil))) {
        const antes = await fotografar(banco);
        const doB = await api.requisitar("/lancamentos-contabeis", { usuario: quem.usuario, metodo: "POST", corpo: { ...VALIDO, cliente_id: B.cliente.id } });
        const inexistente = await api.requisitar("/lancamentos-contabeis", { usuario: quem.usuario, metodo: "POST", corpo: { ...VALIDO, cliente_id: UUID_INEXISTENTE } });
        assert.equal(doB.status, 404, quem.perfil);
        assert.deepEqual(doB.corpo, { erro: "Cliente não encontrado" }, quem.perfil);
        assert.deepEqual([inexistente.status, inexistente.corpo], [doB.status, doB.corpo], quem.perfil);
        assert.deepEqual(await fotografar(banco, null), antes, quem.perfil);
      }
    });

    it("admin_efficience com cliente_id que não existe: 404 em vez de 500 de chave estrangeira (PRB-C-48)",
      conhecido("BUG PRB-C-48 (achado novo, sem issue; precisa de issue `bug`): admin_efficience pula a checagem de escritório e o INSERT estoura a FK, resposta 500 em vez de 404"), async () => {
      const antes = await fotografar(banco);
      const resposta = await criar({ usuario: A.usuario(PERFIL.EFFICIENCE), escritorio: { cliente: { id: UUID_INEXISTENTE } } }, VALIDO);
      assert.equal(resposta.status, 404, JSON.stringify(resposta.corpo));
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("admin_efficience com cliente_id que não é UUID: 4xx em vez de 500 (PRB-C-48)",
      conhecido("BUG PRB-C-48 (achado novo, sem issue; precisa de issue `bug`): cliente_id que não é UUID chega ao INSERT (22P02) e a resposta é 500"), async () => {
      const antes = await fotografar(banco);
      const resposta = await criar({ usuario: A.usuario(PERFIL.EFFICIENCE), escritorio: { cliente: { id: "abc" } } }, VALIDO);
      assert.ok([400, 404].includes(resposta.status), `devolveu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("campos obrigatórios faltando: 400 listando quais", async () => {
      const antes = await fotografar(banco);
      const resposta = await api.requisitar("/lancamentos-contabeis", { usuario: A.usuario(PERFIL.CLIENTE), metodo: "POST", corpo: {} });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "Campos obrigatórios faltando", faltando: ["cliente_id", "data_lancamento", "valor", "tipo", "descricao"] });
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("tipo que não é credito nem debito: 400", async () => {
      const antes = await fotografar(banco);
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { ...VALIDO, tipo: "transferencia" });
      assert.deepEqual([resposta.status, resposta.corpo], [400, { erro: "tipo deve ser 'credito' ou 'debito'" }]);
      assert.deepEqual(await fotografar(banco), antes);
    });

    // Cada caso diz a mensagem esperada do campo (regra do controller, decisão do #558).
    const INVALIDOS = [
      ["valor 0", { valor: 0 }, "valor", "valor deve ser maior que zero"],
      ["valor negativo", { valor: -5 }, "valor", "valor deve ser maior que zero"],
      ["valor 0,001 (arredonda para 0,00)", { valor: 0.001 }, "valor", "valor deve ser maior que zero"],
      ["valor 'abc'", { valor: "abc" }, "valor", "valor deve ser um número"],
      ["valor '1e20' como texto", { valor: "1e20" }, "valor", "valor deve ser um número"],
      ["valor 1e20 como número (estoura o NUMERIC)", { valor: 1e20 }, "valor", "valor excede o máximo permitido (9.999.999.999.999,99)"],
      ["valor 10.000.000.000.000,00 (um acima do teto)", { valor: 10000000000000 }, "valor", "valor excede o máximo permitido (9.999.999.999.999,99)"],
      ["data invertida 05/02/2022 (dd/mm/aaaa)", { data_lancamento: "05/02/2022" }, "data_lancamento", "data_lancamento deve ser uma data válida no formato AAAA-MM-DD"],
      ["data 2026-02-30", { data_lancamento: "2026-02-30" }, "data_lancamento", "data_lancamento deve ser uma data válida no formato AAAA-MM-DD"],
      ["data 2026-13-01", { data_lancamento: "2026-13-01" }, "data_lancamento", "data_lancamento deve ser uma data válida no formato AAAA-MM-DD"],
      ["descrição só com espaços", { descricao: "   " }, "descricao", "descricao não pode ser vazia"],
      ["descrição que não é texto", { descricao: 123 }, "descricao", "descricao não pode ser vazia"],
    ];
    for (const [nome, sobrescrita, campo, mensagem] of INVALIDOS) {
      it(`${nome}: 400 com a mensagem no campo ${campo} e nada gravado`, async () => {
        const antes = await fotografar(banco);
        const resposta = await criar(ator(A, PERFIL.CLIENTE), { ...VALIDO, ...sobrescrita });
        assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.campos[campo], mensagem);
        assert.equal(resposta.corpo.erro, mensagem);
        assert.deepEqual(await fotografar(banco), antes);
      });
    }

    it("vários campos inválidos de uma vez: 400 lista todos", async () => {
      const resposta = await criar(ator(A, PERFIL.CLIENTE), { ...VALIDO, valor: 0, data_lancamento: "05/02/2022", descricao: " " });
      assert.equal(resposta.status, 400);
      assert.deepEqual(Object.keys(resposta.corpo.campos).sort(), ["data_lancamento", "descricao", "valor"]);
    });

    it("o lançamento guarda quem o criou: criado_por = id do token (PRB-C-24, #695)", async () => {
      const quem = ator(A, PERFIL.FUNCIONARIO);
      const resposta = await criar(quem, { ...VALIDO, criado_por: UUID_INEXISTENTE });
      assert.equal(resposta.status, 201);
      assert.equal(resposta.corpo.criado_por, quem.usuario.id);
      assert.equal((await buscarLinha(banco, "lancamentos_contabeis", resposta.corpo.id)).criado_por, quem.usuario.id);
    });

    for (const [campo, tamanho] of [["descricao", 10_000], ["categoria", 10_000]]) {
      it(`${campo} com ${tamanho} caracteres: 400 com a mensagem do campo (PRB-C-07, #697)`, async () => {
        const antes = await fotografar(banco);
        const resposta = await criar(ator(A, PERFIL.CLIENTE), { ...VALIDO, [campo]: "x".repeat(tamanho) });
        assert.equal(resposta.status, 400, `devolveu ${resposta.status}`);
        assert.ok(resposta.corpo.campos?.[campo], `mensagem no campo ${campo}`);
        assert.deepEqual(await fotografar(banco), antes);
      });
    }
  });

  describe("GET", () => {
    it("lista os 16 lançamentos do escritório, do mais novo ao mais antigo, com todos os campos, para os três perfis", async () => {
      for (const quem of atoresDe(A)) {
        const resposta = await listar(quem);
        assert.equal(resposta.status, 200, quem.perfil);
        assert.equal(resposta.corpo.length, 16, quem.perfil);
        assert.ok(resposta.corpo.every(l => l.cliente_id === A.cliente.id), `${quem.perfil}: lançamento de outro escritório na lista`);
        const datas = resposta.corpo.map(l => l.data_lancamento);
        assert.deepEqual(datas, [...datas].sort().reverse(), quem.perfil);
        assert.deepEqual({ ...resposta.corpo[0], criado_em: undefined }, {
          id: A.lancamentoAberto(19), cliente_id: A.cliente.id, data_lancamento: "2026-10-20", valor: 200, tipo: "debito",
          descricao: "Lançamento sintético a-0-19", categoria: "sintetica-680", conciliado: false, criado_em: undefined,
          criado_por: A.usuario(PERFIL.CLIENTE).id,
        }, quem.perfil);
        assert.deepEqual([resposta.corpo.at(-1).id, resposta.corpo.at(-1).conciliado], [A.lancamentoConcluido(0), true], quem.perfil);
      }
    });

    it("filtro de período: 10/2026 traz 14, 09/2026 traz 2, o ano 2026 traz 16 e 11/2026 nenhum", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      assert.equal((await listar(quem, "?mes=10&ano=2026")).corpo.length, 14);
      assert.equal((await listar(quem, "?mes=9&ano=2026")).corpo.length, 2);
      assert.equal((await listar(quem, "?ano=2026")).corpo.length, 16);
      assert.deepEqual((await listar(quem, "?mes=11&ano=2026")).corpo, []);
    });

    it("outro escritório: clienteId do B na query não muda o que o A recebe, e o admin_efficience escolhendo o A não recebe os do B", async () => {
      const doB = new Set((await buscarLinhas(banco, "lancamentos_contabeis", { cliente_id: B.cliente.id })).map(l => l.id));
      assert.equal(doB.size, 16, "dado do B presente");
      for (const perfil of ESCRITORIO) {
        const resposta = await api.requisitar(`/lancamentos-contabeis?clienteId=${B.cliente.id}`, { usuario: A.usuario(perfil) });
        assert.equal(resposta.status, 200, perfil);
        assert.equal(resposta.corpo.length, 16, perfil);
        assert.ok(!resposta.corpo.some(l => doB.has(l.id)), `${perfil} do A recebeu lançamento do B`);
      }
      const escolhendoA = await listar(ator(A, PERFIL.EFFICIENCE));
      assert.equal(escolhendoA.corpo.length, 16);
      assert.ok(!escolhendoA.corpo.some(l => doB.has(l.id)));
      const escolhendoB = await listar(ator(B, PERFIL.EFFICIENCE));
      assert.ok(escolhendoB.corpo.every(l => doB.has(l.id)) && escolhendoB.corpo.length === 16, "controle: escolhendo o B vem só o B");
    });

    it("admin_efficience: sem clienteId 400, clienteId que não é UUID 400, UUID inexistente 200 com lista vazia", async () => {
      const usuario = A.usuario(PERFIL.EFFICIENCE);
      const semCliente = await api.requisitar("/lancamentos-contabeis", { usuario });
      assert.deepEqual([semCliente.status, semCliente.corpo], [400, { erro: "clienteId é obrigatório" }]);
      const naoUuid = await api.requisitar("/lancamentos-contabeis?clienteId=abc", { usuario });
      assert.deepEqual([naoUuid.status, naoUuid.corpo], [400, { erro: "clienteId deve ser um UUID" }]);
      const inexistente = await api.requisitar(`/lancamentos-contabeis?clienteId=${UUID_INEXISTENTE}`, { usuario });
      assert.deepEqual([inexistente.status, inexistente.corpo], [200, []]);
    });

    const PERIODOS = [
      ["mes=0", "?mes=0&ano=2026", "mes deve ser um inteiro entre 1 e 12"],
      ["mes=13", "?mes=13&ano=2026", "mes deve ser um inteiro entre 1 e 12"],
      ["mes=abc", "?mes=abc&ano=2026", "mes deve ser um inteiro entre 1 e 12"],
      ["ano=99999", "?mes=10&ano=99999", "ano deve ser um inteiro entre 1000 e 9999"],
      ["ano=abc", "?ano=abc", "ano deve ser um inteiro entre 1000 e 9999"],
      ["mês sem ano", "?mes=10", "mes exige ano"],
    ];
    for (const [nome, consulta, mensagem] of PERIODOS) {
      it(`${nome}: 400 '${mensagem}'`, async () => {
        const resposta = await listar(ator(A, PERFIL.CLIENTE), consulta);
        assert.deepEqual([resposta.status, resposta.corpo], [400, { erro: mensagem }]);
      });
    }

    it("escritório com mais de 1000 lançamentos recebe todos, sem corte silencioso do PostgREST (PRB-C-09, #696)",
      conhecido("BUG #696 (PRB-C-09): a lista corta em 1000 sem aviso; corrigido no PR #715, ainda aberto"), async () => {
        const lote = Array.from({ length: 1001 }, (_, i) => ({ data: "2026-12-01", valor: i + 1, tipo: "credito", descricao: `lote ${i}` }));
        for (let inicio = 0; inicio < lote.length; inicio += 500) await criarLancamentos(banco, A.cliente.id, lote.slice(inicio, inicio + 500));
        const resposta = await listar(ator(A, PERFIL.CLIENTE), "?mes=12&ano=2026");
        assert.equal(resposta.corpo.length, 1001);
      });
  });

  describe("PATCH", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
      it(`${perfil}: altera os campos enviados, normaliza e ignora cliente_id do corpo; o banco confere e o B não muda`, async () => {
        const [livre] = await criarLancamentos(banco, A.cliente.id, [{ data: "2026-11-05", valor: 100, tipo: "credito", descricao: "original", categoria: "antiga" }]);
        const quem = ator(A, perfil);
        const antesDoB = await fotografar(banco, B.cliente.id);

        const resposta = await alterar(quem, livre.id, { descricao: "  Ajustada  ", valor: "15.5", tipo: "debito", data_lancamento: "2026-11-06", categoria: "nova", cliente_id: B.cliente.id });

        assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
        const esperado = { id: livre.id, cliente_id: A.cliente.id, data_lancamento: "2026-11-06", valor: 15.5, tipo: "debito", descricao: "Ajustada", categoria: "nova", conciliado: false };
        assert.deepEqual({ ...resposta.corpo, criado_em: undefined, criado_por: undefined }, { ...esperado, criado_em: undefined, criado_por: undefined });
        const gravado = await buscarLinha(banco, "lancamentos_contabeis", livre.id);
        assert.deepEqual({ ...gravado, valor: Number(gravado.valor), criado_em: undefined, criado_por: undefined }, { ...esperado, criado_em: undefined, criado_por: undefined });
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("só o campo enviado muda: os outros ficam como estavam", async () => {
      const [livre] = await criarLancamentos(banco, A.cliente.id, [{ data: "2026-11-05", valor: 100, tipo: "credito", descricao: "original", categoria: "antiga" }]);
      const resposta = await alterar(ator(A, PERFIL.CLIENTE), livre.id, { descricao: "só a descrição" });
      assert.equal(resposta.status, 200);
      const gravado = await buscarLinha(banco, "lancamentos_contabeis", livre.id);
      assert.deepEqual([gravado.descricao, gravado.data_lancamento, Number(gravado.valor), gravado.tipo, gravado.categoria], ["só a descrição", "2026-11-05", 100, "credito", "antiga"]);
    });

    it("lançamento do outro escritório: mesmo 404 do inexistente, com o lançamento do B presente e o banco intacto", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "lancamentos_contabeis", id: B.lancamentoAberto(0) },
        atores: ESCRITORIO.map(perfil => ator(A, perfil)),
        montar: id => ({ metodo: "PATCH", caminho: `/lancamentos-contabeis/${id}`, corpo: { descricao: "invasão" } }),
        mensagem: "Lançamento contábil não encontrado",
      });
    });

    it("id que não é UUID: 404 igual ao inexistente (a rota não valida UUID; o banco recusa a busca)", async () => {
      const antes = await fotografar(banco);
      const resposta = await alterar(ator(A, PERFIL.CLIENTE), "nao-e-uuid", { descricao: "x" });
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Lançamento contábil não encontrado" }]);
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("lançamento já conciliado (da sessão concluída): 409 e o banco não muda", async () => {
      for (const perfil of ESCRITORIO) {
        const antes = await fotografar(banco);
        const resposta = await alterar(ator(A, perfil), A.lancamentoConcluido(0), { descricao: "tentativa" });
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Lançamento já conciliado não pode ser alterado" }], perfil);
        assert.deepEqual(await fotografar(banco), antes, perfil);
      }
    });

    const INVALIDOS = [
      ["valor 0", { valor: 0 }, "valor", "valor deve ser maior que zero"],
      ["valor negativo", { valor: -1 }, "valor", "valor deve ser maior que zero"],
      ["valor 'abc'", { valor: "abc" }, "valor", "valor deve ser um número"],
      ["valor null", { valor: null }, "valor", "valor deve ser um número"],
      ["data invertida 05/02/2022", { data_lancamento: "05/02/2022" }, "data_lancamento", "data_lancamento deve ser uma data válida no formato AAAA-MM-DD"],
      ["data 2026-02-30", { data_lancamento: "2026-02-30" }, "data_lancamento", "data_lancamento deve ser uma data válida no formato AAAA-MM-DD"],
      ["descrição só com espaços", { descricao: "  " }, "descricao", "descricao não pode ser vazia"],
    ];
    for (const [nome, corpo, campo, mensagem] of INVALIDOS) {
      it(`${nome}: 400 com a mensagem no campo ${campo} e nada muda`, async () => {
        const [livre] = await criarLancamentos(banco, A.cliente.id, [{ data: "2026-11-05", valor: 100, tipo: "credito" }]);
        const antes = await fotografar(banco);
        const resposta = await alterar(ator(A, PERFIL.CLIENTE), livre.id, corpo);
        assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.campos[campo], mensagem);
        assert.deepEqual(await fotografar(banco), antes);
      });
    }

    it("tipo inválido: 400; corpo sem nenhum campo: 400 'Nenhum campo para atualizar'", async () => {
      const [livre] = await criarLancamentos(banco, A.cliente.id, [{ data: "2026-11-05", valor: 100, tipo: "credito" }]);
      const antes = await fotografar(banco);
      const tipo = await alterar(ator(A, PERFIL.CLIENTE), livre.id, { tipo: "transferencia" });
      assert.deepEqual([tipo.status, tipo.corpo], [400, { erro: "tipo deve ser 'credito' ou 'debito'" }]);
      const vazio = await alterar(ator(A, PERFIL.CLIENTE), livre.id, {});
      assert.deepEqual([vazio.status, vazio.corpo], [400, { erro: "Nenhum campo para atualizar" }]);
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("categoria com 10.000 caracteres: 400 com a mensagem do campo (PRB-C-07, #697)", async () => {
      const [livre] = await criarLancamentos(banco, A.cliente.id, [{ data: "2026-11-05", valor: 100, tipo: "credito" }]);
      const antes = await fotografar(banco);
      const resposta = await alterar(ator(A, PERFIL.CLIENTE), livre.id, { categoria: "x".repeat(10_000) });
      assert.equal(resposta.status, 400, `devolveu ${resposta.status}`);
      assert.ok(resposta.corpo.campos?.categoria);
      assert.deepEqual(await fotografar(banco), antes);
    });
  });

  describe("DELETE", () => {
    for (const perfil of ESCRITORIO) {
      it(`${perfil}: apaga o lançamento livre (204) e só ele`, async () => {
        const [livre, vizinho] = await criarLancamentos(banco, A.cliente.id, [
          { data: "2026-11-05", valor: 100, tipo: "credito", descricao: "livre" }, { data: "2026-11-06", valor: 50, tipo: "debito", descricao: "vizinho" },
        ]);
        const antesDoB = await fotografar(banco, B.cliente.id);
        const resposta = await apagar(ator(A, perfil), livre.id);
        assert.equal(resposta.status, 204);
        assert.equal(await buscarLinha(banco, "lancamentos_contabeis", livre.id), null);
        assert.ok(await buscarLinha(banco, "lancamentos_contabeis", vizinho.id), "o vizinho continua lá");
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("lançamento do outro escritório: mesmo 404 do inexistente, com o lançamento do B presente e o banco intacto", async () => {
      await provarOutroEscritorio404(api, banco, {
        alvo: { tabela: "lancamentos_contabeis", id: B.lancamentoAberto(0) },
        atores: ESCRITORIO.map(perfil => ator(A, perfil)),
        montar: id => ({ metodo: "DELETE", caminho: `/lancamentos-contabeis/${id}` }),
        mensagem: "Lançamento contábil não encontrado",
      });
    });

    it("id que não é UUID: 404 igual ao inexistente", async () => {
      const resposta = await apagar(ator(A, PERFIL.CLIENTE), "nao-e-uuid");
      assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Lançamento contábil não encontrado" }]);
    });

    it("lançamento já conciliado: 409 'não pode ser removido' e o banco não muda", async () => {
      for (const perfil of ESCRITORIO) {
        const antes = await fotografar(banco);
        const resposta = await apagar(ator(A, perfil), A.lancamentoConcluido(1));
        assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Lançamento já conciliado não pode ser removido" }], perfil);
        assert.deepEqual(await fotografar(banco), antes, perfil);
      }
    });

    it("lançamento que está num par de sessão em andamento (não conciliado): 409 por chave estrangeira, não 500 (PRB-C-23)", async () => {
      const antes = await fotografar(banco);
      const resposta = await apagar(ator(A, PERFIL.CLIENTE), A.lancamentoAberto(0));
      assert.deepEqual([resposta.status, resposta.corpo], [409, { erro: "Lançamento vinculado a uma conciliação não pode ser removido" }]);
      assert.deepEqual(await fotografar(banco), antes);
    });
  });
});
