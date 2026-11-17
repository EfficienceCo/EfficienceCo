// TEST-DAS-2: somente falhas do adaptador/custo de consultas.
// HTTP/JWT/RLS/isolamento/persistência estão em apuracao-http.test.js.
import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supabase from "../src/config/database.js";
import {
  aprovarApuracao,
  atualizarApuracoesAposFolha,
  listarFolhaPendente,
  recalcularApuracao,
} from "../src/controllers/apuracoes.controller.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const APURACAO_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// Mock de supabase — mesmo padrão de apuracoes.test.js
// ---------------------------------------------------------------------------

const originalFrom = supabase.from;
const filas = new Map();
const operacoes = [];
const chamadasPorTabela = new Map();
// Páginas pedidas (range) por tabela: [tabela, início, fim].
const intervalos = [];
function chave(t, m) {
  return `${t}:${m}`;
}
function queue(tabela, metodo, resultado) {
  const k = chave(tabela, metodo);
  if (!filas.has(k)) filas.set(k, []);
  filas.get(k).push(resultado);
}
function chamadasTabela(tabela) {
  return chamadasPorTabela.get(tabela) || 0;
}

supabase.from = function (tabela) {
  chamadasPorTabela.set(tabela, (chamadasPorTabela.get(tabela) || 0) + 1);
  const consumir = (metodo, fallback) => {
    const k = chave(tabela, metodo);
    const fila = filas.get(k);
    if (!fila || fila.length === 0) return fallback;
    return fila.shift();
  };
  const builder = {
    select() {
      return builder;
    },
    insert(payload) {
      operacoes.push({ tabela, metodo: "insert", payload });
      return builder;
    },
    update(payload) {
      operacoes.push({ tabela, metodo: "update", payload });
      return builder;
    },
    eq() {
      return builder;
    },
    not() {
      return builder;
    },
    or() {
      return builder;
    },
    gte() {
      return builder;
    },
    lte() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    range(inicio, fim) {
      intervalos.push([tabela, inicio, fim]);
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(consumir("maybeSingle", { data: null, error: null }));
    },
    single() {
      return Promise.resolve(consumir("single", { data: null, error: null }));
    },
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
  chamadasPorTabela.clear();
  intervalos.length = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criarResposta() {
  return {
    statusCode: null,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
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

function tokenLicencaValido(clienteId = CLIENTE_A) {
  queue("licencas", "single", {
    data: { cliente_id: clienteId, ativa: true, validade: null },
    error: null,
  });
}

function reqAgente({ headers = {}, params = {}, body = {} } = {}) {
  return { headers, params, body };
}

function queueCliente(overrides = {}) {
  queue("clientes", "maybeSingle", { data: { historico_receita: [], ...overrides }, error: null });
}

function queueNotas(linhas = []) {
  queue("lancamentos_fiscais", "await", { data: linhas, error: null });
}

// Relatório gravado antes do #738 (só trocava o status): sem falhaUpload nem
// processamentoPendente, a linha segue na fila pedindo a janela.
const RELATORIO_ANTIGO = { temDozeMeses: false, mesesEncontrados: [], totalMesesEncontrados: 0 };

// Janela de folha da apuração de 10/2026: 10/2025 a 09/2026.
const JANELA_10_2026 = Array.from({ length: 12 }, (_, i) => {
  const n = 2025 * 12 + 9 + i;
  return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, "0")}`;
});
// Processamentos dos 12 meses: 11 concluídos e 09/2026, o mais recente, na
// situação pedida (criado_em decrescente, como a consulta).
function processamentosJanela(statusSetembro) {
  return JANELA_10_2026.map((ref, i) => ({
    id: `proc-${ref}`, mes_referencia: `${ref}-01`, criado_em: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    status: ref === "2026-09" ? statusSetembro : "concluido",
  })).reverse();
}



describe("Unidade: falha do adaptador e custo de consultas (não prova banco/isolamento)", () => {
  it("200 com lista vazia quando não há apurações pendentes (sem query desnecessária em clientes)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", { data: [], error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(chamadasTabela("clientes"), 0);
  });

  it("busca o nome do cliente em uma única query mesmo com várias apurações pendentes (sem N+1)", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      // Com relatório do agente: sem ele a linha não entra na fila (DAS-3).
      data: [
        { id: "apuracao-1", cliente_id: CLIENTE_A, periodo_mes: 1, periodo_ano: 2026, dados_folha: RELATORIO_ANTIGO },
        { id: "apuracao-2", cliente_id: CLIENTE_A, periodo_mes: 2, periodo_ano: 2026, dados_folha: RELATORIO_ANTIGO },
      ],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade" }, error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body.every((item) => item.nomeEmpresa === "Souza Contabilidade"), true);
    assert.equal(chamadasTabela("clientes"), 1);
  });

  it("500 quando a consulta de apurações falha", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 500);
  });

  it("500 quando a busca do nome do cliente falha", async () => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      data: [{ id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 3, periodo_ano: 2026, dados_folha: RELATORIO_ANTIGO }],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: null, error: { message: "falha" } });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 500);
  });

  // DAS-3: a falha de envio que uma planilha nova já substituiu sai da fila
  // pela folha viva, depois da consulta. O limite da fila vale depois desse
  // filtro: as linhas que saem não tomam o lugar da que o agente precisa ver.
  it("fila: o limite vale depois de tirar as linhas cuja falha uma planilha nova já substituiu", async () => {
    tokenLicencaValido(CLIENTE_A);
    const falha = (marco) => ({ temDozeMeses: false, mesesEncontrados: [{ ano: 2026, mes: 9 }], totalMesesEncontrados: 1, falhaUpload: true,
      mesesComFalha: [{ ano: 2026, mes: 9 }], marcosFalha: { "2026-09": marco }, processamentoPendente: true, mesesPendentes: ["2026-09"] });
    // A planilha de 09/2026 em processamento foi criada depois destas 50 falhas.
    const substituidas = Array.from({ length: 50 }, (_, i) => ({
      id: `apuracao-${String(i + 1).padStart(2, "0")}`, cliente_id: CLIENTE_A, periodo_mes: 10, periodo_ano: 2026,
      status: "rascunho", fator_r: 0.1, atualizado_em: "2026-10-20T00:00:05Z", dados_folha: falha("2026-10-20T00:00:00Z"),
    }));
    // Nesta, ela já existia quando a falha foi registrada (marco): não a substitui.
    const comFalha = {
      id: "apuracao-51", cliente_id: CLIENTE_A, periodo_mes: 10, periodo_ano: 2026, status: "rascunho", fator_r: 0.1,
      atualizado_em: "2026-11-01T00:00:05Z", dados_folha: falha("2026-11-01T00:00:00Z"),
    };
    queue("apuracoes", "await", { data: [...substituidas, comFalha], error: null });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade", data_inicio_atividade: null }, error: null });
    queue("processamentos_folha", "await", { data: [{ id: "proc-09", mes_referencia: "2026-09-01", criado_em: "2026-11-01T00:00:00Z", status: "pendente" }], error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((item) => [item.id, item.mesesFolha]), [["apuracao-51", [{ ano: 2026, mes: 9 }]]]);
  });

  // DAS-3: o agente faz poll a cada 30 s. Sem relatório do agente, a folha
  // viva só deixa a linha "pendente" com uma planilha já recebida e não
  // concluída, e fora disso ela é "verificado": nos dois casos não há o que
  // pedir ao agente, nem quando o gravado ficou "pendente" porque o gancho do
  // fim do pipeline falhou. A folha dessas linhas nem é lida.
  const filaSemRelatorio = async (statusSetembro) => {
    tokenLicencaValido(CLIENTE_A);
    queue("apuracoes", "await", {
      data: [{ id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 10, periodo_ano: 2026, status: "rascunho", fator_r: 0.1, dados_folha: null }],
      error: null,
    });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade", data_inicio_atividade: null }, error: null });
    queue("processamentos_folha", "await", { data: processamentosJanela(statusSetembro), error: null });
    // Linhas de cálculo, caso a fila as lesse.
    queue("folha_calculos", "await", { data: [{ processamento_id: "proc-2026-08", base_calculo: 5000, fgts: 400 }], error: null });
    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(chamadasTabela("processamentos_folha"), 0);
    assert.equal(chamadasTabela("folha_calculos"), 0);
    return res.body.map((item) => item.id);
  };

  it("fila: sem relatório e com um mês em erro, a linha sai sem ler a folha", async () => {
    assert.deepEqual(await filaSemRelatorio("erro"), []);
  });

  it("fila: sem relatório, gravada 'pendente' e com os 12 meses concluídos (gancho que falhou), a linha sai sem ler a folha", async () => {
    assert.deepEqual(await filaSemRelatorio("concluido"), []);
  });

  // Revisor 5, item 1: a fila lê as candidatas em páginas de 1.000 (o
  // PostgREST corta a resposta nesse tamanho). A linha com falha de envio na
  // 2ª página não pode sumir atrás de 1.000 linhas que saem da fila depois da
  // consulta.
  it("fila: pagina as candidatas e acha na 2ª página a linha com falha de envio", async () => {
    tokenLicencaValido(CLIENTE_A);
    const primeiraPagina = Array.from({ length: 1000 }, (_, i) => ({
      id: `apuracao-${String(i).padStart(4, "0")}`, cliente_id: CLIENTE_A, periodo_mes: 10, periodo_ano: 2026,
      status: "rascunho", fator_r: 0.1, dados_folha: null, atualizado_em: "2026-11-01T00:00:05Z",
    }));
    const comFalha = {
      id: "apuracao-segunda-pagina", cliente_id: CLIENTE_A, periodo_mes: 10, periodo_ano: 2026, status: "rascunho", fator_r: 0.1,
      atualizado_em: "2026-11-01T00:00:05Z",
      // A folha de 09/2026 no sistema é a do marco (anterior à falha): a falha
      // continua vigente.
      dados_folha: {
        temDozeMeses: true, mesesEncontrados: JANELA_10_2026.map((ref) => ({ ano: Number(ref.slice(0, 4)), mes: Number(ref.slice(5)) })),
        totalMesesEncontrados: 12, falhaUpload: true, mesesComFalha: [{ ano: 2026, mes: 9 }],
        marcosFalha: { "2026-09": "2026-10-12T00:00:00Z" }, processamentoPendente: true, mesesPendentes: ["2026-09"],
      },
    };
    queue("apuracoes", "await", { data: primeiraPagina, error: null });
    queue("apuracoes", "await", { data: [comFalha], error: null });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade", data_inicio_atividade: null }, error: null });
    queue("processamentos_folha", "await", { data: processamentosJanela("concluido"), error: null });

    const res = criarResposta();
    await listarFolhaPendente(reqAgente({ headers: { "x-licenca-token": "token-valido" } }), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((item) => [item.id, item.mesesFolha]), [["apuracao-segunda-pagina", [{ ano: 2026, mes: 9 }]]]);
    assert.deepEqual(intervalos.filter(([tabela]) => tabela === "apuracoes"), [["apuracoes", 0, 999], ["apuracoes", 1000, 1999]]);
    // A falha de envio sai do criado_em e da situação dos processamentos: as
    // linhas de folha_calculos não são lidas a cada poll.
    assert.equal(chamadasTabela("folha_calculos"), 0);
  });

  // Revisor 6, item 5: com um mês da janela não concluído, folhaDaJanela não
  // calcula a FS12, então as linhas de folha_calculos (funcionários × meses)
  // não são lidas, nem na aprovação nem no gancho do upload.
  const linhaVerificada = {
    id: APURACAO_ID, cliente_id: CLIENTE_A, status: "rascunho", periodo_mes: 10, periodo_ano: 2026,
    folha_status: "verificado", fator_r: 0.54, folha12: 64800, anexo: "III", rbt12_usado: 120000, receita_mes: 10000,
    aliquota_efetiva: 0.06, valor_calculado: 600, atualizado_em: "2026-11-01T00:00:05Z", dados_folha: null,
  };
  // Linhas de cálculo dos 12 meses, caso fossem lidas.
  const calculosJanela = () => queue("folha_calculos", "await", {
    data: JANELA_10_2026.map((ref) => ({ processamento_id: `proc-${ref}`, base_calculo: 5000, fgts: 400 })), error: null,
  });

  it("aprovação com 09/2026 pendente: 409 com o motivo e os meses, sem ler folha_calculos", async () => {
    queue("apuracoes", "maybeSingle", { data: linhaVerificada, error: null });
    queue("clientes", "maybeSingle", { data: { data_inicio_atividade: null }, error: null });
    queue("processamentos_folha", "await", { data: processamentosJanela("pendente"), error: null });
    calculosJanela();

    const res = criarResposta();
    await aprovarApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      erro: "FOLHA_PENDENTE",
      motivo: "A folha ainda aguarda confirmação ou processamento. Meses pendentes: 2026-09.",
      mesesPendentes: ["2026-09"],
    });
    assert.equal(chamadasTabela("folha_calculos"), 0);
    assert.deepEqual(operacoes.filter((op) => op.metodo === "update"), []);
  });

  it("gancho do upload com o mês recém-enviado pendente: a apuração fica pendente sem ler folha_calculos", async () => {
    queue("apuracoes", "await", { data: [linhaVerificada], error: null });
    queue("clientes", "maybeSingle", { data: { nome: "Souza Contabilidade", historico_receita: [], data_inicio_atividade: null }, error: null });
    queue("processamentos_folha", "await", { data: processamentosJanela("pendente"), error: null });
    calculosJanela();
    queue("apuracoes", "maybeSingle", { data: { ...linhaVerificada, folha_status: "pendente" }, error: null });

    await atualizarApuracoesAposFolha(CLIENTE_A, "2026-09-01");

    assert.deepEqual(operacoes.filter((op) => op.metodo === "update").map((op) => op.payload), [{ folha_status: "pendente", dados_folha: null }]);
    assert.equal(chamadasTabela("folha_calculos"), 0);
  });

  it("409 quando o adaptador devolve zero linhas no UPDATE condicional de recálculo", async () => {
    queue("apuracoes", "maybeSingle", { data: { id: APURACAO_ID, cliente_id: CLIENTE_A, periodo_mes: 8, periodo_ano: 2026, status: "rascunho", anexo: "I", fator_r: null }, error: null });
    queueCliente();
    queueNotas([{ valor_total: 10000, data_emissao: "2026-08-10", tipo: "saida" }]);
    queue("apuracoes", "maybeSingle", { data: null, error: null });

    const res = criarResposta();
    await recalcularApuracao(reqAdmin({ params: { id: APURACAO_ID } }), res);

    assert.equal(res.statusCode, 409);
  });
});
