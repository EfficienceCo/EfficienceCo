// TEST-DAS-2: rotas/persistência/isolamento migrados a apuracao-http.test.js.
// Restam bases puras e falhas explícitas do adaptador; mapa em docs/testes-apuracao.md.
import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import { PERFIS } from "../src/config/perfis.js";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";
import {
  montarBasesCalculo,
  listarApuracoes,
  excluirApuracao,
} from "../src/controllers/apuracoes.controller.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const APURACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const operacoes = [];
function chave(t, m) { return `${t}:${m}`; }
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}

supabase.from = function (tabela) {
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() { return builder; },
    insert(payload) { operacoes.push({ tabela, metodo: "insert", payload }); return builder; },
    update(payload) { operacoes.push({ tabela, metodo: "update", payload }); return builder; },
    delete() { operacoes.push({ tabela, metodo: "delete" }); return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    in() { return builder; },
    order() { return builder; },
    range() { return builder; },
    maybeSingle() { return Promise.resolve(consumir("maybeSingle", { data: null, error: null })); },
    single() { return Promise.resolve(consumir("single", { data: null, error: null })); },
    then(resolve, reject) {
      return Promise.resolve(consumir("await", { data: [], error: null })).then(resolve, reject);
    },
  };
  return builder;
};

after(() => {
  supabase.from = originalFrom;
});

beforeEach(() => {
  filas.clear();
  operacoes.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload ?? null; return this; },
  };
}

function reqAdmin(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A, id: "user-1", email: "contador@teste.com" },
    ...overrides,
  };
}

describe("Bases puras: calendário e destinatário", () => {
  it("exclui da RBT12 notas de mês ainda não fechado (BUG-APUR-08)", async () => {
    // Competência alguns meses à frente: a janela RBT12 mistura meses já
    // fechados com o mês civil corrente (ainda aberto).
    const agora = new Date();
    const competencia = new Date(agora.getFullYear(), agora.getMonth() + 3, 1);
    const mesCompetencia = competencia.getMonth() + 1;
    const anoCompetencia = competencia.getFullYear();
    const mesCorrente = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
    const dia = String(Math.min(agora.getDate(), 28)).padStart(2, "0");
    const dataNoMesAberto = `${mesCorrente}-${dia}`;
    // Mês anterior ao corrente — garantido fechado e dentro da janela dos
    // 12 meses anteriores à competência (competência = corrente + 3).
    const mesFechadoDate = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const refFechado = `${mesFechadoDate.getFullYear()}-${String(mesFechadoDate.getMonth() + 1).padStart(2, "0")}`;
    const dataFechada = `${refFechado}-10`;

    const bases = montarBasesCalculo({
      notas: [
      {
        id: "nfe-mes-aberto",
        chave_nfe: "35260900000000000000550010000000041000000040",
        tipo: "saida",
        valor_total: 99999,
        data_emissao: dataNoMesAberto,
      },
      {
        id: "nfe-mes-fechado",
        chave_nfe: "35250800000000000000550010000000051000000050",
        tipo: "saida",
        valor_total: 40000,
        data_emissao: dataFechada,
      },
      ],
      historicoReceita: [],
      mes: mesCompetencia,
      ano: anoCompetencia,
      hojeISO: dataNoMesAberto,
    });

    assert.equal(bases.rbt12, 40000);
    const linhaAberta = bases.rbt12Mensal.find((item) => item.referencia === mesCorrente);
    assert.ok(linhaAberta, `esperava linha RBT12 para ${mesCorrente}`);
    assert.equal(linhaAberta.periodo_fechado, false);
    assert.equal(linhaAberta.total, 0);
    assert.equal(bases.notasFiscais.consideradas.length, 1);
    assert.equal(bases.notasFiscais.consideradas[0].id, "nfe-mes-fechado");
    const excluida = bases.notasFiscais.excluidas.find((n) => n.id === "nfe-mes-aberto");
    assert.match(excluida.motivo, /não fechado/i);
  });

  it("inclui saída para CPF na receita do mês (destinatário pessoa física)", () => {
    const bases = montarBasesCalculo({
      notas: [
        {
          id: "nfe-cpf",
          chave_nfe: "35260712345678000199550010000000041000000044",
          tipo: "saida",
          cnpj_destinatario: "12345678909",
          valor_total: 250,
          data_emissao: "2026-07-15",
        },
        {
          id: "nfe-entrada",
          tipo: "entrada",
          valor_total: 999,
          data_emissao: "2026-07-15",
        },
      ],
      historicoReceita: [],
      mes: 7,
      ano: 2026,
      hojeISO: "2026-09-25",
    });

    assert.equal(bases.receitaMes, 250);
  });

  it("exclui NF-e com data de emissão futura da RBT12 e da receita (BUG-APUR-08)", async () => {
    const agora = new Date();
    const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
    const dataFutura = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
    // Competência = mês de amanhã (ainda aberto / futuro civil).
    const mesCompetencia = amanha.getMonth() + 1;
    const anoCompetencia = amanha.getFullYear();
    const hojeISO = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const mesFechadoDate = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const dataFechada = `${mesFechadoDate.getFullYear()}-${String(mesFechadoDate.getMonth() + 1).padStart(2, "0")}-15`;

    const bases = montarBasesCalculo({
      notas: [
      {
        id: "nfe-futura",
        chave_nfe: "35261200000000000000550010000000061000000060",
        tipo: "saida",
        valor_total: 50000,
        data_emissao: dataFutura,
      },
      {
        id: "nfe-ok",
        chave_nfe: "35250800000000000000550010000000071000000070",
        tipo: "saida",
        valor_total: 40000,
        data_emissao: dataFechada,
      },
      ],
      historicoReceita: [],
      mes: mesCompetencia,
      ano: anoCompetencia,
      hojeISO,
    });

    assert.equal(bases.receitaMes, 0);
    assert.equal(bases.rbt12, 40000);
    const excluida = bases.notasFiscais.excluidas.find((n) => n.id === "nfe-futura");
    assert.match(excluida.motivo, /data de emissão futura/i);
  });
});

