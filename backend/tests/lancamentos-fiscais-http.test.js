// TEST-13 (#689): GET /lancamentos-fiscais (lista + filtros) e GET /lancamentos-fiscais/resumo
// contra o app Express real e o banco descartável (#678): requisição HTTP de verdade, token JWT de
// verdade e linhas de verdade em lancamentos_fiscais. O teste antigo (lancamentos-fiscais.test.js)
// chama o controller com banco falso e continua valendo para a lógica pura; este prova a fiação.
//
// Quem pode o quê (decidido pelo código/matriz-acesso.js, não por este teste): as duas rotas usam
// exigirPerfil(admin_efficience, admin_cliente, funcionario), então NENHUM dos três perfis do produto
// é barrado. "Perfil sem permissão: 403" aqui é um perfil que não existe no produto no token.
//
// "Outro escritório recebe o mesmo 404 do id inexistente": essas duas rotas não têm id na URL
// (a seleção é pelo escritório do token, ou por clienteId para admin_efficience). Então o
// isolamento é provado pelo CONTEÚDO: a nota do escritório B existe no banco e não aparece para o A
// (nem no total do resumo), mesmo quando o A pede o clienteId do B na query. Para admin_efficience
// um clienteId inexistente devolve o mesmo resultado vazio de um escritório sem notas.
//
// Bugs conhecidos (#570, #571, #654/NFE-2, #655/NFE-3) estão todos CLOSED e corrigidos na base,
// então os casos abaixo rodam de verdade (nenhum skip).
//
// Os dois POST (rotas do agente, x-licenca-token) entram só com 401 sem token e JSON malformado: é a
// prova do contrato nessas rotas, também coberto por erro-json.test.js (#571) e pela matriz do TEST-6.
// O fluxo completo do agente até o banco é a TEST-11.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { criarCenarioBanco, resetarBanco } from "./helpers/banco.js";
import { iniciarApiTeste } from "./helpers/http.js";
import { PERFIS } from "../src/config/perfis.js";

const UUID_INEXISTENTE = "99999999-9999-4999-8999-999999999999";
const VAZAMENTO = /<html|stack|node_modules|body-parser|at parse|[A-Za-z]:\\|\/Users\/|\/home\//i;

let seq = 0;
function chaveNfe() {
  seq += 1;
  return `3526${String(seq).padStart(40, "0")}`;
}

function nota(clienteId, campos) {
  return {
    cliente_id: clienteId,
    chave_nfe: chaveNfe(),
    tipo: "saida",
    cnpj_emitente: "11222333000181",
    cnpj_destinatario: "44555666000199",
    valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0,
    status: "ativa",
    ...campos,
  };
}

const ZERADO = { quantidade: 0, valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0 };

