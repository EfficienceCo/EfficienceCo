import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  nomeArquivoDePath,
  montarListaArquivos,
  arquivosParaResposta,
  resolverArquivoDownload,
  nomeExibicaoHolerite,
  montarDescricaoConclusao,
  calcularTotaisProcessamento,
} from "../src/services/folha-status.helpers.js";

const CPF_EXEMPLO = "529.982.247-25";
const REGEX_CPF = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}|\d{11}/;
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const CLIENTE_B = "22222222-2222-2222-2222-222222222222";
const PROC_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
  };
}

function criarMockSupabase() {
  const filas = new Map();
  const storageDownloads = new Map();

  function chave(tabela, metodo) {
    return `${tabela}:${metodo}`;
  }

  return {
    clear() {
      filas.clear();
      storageDownloads.clear();
    },
    queue(tabela, metodo, resultado) {
      const k = chave(tabela, metodo);
      if (!filas.has(k)) filas.set(k, []);
      filas.get(k).push(resultado);
    },
    setStorageDownload(path, resultado) {
      storageDownloads.set(path, resultado);
    },
    from(tabela) {
      const consumir = (metodo, fallback = { data: null, error: null }) => {
        const k = chave(tabela, metodo);
        const fila = filas.get(k);
        if (!fila || fila.length === 0) return fallback;
        return fila.shift();
      };

      const builder = {
        select() {
          return builder;
        },
        insert() {
          return builder;
        },
        update() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(consumir("maybeSingle"));
        },
        single() {
          return Promise.resolve(consumir("single"));
        },
        then(resolve, reject) {
          return Promise.resolve(consumir("await")).then(resolve, reject);
        },
      };
      return builder;
    },
    storage: {
      from() {
        return {
          download(path) {
            return Promise.resolve(
              storageDownloads.get(path) || {
                data: null,
                error: { message: "not found" },
              },
            );
          },
        };
      },
    },
  };
}

describe("folha-status helpers", () => {
  it("extrai basename do path de storage", () => {
    assert.equal(
      nomeArquivoDePath("clientes/x/2026-07/p/holerites/holerite_a.pdf"),
      "holerite_a.pdf",
    );
    assert.equal(nomeArquivoDePath(null), null);
  });

  it("nome de exibição do holerite não carrega CPF (LGPD)", () => {
    const nome = nomeExibicaoHolerite({
      empresa: "Padaria do Zé",
      funcionario: "João da Silva",
      cpf: CPF_EXEMPLO,
    });

    assert.equal(nome, "holerite_padaria_do_ze_joao_da_silva.pdf");
    assert.doesNotMatch(nome, REGEX_CPF);
  });

  it("monta lista com id opaco + nome sem CPF e omite path na resposta pública", () => {
    const arquivos = montarListaArquivos(
      [
        {
          id: "calc-1",
          empresa: "Padaria",
          funcionario: "João",
          holerite_path: `a/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`,
        },
        { id: "calc-2", holerite_path: null },
      ],
      [{ id: "rel-1", arquivo_path: "a/relatorios/relatorio_fechamento_padaria_2026-07.pdf" }],
    );

    const resposta = arquivosParaResposta(arquivos);

    assert.deepEqual(resposta, [
      { id: "calc-1", nome: "holerite_padaria_joao.pdf", tipo: "holerite" },
      { id: "rel-1", nome: "relatorio_fechamento_padaria_2026-07.pdf", tipo: "relatorio" },
    ]);
    // Nada na resposta pública pode conter CPF nem o path de storage.
    assert.doesNotMatch(JSON.stringify(resposta), REGEX_CPF);
    assert.ok(resposta.every((a) => a.path === undefined));
  });

  it("resolve download só pelo id opaco, escopo do processamento, e rejeita traversal/CPF", () => {
    const path = `clientes/c/p/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`;
    const arquivos = montarListaArquivos(
      [{ id: "calc-1", empresa: "Padaria", funcionario: "João", holerite_path: path }],
      [],
    );

    assert.deepEqual(resolverArquivoDownload("calc-1", arquivos), {
      id: "calc-1",
      nome: "holerite_padaria_joao.pdf",
      tipo: "holerite",
      path,
    });
    // O nome do arquivo / CPF não são mais aceitos como identificador.
    assert.equal(resolverArquivoDownload("holerite_padaria_joao.pdf", arquivos), null);
    assert.equal(resolverArquivoDownload(CPF_EXEMPLO, arquivos), null);
    assert.equal(resolverArquivoDownload("../calc-1", arquivos), null);
    assert.equal(resolverArquivoDownload("holerites/calc-1", arquivos), null);
    assert.equal(resolverArquivoDownload("calc-2", arquivos), null);
  });

  it("monta descrição e totais de funcionários/empresas", () => {
    assert.equal(
      montarDescricaoConclusao(12, 3),
      "Folha processada — 12 funcionários, 3 empresas",
    );

    assert.deepEqual(
      calcularTotaisProcessamento([
        { empresa: "A" },
        { empresa: "A" },
        { empresa: "B" },
      ]),
      { total_funcionarios: 3, total_empresas: 2 },
    );
  });
});