describe("RBT12 proporcional no início de atividade (BUG-APUR-07)", () => {
  const HOJE = "2026-09-25";
  const notasSaida = (pares) => pares.map(([data_emissao, valor_total]) => ({ tipo: "saida", data_emissao, valor_total }));
  const tresMesesDe50k = notasSaida([["2026-06-15", 50000], ["2026-07-15", 50000], ["2026-08-15", 50000]]);

  it("2º/3º mês de atividade: média dos meses anteriores × 12 (cenário QA-F2 Inicio Atividade)", () => {
    const bases = montarBasesCalculo({
      notas: tresMesesDe50k,
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.rbt12Metodo, "proporcional_inicio_atividade");
    assert.equal(bases.mesesAtividade, 2);
    // Meses anteriores ao início não aparecem como "R$ 0,00" na composição.
    assert.deepEqual(bases.rbt12Mensal.map((item) => item.referencia), ["2026-06", "2026-07"]);

    const resultado = calcularSimplesNacional({ rbt12: bases.rbt12, receita_mes: bases.receitaMes, anexo: "I" });
    assert.equal(resultado.faixa_limite, 720000);
    assert.equal(resultado.valor_das, 3595);
  });

  it("1º mês de atividade: receita do próprio mês × 12", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-08-15", 50000]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-08-01",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    assert.equal(bases.mesesAtividade, 0);
    assert.equal(bases.rbt12Mensal.length, 0);
  });

  it("um único mês anterior: receita desse mês × 12", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-07-15", 40000], ["2026-08-15", 50000]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-07-20",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 480000);
    assert.equal(bases.mesesAtividade, 1);
  });

  it("arredonda só no final (média não exata)", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-05-10", 10000], ["2026-06-10", 10000], ["2026-07-10", 10000.01], ["2026-08-10", 1]]),
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-05-01",
      hojeISO: HOJE,
    });

    // (30000,01 / 3) × 12 = 120000,04 — arredondar a média antes daria 120000,00.
    assert.equal(bases.rbt12, 120000.04);
  });

  it("sem data_inicio_atividade mantém a janela de 12 meses (comportamento anterior)", () => {
    const bases = montarBasesCalculo({
      notas: tresMesesDe50k,
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: null,
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 100000);
    assert.equal(bases.rbt12Metodo, "janela_12_meses");
    assert.equal(bases.mesesAtividade, null);
    assert.equal(bases.rbt12Mensal.length, 12);
  });

  it("ignora histórico manual e NF-e anteriores ao início de atividade", () => {
    const bases = montarBasesCalculo({
      notas: notasSaida([["2026-05-10", 77777], ["2026-06-15", 50000], ["2026-07-15", 50000], ["2026-08-15", 50000]]),
      historicoReceita: [{ mes: 4, ano: 2026, receita: 88888 }],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.rbt12, 600000);
    const excluida = bases.notasFiscais.excluidas.find((nota) => nota.data_emissao === "2026-05-10");
    assert.match(excluida.motivo, /antes do início de atividade/);
  });

  it("recusa competência anterior ao início de atividade", () => {
    const bases = montarBasesCalculo({
      notas: [],
      historicoReceita: [],
      mes: 5,
      ano: 2026,
      dataInicioAtividade: "2026-06-10",
      hojeISO: HOJE,
    });

    assert.equal(bases.erro, "PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE");
  });

  it("recusa data_inicio_atividade malformada em vez de cair na janela cheia", () => {
    const bases = montarBasesCalculo({
      notas: [],
      historicoReceita: [],
      mes: 8,
      ano: 2026,
      dataInicioAtividade: "10/06/2026",
      hojeISO: HOJE,
    });

    assert.match(bases.erro, /início de atividade inválida/);
  });

  // Regressão dos cenários do QA-F (2ª passagem, 2026-09-25): com início há
  // ≥ 12 meses o resultado é idêntico ao de sem data de início.
  describe("início há ≥ 12 meses mantém os DAS do QA-F", () => {
    const mesesDe = (inicio, fim, valor) => {
      const linhas = [];
      for (let indice = inicio[0] * 12 + inicio[1] - 1; indice <= fim[0] * 12 + fim[1] - 1; indice += 1) {
        linhas.push([`${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}-15`, valor]);
      }
      return notasSaida(linhas);
    };
    const historicoComercio = [{ mes: 8, ano: 2025, receita: 20000 }, { mes: 9, ano: 2025, receita: 99999 }];
    const historicoAnexoIII = mesesDe([2025, 8], [2026, 7], 15000).map((nota) => ({
      ano: Number(nota.data_emissao.slice(0, 4)),
      mes: Number(nota.data_emissao.slice(5, 7)),
      receita: nota.valor_total,
    }));

    const cenarios = [
      { nome: "Comercio Anexo I 08/2026", notas: mesesDe([2025, 9], [2026, 8], 20000), historico: historicoComercio, mes: 8, anexo: "I", folha12: null, das: 965 },
      { nome: "Comercio Anexo I 07/2026", notas: mesesDe([2025, 9], [2026, 8], 20000), historico: historicoComercio, mes: 7, anexo: "I", folha12: null, das: 920 },
      { nome: "Servicos V FatorR 40", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 144000, das: 2580 },
      { nome: "Servicos V FatorR 16", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 60000, das: 5025 },
      { nome: "Servicos V FatorR 28", notas: mesesDe([2025, 8], [2026, 8], 30000), historico: [], mes: 8, anexo: "V", folha12: 100800, das: 2580 },
      { nome: "Anexo III So Historico", notas: notasSaida([["2026-08-15", 10000]]), historico: historicoAnexoIII, mes: 8, anexo: "III", folha12: null, das: 600 },
    ];

    for (const cenario of cenarios) {
      it(`${cenario.nome} → DAS ${cenario.das}`, () => {
        const calcular = (dataInicioAtividade) => {
          const bases = montarBasesCalculo({
            notas: cenario.notas,
            historicoReceita: cenario.historico,
            mes: cenario.mes,
            ano: 2026,
            dataInicioAtividade,
            hojeISO: HOJE,
          });
          const resultado = calcularSimplesNacional({
            rbt12: bases.rbt12,
            receita_mes: bases.receitaMes,
            anexo: cenario.anexo,
            folha12: cenario.folha12,
          });
          return { bases, resultado };
        };

        const comInicio = calcular("2024-01-15");
        const semInicio = calcular(null);

        assert.equal(comInicio.resultado.valor_das, cenario.das);
        assert.equal(semInicio.resultado.valor_das, cenario.das);
        assert.equal(comInicio.bases.rbt12, semInicio.bases.rbt12);
        assert.equal(comInicio.bases.rbt12Metodo, "janela_12_meses");
      });
    }
  });

});

describe("Unidade: falha do adaptador e custo de consultas (não prova banco/isolamento)", () => {
  it("500 quando o Supabase retorna erro", async () => {
    queue("apuracoes", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarApuracoes(reqAdmin(), res);

    assert.equal(res.statusCode, 500);
  });

  it("409 quando o adaptador devolve zero linhas no DELETE condicional", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });

  it("500 quando o banco falha no delete", async () => {
    queue("apuracoes", "maybeSingle", { data: { cliente_id: CLIENTE_A, status: "rascunho" }, error: null });
    queue("apuracoes", "maybeSingle", { data: null, error: { message: "timeout" } });

    const res = criarResposta();
    await excluirApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 500);
  });
});