describe("TEST-13: GET /lancamentos-fiscais e /resumo (HTTP + banco real)", { timeout: 300_000 }, () => {
  let api; let cenario; let banco;
  let A; let B; let vazio; // escritórios
  let usuA; let funcA; let usuB; let admin;
  let notasA; let notaB;

  before(async () => {
    await resetarBanco();
    cenario = criarCenarioBanco();
    banco = cenario.banco;
    A = await cenario.criarCliente({ nome: "Escritório A #689" });
    B = await cenario.criarCliente({ nome: "Escritório B #689" });
    vazio = await cenario.criarCliente({ nome: "Escritório sem notas #689" });
    usuA = await cenario.criarUsuario({ clienteId: A.id, perfil: PERFIS.ADMIN_CLIENTE });
    funcA = await cenario.criarUsuario({ clienteId: A.id, perfil: PERFIS.FUNCIONARIO });
    usuB = await cenario.criarUsuario({ clienteId: B.id, perfil: PERFIS.ADMIN_CLIENTE });
    admin = await cenario.criarUsuario({ clienteId: vazio.id, perfil: PERFIS.ADMIN_EFFICIENCE });

    // Escritório A: 3 saídas ativas, 1 entrada ativa, 1 saída cancelada (jan/2026), mais bordas de período.
    const linhasA = [
      nota(A.id, { nome: "saida-jan-10", tipo: "saida", data_emissao: "2026-01-10", valor_total: 1000, icms: 180, pis: 6.5, cofins: 30, ipi: 0 }),
      nota(A.id, { nome: "saida-jan-31", tipo: "saida", data_emissao: "2026-01-31", valor_total: 500.25, icms: 90.05, pis: 3.25, cofins: 15, ipi: 5 }),
      nota(A.id, { nome: "entrada-jan-15", tipo: "entrada", data_emissao: "2026-01-15", valor_total: 300, icms: 54, pis: 1.95, cofins: 9, ipi: 2.5 }),
      nota(A.id, { nome: "saida-cancelada-jan", tipo: "saida", data_emissao: "2026-01-20", valor_total: 7777, icms: 1400, pis: 50, cofins: 200, ipi: 10,
        status: "cancelada", cancelado_em: "2026-01-21T10:00:00Z", motivo_cancelamento: "erro de digitação" }),
      nota(A.id, { nome: "saida-fev-01", tipo: "saida", data_emissao: "2026-02-01", valor_total: 200, icms: 36, pis: 1.3, cofins: 6, ipi: 0 }),
      nota(A.id, { nome: "entrada-dez-2025", tipo: "entrada", data_emissao: "2025-12-31", valor_total: 100, icms: 18, pis: 0.65, cofins: 3, ipi: 0 }),
    ];
    const nomePorChave = new Map(linhasA.map(l => [l.chave_nfe, l.nome]));
    const inserirA = await banco.from("lancamentos_fiscais").insert(linhasA.map(({ nome, ...l }) => l)).select("*");
    assert.equal(inserirA.error, null, inserirA.error?.message);
    notasA = Object.fromEntries(inserirA.data.map(linha => [nomePorChave.get(linha.chave_nfe), linha]));

    // Escritório B: nota grande que, se vazar, muda qualquer total do A.
    const inserirB = await banco.from("lancamentos_fiscais").insert(
      nota(B.id, { tipo: "saida", data_emissao: "2026-01-12", valor_total: 99999, icms: 17999.82, pis: 650, cofins: 3000, ipi: 100 }),
    ).select("*").single();
    assert.equal(inserirB.error, null, inserirB.error?.message);
    notaB = inserirB.data;

    const itens = await banco.from("lancamentos_fiscais_itens").insert([
      { lancamento_id: notasA["saida-jan-10"].id, cliente_id: A.id, n_item: 1, cfop: "5102", ncm: "84713012" },
      { lancamento_id: notasA["saida-jan-10"].id, cliente_id: A.id, n_item: 2, cfop: "5405", ncm: "22021000" },
    ]);
    assert.equal(itens.error, null, itens.error?.message);

    api = await iniciarApiTeste();
  });

  after(async () => {
    try { await api?.fechar(); } finally { await resetarBanco(); }
  });

  const chavesDe = (corpo) => corpo.map(item => item.chave_nfe).sort();
  const chavesEsperadas = (...nomes) => nomes.map(n => notasA[n].chave_nfe).sort();
  const lerTudoDoBanco = async () => {
    const { data, error } = await banco.from("lancamentos_fiscais").select("*").order("id");
    assert.equal(error, null, error?.message);
    return data;
  };

  for (const rota of ["/lancamentos-fiscais", "/lancamentos-fiscais/resumo"]) {
    describe(`GET ${rota}: acesso`, () => {
      it("deslogado: 401 e o banco não muda", async () => {
        const antes = await lerTudoDoBanco();
        const resposta = await api.requisitar(rota);
        assert.equal(resposta.status, 401);
        assert.deepEqual(resposta.corpo, { erro: "Token nao fornecido" });
        assert.deepEqual(await lerTudoDoBanco(), antes);
      });

      it("token adulterado, assinado com outro segredo ou expirado: 401", async () => {
        const payload = { id: usuA.id, email: usuA.email, perfil: usuA.perfil, cliente_id: A.id };
        const tokens = [
          jwt.sign(payload, "outro-segredo"),
          jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: -10 }),
          `${jwt.sign(payload, process.env.JWT_SECRET)}x`,
        ];
        for (const token of tokens) {
          const resposta = await fetch(new URL(rota, api.baseUrl), { headers: { Authorization: `Bearer ${token}` } });
          assert.equal(resposta.status, 401);
          assert.deepEqual(await resposta.json(), { erro: "Token invalido" });
        }
      });

      it("perfil que não existe no produto: 403 (os três perfis reais passam)", async () => {
        const resposta = await api.requisitar(rota, { usuario: { ...usuA, perfil: "visitante" } });
        assert.equal(resposta.status, 403);
        assert.deepEqual(resposta.corpo, { erro: "Acesso negado: perfil sem permissão" });
        for (const usuario of [usuA, funcA]) {
          assert.equal((await api.requisitar(rota, { usuario })).status, 200, usuario.perfil);
        }
        assert.equal((await api.requisitar(`${rota}?clienteId=${A.id}`, { usuario: admin })).status, 200);
      });
    });
  }

  describe("GET /lancamentos-fiscais: lista e isolamento por escritório", () => {
    it("admin_cliente do A recebe só as 6 notas do A (inclusive a cancelada) e nenhuma do B, que existe no banco", async () => {
      const noBanco = await banco.from("lancamentos_fiscais").select("id").eq("id", notaB.id);
      assert.equal(noBanco.data.length, 1, "controle: a nota do B está no banco");
      const resposta = await api.requisitar("/lancamentos-fiscais", { usuario: usuA });
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.length, 6);
      assert.ok(resposta.corpo.every(item => item.cliente_id === A.id));
      assert.ok(!resposta.corpo.some(item => item.id === notaB.id));
      assert.deepEqual(
        chavesDe(resposta.corpo),
        chavesEsperadas("saida-jan-10", "saida-jan-31", "entrada-jan-15", "saida-cancelada-jan", "saida-fev-01", "entrada-dez-2025"),
      );
    });

    it("funcionário do A enxerga o mesmo conjunto do admin_cliente do A", async () => {
      const dono = await api.requisitar("/lancamentos-fiscais", { usuario: usuA });
      const func = await api.requisitar("/lancamentos-fiscais", { usuario: funcA });
      assert.equal(func.status, 200);
      assert.deepEqual(chavesDe(func.corpo), chavesDe(dono.corpo));
    });

    it("usuário do B vê só a nota do B", async () => {
      const resposta = await api.requisitar("/lancamentos-fiscais", { usuario: usuB });
      assert.equal(resposta.status, 200);
      assert.deepEqual(resposta.corpo.map(item => item.id), [notaB.id]);
    });

    it("usuário do A que pede o clienteId do B (camel e snake) continua preso ao A", async () => {
      for (const chave of ["clienteId", "cliente_id"]) {
        const lista = await api.requisitar(`/lancamentos-fiscais?${chave}=${B.id}`, { usuario: usuA });
        assert.equal(lista.status, 200);
        assert.equal(lista.corpo.length, 6);
        assert.ok(lista.corpo.every(item => item.cliente_id === A.id));
        const resumo = await api.requisitar(`/lancamentos-fiscais/resumo?${chave}=${B.id}`, { usuario: usuA });
        assert.equal(resumo.status, 200);
        assert.deepEqual(resumo.corpo, {
          total_nfe: 5,
          entradas: { quantidade: 2, valor_total: 400, icms: 72, pis: 2.6, cofins: 12, ipi: 2.5 },
          saidas: { quantidade: 3, valor_total: 1700.25, icms: 306.05, pis: 11.05, cofins: 51, ipi: 5 },
        });
      }
    });

    it("usuário do A com clienteId inválido na query: ignorado, não vira 400 nem 500", async () => {
      const resposta = await api.requisitar("/lancamentos-fiscais?clienteId=abc", { usuario: usuA });
      assert.equal(resposta.status, 200);
      assert.equal(resposta.corpo.length, 6);
    });

    it("ordena por data_emissao decrescente e devolve os itens (CFOP/NCM) da nota", async () => {
      const resposta = await api.requisitar("/lancamentos-fiscais", { usuario: usuA });
      const datas = resposta.corpo.map(item => item.data_emissao);
      assert.deepEqual(datas, [...datas].sort().reverse());
      const comItens = resposta.corpo.find(item => item.id === notasA["saida-jan-10"].id);
      assert.deepEqual(
        comItens.itens.sort((x, y) => x.n_item - y.n_item),
        [{ n_item: 1, cfop: "5102", ncm: "84713012" }, { n_item: 2, cfop: "5405", ncm: "22021000" }],
      );
      assert.deepEqual(resposta.corpo.find(item => item.id === notasA["entrada-jan-15"].id).itens, []);
    });

    it("a nota cancelada aparece na lista marcada como cancelada, com motivo", async () => {
      const resposta = await api.requisitar("/lancamentos-fiscais", { usuario: usuA });
      const canceladas = resposta.corpo.filter(item => item.status === "cancelada");
      assert.deepEqual(canceladas.map(item => item.id), [notasA["saida-cancelada-jan"].id]);
      assert.equal(canceladas[0].motivo_cancelamento, "erro de digitação");
      assert.equal(resposta.corpo.filter(item => item.status === "ativa").length, 5);
    });

    it("valores voltam como o banco guarda (sem perder centavos)", async () => {
      const resposta = await api.requisitar("/lancamentos-fiscais?mes=1&ano=2026", { usuario: usuA });
      const linha = resposta.corpo.find(item => item.id === notasA["saida-jan-31"].id);
      const doBanco = (await banco.from("lancamentos_fiscais").select("*").eq("id", linha.id).single()).data;
      assert.equal(Number(linha.valor_total), 500.25);
      assert.equal(Number(linha.icms), 90.05);
      for (const campo of ["tipo", "valor_total", "icms", "pis", "cofins", "ipi", "data_emissao", "chave_nfe", "status"]) {
        assert.equal(linha[campo], doBanco[campo], campo);
      }
    });
  });

  describe("GET /lancamentos-fiscais: filtros de período", () => {
    const ids = async (query, usuario = usuA) => {
      const r = await api.requisitar(`/lancamentos-fiscais${query}`, { usuario });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      return chavesDe(r.corpo);
    };

    it("ano: só o ano inteiro (2026 = 5 notas; 2025 = 1)", async () => {
      assert.deepEqual(await ids("?ano=2026"), chavesEsperadas("saida-jan-10", "saida-jan-31", "entrada-jan-15", "saida-cancelada-jan", "saida-fev-01"));
      assert.deepEqual(await ids("?ano=2025"), chavesEsperadas("entrada-dez-2025"));
      assert.deepEqual(await ids("?ano=2024"), []);
    });

    it("mês/ano: janeiro/2026 inclui dia 10 e dia 31, exclui 01/02 e 31/12; fevereiro e dezembro/2025 isolados", async () => {
      assert.deepEqual(await ids("?mes=1&ano=2026"), chavesEsperadas("saida-jan-10", "saida-jan-31", "entrada-jan-15", "saida-cancelada-jan"));
      assert.deepEqual(await ids("?mes=2&ano=2026"), chavesEsperadas("saida-fev-01"));
      assert.deepEqual(await ids("?mes=12&ano=2025"), chavesEsperadas("entrada-dez-2025"));
      assert.deepEqual(await ids("?mes=01&ano=2026"), await ids("?mes=1&ano=2026"));
    });

    it("mes e ano vazios contam como ausentes (lista completa)", async () => {
      assert.equal((await ids("?mes=&ano=")).length, 6);
    });

    it("entrada inválida: 400 com mensagem que nomeia o campo, nunca 500, e o banco não muda", async () => {
      const antes = await lerTudoDoBanco();
      const casos = [
        ["?mes=13&ano=2026", /^mes /],
        ["?mes=0&ano=2026", /^mes /],
        ["?mes=abc&ano=2026", /^mes /],
        ["?mes=1.5&ano=2026", /^mes /],
        ["?mes=1", /^mes exige ano/],
        ["?ano=99", /^ano /],
        ["?ano=10000", /^ano /],
        ["?ano=2026x", /^ano /],
        ["?mes=1&ano=abc", /^ano /],
      ];
      for (const rota of ["/lancamentos-fiscais", "/lancamentos-fiscais/resumo"]) {
        for (const [query, padrao] of casos) {
          const r = await api.requisitar(`${rota}${query}`, { usuario: usuA });
          assert.equal(r.status, 400, `${rota}${query} -> ${r.status}`);
          assert.match(r.corpo.erro, padrao, `${rota}${query}`);
          assert.deepEqual(Object.keys(r.corpo), ["erro"]);
        }
      }
      assert.deepEqual(await lerTudoDoBanco(), antes);
    });
  });

  describe("admin_efficience", () => {
    for (const rota of ["/lancamentos-fiscais", "/lancamentos-fiscais/resumo"]) {
      it(`GET ${rota} sem clienteId: 400 clienteId é obrigatório`, async () => {
        const r = await api.requisitar(rota, { usuario: admin });
        assert.equal(r.status, 400);
        assert.deepEqual(r.corpo, { erro: "clienteId é obrigatório" });
      });

      it(`GET ${rota} com clienteId não-UUID: 400 "clienteId deve ser um UUID" (não 500)`, async () => {
        for (const valor of ["abc", "123", "1' or '1'='1", "11111111-1111-1111-1111-11111111111"]) {
          const r = await api.requisitar(`${rota}?clienteId=${encodeURIComponent(valor)}`, { usuario: admin });
          assert.equal(r.status, 400, valor);
          assert.deepEqual(r.corpo, { erro: "clienteId deve ser um UUID" });
        }
      });
    }

    it("com clienteId do A, do B e snake_case: cada um vê só o seu escritório", async () => {
      const doA = await api.requisitar(`/lancamentos-fiscais?clienteId=${A.id}`, { usuario: admin });
      assert.equal(doA.corpo.length, 6);
      assert.ok(doA.corpo.every(item => item.cliente_id === A.id));
      const doB = await api.requisitar(`/lancamentos-fiscais?cliente_id=${B.id}`, { usuario: admin });
      assert.deepEqual(doB.corpo.map(item => item.id), [notaB.id]);
      const resumoB = await api.requisitar(`/lancamentos-fiscais/resumo?clienteId=${B.id}`, { usuario: admin });
      assert.equal(resumoB.corpo.total_nfe, 1);
      assert.equal(resumoB.corpo.saidas.valor_total, 99999);
    });

    it("clienteId UUID válido que não existe = mesmo resultado vazio de escritório sem notas (sem vazar nada)", async () => {
      for (const id of [UUID_INEXISTENTE, vazio.id]) {
        const lista = await api.requisitar(`/lancamentos-fiscais?clienteId=${id}`, { usuario: admin });
        assert.equal(lista.status, 200);
        assert.deepEqual(lista.corpo, []);
        const resumo = await api.requisitar(`/lancamentos-fiscais/resumo?clienteId=${id}`, { usuario: admin });
        assert.deepEqual(resumo.corpo, { total_nfe: 0, entradas: ZERADO, saidas: ZERADO });
      }
    });

    it("token sem cliente_id (não admin) não escolhe escritório: 400", async () => {
      const r = await api.requisitar(`/lancamentos-fiscais?clienteId=${A.id}`, { usuario: { ...usuA, cliente_id: null } });
      assert.equal(r.status, 400);
      assert.deepEqual(r.corpo, { erro: "clienteId é obrigatório" });
    });
  });

  describe("GET /lancamentos-fiscais/resumo", () => {
    it("separa entradas de saídas e ignora a cancelada: confere com a soma feita direto no banco", async () => {
      const r = await api.requisitar("/lancamentos-fiscais/resumo", { usuario: usuA });
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo, {
        total_nfe: 5,
        entradas: { quantidade: 2, valor_total: 400, icms: 72, pis: 2.6, cofins: 12, ipi: 2.5 },
        saidas: { quantidade: 3, valor_total: 1700.25, icms: 306.05, pis: 11.05, cofins: 51, ipi: 5 },
      });
      // Conferência independente: lê as linhas do banco e soma por tipo.
      const { data } = await banco.from("lancamentos_fiscais").select("*").eq("cliente_id", A.id).eq("status", "ativa");
      for (const tipo of ["entrada", "saida"]) {
        const grupo = data.filter(l => l.tipo === tipo);
        const chave = tipo === "entrada" ? "entradas" : "saidas";
        assert.equal(r.corpo[chave].quantidade, grupo.length);
        for (const campo of ["valor_total", "icms", "pis", "cofins", "ipi"]) {
          const soma = Math.round(grupo.reduce((acc, l) => acc + Number(l[campo]), 0) * 100) / 100;
          assert.equal(r.corpo[chave][campo], soma, `${tipo}.${campo}`);
        }
      }
    });

    it("não existe total misturado de entrada com saída (NFE-2): só os grupos entradas e saidas", async () => {
      const r = await api.requisitar("/lancamentos-fiscais/resumo", { usuario: usuA });
      assert.deepEqual(Object.keys(r.corpo).sort(), ["entradas", "saidas", "total_nfe"]);
      assert.equal(r.corpo.icms, undefined, "não existe mais um 'icms total' misturado");
      assert.equal(r.corpo.valor_total, undefined);
    });

    it("canceladas coerentes com a lista: total_nfe do resumo = notas 'ativa' da lista; a cancelada sai dos totais", async () => {
      for (const query of ["", "?ano=2026", "?mes=1&ano=2026", "?mes=2&ano=2026", "?ano=2025"]) {
        const lista = await api.requisitar(`/lancamentos-fiscais${query}`, { usuario: usuA });
        const resumo = await api.requisitar(`/lancamentos-fiscais/resumo${query}`, { usuario: usuA });
        const ativas = lista.corpo.filter(item => item.status === "ativa");
        assert.equal(resumo.corpo.total_nfe, ativas.length, query);
        assert.equal(resumo.corpo.entradas.quantidade + resumo.corpo.saidas.quantidade, ativas.length, query);
        const valorAtivas = Math.round(ativas.reduce((s, l) => s + Number(l.valor_total), 0) * 100) / 100;
        assert.equal(Math.round((resumo.corpo.entradas.valor_total + resumo.corpo.saidas.valor_total) * 100) / 100, valorAtivas, query);
      }
      const jan = await api.requisitar("/lancamentos-fiscais/resumo?mes=1&ano=2026", { usuario: usuA });
      assert.equal(jan.corpo.saidas.quantidade, 2, "a saída cancelada de janeiro (7777) não conta");
    });

    it("período define a apuração: janeiro, fevereiro, 2025 e ano inteiro dão totais diferentes e corretos", async () => {
      const resumo = async (q) => (await api.requisitar(`/lancamentos-fiscais/resumo${q}`, { usuario: usuA })).corpo;
      const jan = await resumo("?mes=1&ano=2026");
      assert.equal(jan.total_nfe, 3);
      assert.equal(jan.saidas.valor_total, 1500.25);
      assert.equal(jan.entradas.valor_total, 300);
      const fev = await resumo("?mes=2&ano=2026");
      assert.deepEqual([fev.total_nfe, fev.saidas.valor_total, fev.entradas.quantidade], [1, 200, 0]);
      const ano25 = await resumo("?ano=2025");
      assert.deepEqual([ano25.total_nfe, ano25.entradas.valor_total, ano25.saidas.quantidade], [1, 100, 0]);
      const ano26 = await resumo("?ano=2026");
      assert.deepEqual([ano26.total_nfe, ano26.saidas.valor_total, ano26.entradas.valor_total], [4, 1700.25, 300]);
      const vazioMes = await resumo("?mes=5&ano=2026");
      assert.deepEqual(vazioMes, { total_nfe: 0, entradas: ZERADO, saidas: ZERADO });
    });

    it("escritório B: o resumo do A não contém a nota de 99999 do B; o do B não contém nada do A", async () => {
      const doB = await api.requisitar("/lancamentos-fiscais/resumo", { usuario: usuB });
      assert.deepEqual(doB.corpo, {
        total_nfe: 1,
        entradas: ZERADO,
        saidas: { quantidade: 1, valor_total: 99999, icms: 17999.82, pis: 650, cofins: 3000, ipi: 100 },
      });
    });

    it("os GETs não escrevem nada no banco", async () => {
      const antes = await lerTudoDoBanco();
      await api.requisitar("/lancamentos-fiscais", { usuario: usuA });
      await api.requisitar("/lancamentos-fiscais/resumo?mes=1&ano=2026", { usuario: usuA });
      assert.deepEqual(await lerTudoDoBanco(), antes);
    });
  });

  describe("rotas do agente e JSON malformado (sem vazar stack nem caminho)", () => {
    it("POST /lancamentos-fiscais e /cancelar sem x-licenca-token: 401 e nada gravado", async () => {
      const antes = await lerTudoDoBanco();
      for (const caminho of ["/lancamentos-fiscais", "/lancamentos-fiscais/cancelar"]) {
        const r = await api.requisitar(caminho, { metodo: "POST", corpo: { chave_nfe: "1".repeat(44) } });
        assert.equal(r.status, 401, caminho);
        assert.deepEqual(r.corpo, { erro: "Token de licença inválido ou expirado" });
      }
      assert.deepEqual(await lerTudoDoBanco(), antes);
    });

    it("JSON quebrado em POST /lancamentos-fiscais e /cancelar: 400 limpo {erro:'JSON malformado'}", async () => {
      for (const caminho of ["/lancamentos-fiscais", "/lancamentos-fiscais/cancelar"]) {
        const resposta = await fetch(new URL(caminho, api.baseUrl), {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{json quebrado",
        });
        const texto = await resposta.text();
        assert.equal(resposta.status, 400, caminho);
        assert.match(resposta.headers.get("content-type"), /application\/json/);
        assert.doesNotMatch(texto, VAZAMENTO);
        assert.deepEqual(JSON.parse(texto), { erro: "JSON malformado" });
      }
    });
  });
});