describe("registrarEventoConclusaoFolha", () => {
  it("registra evento + notificação arquivo_processado na primeira vez", async () => {
    const { registrarEventoConclusaoFolha } = await import(
      "../src/services/folha-status.service.js"
    );

    const inserts = [];
    const notificacoes = [];
    let flag = false;

    const supabase = {
      from(tabela) {
        if (tabela === "processamentos_folha") {
          return {
            update(payload) {
              return {
                eq() {
                  return this;
                },
                select() {
                  if (flag) {
                    return Promise.resolve({ data: [], error: null });
                  }
                  flag = payload.evento_conclusao_registrado === true;
                  return Promise.resolve({
                    data: flag ? [{ id: PROC_ID }] : [],
                    error: null,
                  });
                },
              };
            },
          };
        }

        if (tabela === "eventos") {
          return {
            insert(row) {
              inserts.push(row);
              return Promise.resolve({ data: row, error: null });
            },
          };
        }

        throw new Error(`tabela inesperada: ${tabela}`);
      },
    };

    const resultado = await registrarEventoConclusaoFolha(
      supabase,
      {
        processamentoId: PROC_ID,
        clienteId: CLIENTE_A,
        totalFuncionarios: 5,
        totalEmpresas: 2,
      },
      {
        criarNotificacao: async (clienteId, tipo, mensagem) => {
          notificacoes.push({ clienteId, tipo, mensagem });
        },
      },
    );

    assert.equal(resultado.registrado, true);
    assert.equal(
      resultado.descricao,
      "Folha processada — 5 funcionários, 2 empresas",
    );
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].sucesso, true);
    assert.equal(notificacoes.length, 1);
    assert.equal(notificacoes[0].tipo, "arquivo_processado");
  });

  it("não duplica evento quando flag já foi reivindicada (idempotente)", async () => {
    const { registrarEventoConclusaoFolha } = await import(
      "../src/services/folha-status.service.js"
    );

    const inserts = [];
    const supabase = {
      from(tabela) {
        if (tabela === "processamentos_folha") {
          return {
            update() {
              return {
                eq() {
                  return this;
                },
                select() {
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        }
        if (tabela === "eventos") {
          return {
            insert(row) {
              inserts.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`tabela inesperada: ${tabela}`);
      },
    };

    const resultado = await registrarEventoConclusaoFolha(supabase, {
      processamentoId: PROC_ID,
      clienteId: CLIENTE_A,
      totalFuncionarios: 1,
      totalEmpresas: 1,
    });

    assert.equal(resultado.registrado, false);
    assert.equal(inserts.length, 0);
  });
});

describe("GET status e download (controllers)", () => {
  const mockDb = criarMockSupabase();
  let consultarStatusFolha;
  let baixarArquivoFolha;

  before(async () => {
    mock.module("../src/config/database.js", {
      defaultExport: mockDb,
    });

    const controller = await import("../src/controllers/folha.controller.js");
    consultarStatusFolha = controller.consultarStatusFolha;
    baixarArquivoFolha = controller.baixarArquivoFolha;
  });

  beforeEach(() => {
    mockDb.clear();
  });

  function reqBase(overrides = {}) {
    return {
      params: { processamento_id: PROC_ID, ...(overrides.params || {}) },
      usuario: {
        perfil: PERFIS.ADMIN_CLIENTE,
        cliente_id: CLIENTE_A,
      },
      body: {},
      query: {},
      ...overrides,
      params: { processamento_id: PROC_ID, ...(overrides.params || {}) },
    };
  }

  it("retorna 200 com status e arquivos quando concluido com saída", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "concluido",
        mes_referencia: "2026-07-01",
        motivo_erro: null,
      },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", {
      data: [
        {
          id: "calc-joao",
          empresa: "Padaria",
          funcionario: "João",
          holerite_path: `clientes/${CLIENTE_A}/2026-07/${PROC_ID}/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`,
        },
        {
          id: "calc-maria",
          empresa: "Padaria",
          funcionario: "Maria",
          holerite_path: `clientes/${CLIENTE_A}/2026-07/${PROC_ID}/holerites/holerite_padaria_maria_111.222.333-44_2026-07.pdf`,
        },
      ],
      error: null,
    });
    mockDb.queue("folha_relatorios", "await", {
      data: [
        {
          id: "rel-padaria",
          arquivo_path: `clientes/${CLIENTE_A}/2026-07/${PROC_ID}/relatorios/relatorio_fechamento_padaria_2026-07.pdf`,
        },
      ],
      error: null,
    });

    const res = criarRes();
    await consultarStatusFolha(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "concluido");
    assert.equal(res.body.total_funcionarios, 2);
    assert.equal(res.body.total_empresas, 1);
    assert.equal(res.body.arquivos.length, 3);
    assert.ok(res.body.arquivos.every((a) => a.id && a.nome && a.tipo && !a.path));
    // LGPD: nenhum CPF (nem path de storage) vaza na resposta do status.
    assert.doesNotMatch(JSON.stringify(res.body.arquivos), REGEX_CPF);
    assert.equal(
      res.body.arquivos.find((a) => a.id === "calc-joao").nome,
      "holerite_padaria_joao.pdf",
    );
  });

  it("retorna arquivos vazios quando concluido sem gerar-saida", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "concluido",
        mes_referencia: "2026-07-01",
        motivo_erro: null,
      },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", {
      data: [{ empresa: "A", holerite_path: null }],
      error: null,
    });
    mockDb.queue("folha_relatorios", "await", { data: [], error: null });

    const res = criarRes();
    await consultarStatusFolha(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.arquivos, []);
  });

  it("retorna 404 quando processamento não existe", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: null,
      error: null,
    });

    const res = criarRes();
    await consultarStatusFolha(reqBase(), res);
    assert.equal(res.statusCode, 404);
  });

  it("retorna 403 quando processamento é de outro cliente", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_B,
        status: "pendente",
        mes_referencia: "2026-07-01",
        motivo_erro: null,
      },
      error: null,
    });

    const res = criarRes();
    await consultarStatusFolha(reqBase(), res);
    assert.equal(res.statusCode, 403);
  });

  it("em erro inclui motivo_erro", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "erro",
        mes_referencia: "2026-07-01",
        motivo_erro: "Planilha com 2 linha(s) inválida(s)",
      },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", { data: [], error: null });
    mockDb.queue("folha_relatorios", "await", { data: [], error: null });

    const res = criarRes();
    await consultarStatusFolha(reqBase(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "erro");
    assert.match(res.body.motivo_erro, /inválida/);
  });

  it("bloqueia download quando status não é concluido", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "processando",
      },
      error: null,
    });

    const res = criarRes();
    await baixarArquivoFolha(
      reqBase({ params: { processamento_id: PROC_ID, arquivo: "h1.pdf" } }),
      res,
    );

    assert.equal(res.statusCode, 409);
  });

  it("faz download por id opaco e responde com nome de exibição sem CPF", async () => {
    const path = `clientes/${CLIENTE_A}/2026-07/${PROC_ID}/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`;

    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: {
        id: PROC_ID,
        cliente_id: CLIENTE_A,
        status: "concluido",
      },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", {
      data: [{ id: "calc-joao", empresa: "Padaria", funcionario: "João", holerite_path: path }],
      error: null,
    });
    mockDb.queue("folha_relatorios", "await", { data: [], error: null });
    mockDb.setStorageDownload(path, {
      data: {
        arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer,
      },
      error: null,
    });

    const res = criarRes();
    await baixarArquivoFolha(
      reqBase({
        params: { processamento_id: PROC_ID, arquivo: "calc-joao" },
      }),
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.match(res.headers["Content-Disposition"], /filename="holerite_padaria_joao\.pdf"/);
    assert.doesNotMatch(res.headers["Content-Disposition"], REGEX_CPF);
    assert.ok(Buffer.isBuffer(res.body));
  });

  it("rejeita download por nome de arquivo / CPF / traversal — só id opaco vale", async () => {
    async function tentar(arquivo) {
      mockDb.queue("processamentos_folha", "maybeSingle", {
        data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "concluido" },
        error: null,
      });
      mockDb.queue("folha_calculos", "await", {
        data: [
          {
            id: "calc-ok",
            empresa: "Padaria",
            funcionario: "João",
            holerite_path: `a/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`,
          },
        ],
        error: null,
      });
      mockDb.queue("folha_relatorios", "await", { data: [], error: null });

      const res = criarRes();
      await baixarArquivoFolha(
        reqBase({ params: { processamento_id: PROC_ID, arquivo } }),
        res,
      );
      return res.statusCode;
    }

    assert.equal(await tentar("holerite_padaria_joao.pdf"), 404);
    assert.equal(await tentar(CPF_EXEMPLO), 404);
    assert.equal(await tentar("../calc-ok"), 404);
    assert.equal(await tentar("holerites/calc-ok"), 404);
  });
});

describe("rotas de folha", () => {
  it("registra GET status e download sem sombrear /template", async () => {
    const { default: router } = await import("../src/routes/folha.routes.js");
    const rotas = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).sort(),
      }));

    assert.ok(rotas.some((r) => r.path === "/template" && r.methods.includes("get")));
    assert.ok(
      rotas.some((r) => r.path === "/:processamento_id" && r.methods.includes("get")),
    );
    assert.ok(
      rotas.some(
        (r) =>
          r.path === "/:processamento_id/download/:arquivo" &&
          r.methods.includes("get"),
      ),
    );

    const idxTemplate = rotas.findIndex((r) => r.path === "/template");
    const idxStatus = rotas.findIndex((r) => r.path === "/:processamento_id");
    assert.ok(idxTemplate < idxStatus);
  });
});
