import { describe, it, before, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  montarListaArquivos,
  arquivosParaResposta,
  resolverPathDownload,
  calcularTotaisProcessamento,
} from "../src/services/folha-status.helpers.js";
import { PERFIS } from "../src/config/perfis.js";

const CLIENTE_A = "11111111-1111-1111-1111-111111111111";
const PROC_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function criarMockSupabase() {
  const filas = new Map();
  const ultimosUpdates = new Map();

  function chave(tabela, metodo) {
    return `${tabela}:${metodo}`;
  }

  return {
    clear() {
      filas.clear();
      ultimosUpdates.clear();
    },
    ultimoUpdate(tabela) {
      return ultimosUpdates.get(tabela);
    },
    queue(tabela, metodo, resultado) {
      const k = chave(tabela, metodo);
      if (!filas.has(k)) filas.set(k, []);
      filas.get(k).push(resultado);
    },
    restantes() {
      let total = 0;
      for (const fila of filas.values()) total += fila.length;
      return total;
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
        update(payload) {
          ultimosUpdates.set(tabela, payload);
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
          download() {
            return Promise.resolve({
              data: { arrayBuffer: async () => new ArrayBuffer(0) },
              error: null,
            });
          },
          upload() {
            const fila = filas.get(chave("storage", "upload"));
            if (fila && fila.length > 0) return Promise.resolve(fila.shift());
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

describe("dispararPipelineAutomatico (BK-FOLHA-AUTO-PIPELINE)", () => {
  const mockDb = criarMockSupabase();
  let dispararPipelineAutomatico;
  let gerarSaidaFolha;
  let erroLog;

  before(async () => {
    mock.module("../src/config/database.js", { defaultExport: mockDb });

    mock.module("../src/services/folha.service.js", {
      namedExports: {
        gerarTemplateFolha: async () => Buffer.from(""),
        validarColunasPlanilha: async () => ({ valido: true, faltando: [] }),
        lerLinhasPlanilha: async () => ({
          linhas: [{ empresa: "Padaria", funcionario: "João", cpf: "111.111.111-11" }],
          erros: [],
        }),
        calcularFolhaFuncionario: (linha) => ({
          empresa: linha.empresa,
          funcionario: linha.funcionario,
          cpf: linha.cpf,
          salario_bruto: 3000,
          inss: 300,
          fgts: 240,
          ir: 100,
          liquido: 2600,
        }),
        gerarHoleritePDF: async () => Buffer.from("holerite"),
        gerarRelatorioFechamentoPDF: async () => Buffer.from("relatorio"),
        calcularTotaisEmpresa: () => ({
          totalFuncionarios: 1,
          totalBruto: 3000,
          totalEncargos: 640,
          totalLiquido: 2600,
        }),
      },
    });

    mock.module("../src/services/folha-status.service.js", {
      namedExports: {
        // Reaproveita os helpers reais (não são o foco deste teste) e só troca
        // registrarEventoConclusaoFolha, que sozinho faria mais chamadas ao supabase
        // sem relação nenhuma com a orquestração do pipeline sendo testada aqui.
        montarListaArquivos,
        arquivosParaResposta,
        resolverPathDownload,
        calcularTotaisProcessamento,
        registrarEventoConclusaoFolha: async () => ({ registrado: true, descricao: "ok" }),
      },
    });

    const controller = await import("../src/controllers/folha.controller.js");
    dispararPipelineAutomatico = controller.dispararPipelineAutomatico;
    gerarSaidaFolha = controller.gerarSaidaFolha;
  });

  beforeEach(() => {
    mockDb.clear();
    erroLog = mock.method(console, "error", () => {});
  });

  afterEach(() => {
    erroLog.mock.restore();
  });

  it("upload concluído → calcula e gera saída sozinho, sem chamada manual", async () => {
    // calcularFolha: busca processamento
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "pendente", arquivo_origem_path: "x.xlsx" },
      error: null,
    });
    // calcularFolha: reivindica (pendente/erro -> processando)
    mockDb.queue("processamentos_folha", "await", { data: [{ id: PROC_ID }], error: null });
    // calcularFolha: insert de folha_calculos
    mockDb.queue("folha_calculos", "await", { data: null, error: null });
    // calcularFolha: marca concluido
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    // gerarSaidaFolha: busca processamento (já concluído pelo passo acima)
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "concluido", mes_referencia: "2026-07-01" },
      error: null,
    });
    // gerarSaidaFolha: select dos cálculos persistidos
    mockDb.queue("folha_calculos", "await", {
      data: [
        { id: "calc-1", empresa: "Padaria", funcionario: "João", cpf: "111.111.111-11", holerite_path: null },
      ],
      error: null,
    });
    // gerarSaidaFolha: registra holerite_path
    mockDb.queue("folha_calculos", "await", { data: null, error: null });
    // gerarSaidaFolha: checa relatório existente (não existe ainda)
    mockDb.queue("folha_relatorios", "maybeSingle", { data: null, error: null });
    // gerarSaidaFolha: insere relatório
    mockDb.queue("folha_relatorios", "await", { data: null, error: null });
    // finalizarGeracaoSaida: sucesso -> grava saida_status "ok" (#440)
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    await dispararPipelineAutomatico(PROC_ID);

    assert.equal(erroLog.mock.callCount(), 0, "não deveria logar erro no caminho feliz");
    assert.equal(mockDb.restantes(), 0, "todas as etapas do pipeline (calc + saída) devem ter sido consumidas");

    const ultimoUpdate = mockDb.ultimoUpdate("processamentos_folha");
    assert.equal(ultimoUpdate.saida_status, "ok");
    assert.equal(ultimoUpdate.motivo_erro, null);
  });

  it("cálculo falha → geração de saída não roda e falha fica registrada", async () => {
    // calcularFolha: busca processamento
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "pendente", arquivo_origem_path: "x.xlsx" },
      error: null,
    });
    // calcularFolha: reivindica com sucesso
    mockDb.queue("processamentos_folha", "await", { data: [{ id: PROC_ID }], error: null });
    // calcularFolha: insert falha
    mockDb.queue("folha_calculos", "await", { data: null, error: { message: "insert falhou" } });
    // marcarErro (chamado dentro de calcularFolha ao falhar o insert)
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    await dispararPipelineAutomatico(PROC_ID);

    // Nenhuma fila de gerarSaidaFolha (segundo maybeSingle de processamentos_folha,
    // select/update de folha_calculos, select/insert de folha_relatorios) foi
    // consumida — prova que a geração de saída não rodou após a falha do cálculo.
    assert.equal(mockDb.restantes(), 0);
    // calcularFolha já loga o próprio erro de insert; o que importa pro pipeline é que
    // ELE loga a decisão de não seguir pra geração de saída — não o total de logs.
    const logsDoPipeline = erroLog.mock.calls.filter((c) =>
      String(c.arguments[0]).includes("[folha.pipeline]"),
    );
    assert.equal(logsDoPipeline.length, 1);
    assert.match(logsDoPipeline[0].arguments[0], /Cálculo automático não concluído/);
  });

  it("geração de saída falha → status continua concluido (retry idempotente continua possível), motivo fica registrado e saida_status vira erro", async () => {
    // calcularFolha: sucesso completo (mesma sequência do caminho feliz)
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "pendente", arquivo_origem_path: "x.xlsx" },
      error: null,
    });
    mockDb.queue("processamentos_folha", "await", { data: [{ id: PROC_ID }], error: null });
    mockDb.queue("folha_calculos", "await", { data: null, error: null });
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    // gerarSaidaFolha: busca processamento concluído
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "concluido", mes_referencia: "2026-07-01" },
      error: null,
    });
    // gerarSaidaFolha: select dos cálculos persistidos
    mockDb.queue("folha_calculos", "await", {
      data: [
        { id: "calc-1", empresa: "Padaria", funcionario: "João", cpf: "111.111.111-11", holerite_path: null },
      ],
      error: null,
    });
    // upload do holerite falha (ex: erro transitório de storage)
    mockDb.queue("storage", "upload", { error: { message: "falha ao subir holerite" } });
    // dispararPipelineAutomatico deve registrar o motivo sem mudar o status
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    await dispararPipelineAutomatico(PROC_ID);

    assert.equal(mockDb.restantes(), 0, "o UPDATE de motivo_erro deveria ter sido a última etapa consumida");

    const ultimoUpdate = mockDb.ultimoUpdate("processamentos_folha");
    assert.ok(ultimoUpdate, "deveria ter chamado update em processamentos_folha");
    assert.equal(ultimoUpdate.status, undefined, "status não pode ser sobrescrito — senão o retry via /gerar-saida fica bloqueado pelo guard de status");
    assert.match(ultimoUpdate.motivo_erro, /holerite/);
    assert.equal(ultimoUpdate.saida_status, "erro", "saida_status precisa distinguir a falha independente de status (#440)");

    const logsDoPipeline = erroLog.mock.calls.filter((c) =>
      String(c.arguments[0]).includes("[folha.pipeline]"),
    );
    assert.equal(logsDoPipeline.length, 1);
    assert.match(logsDoPipeline[0].arguments[0], /Geração de saída automática não concluída/);
  });

  // Cobre o caminho HTTP direto (POST /:id/gerar-saida) — o retry manual que o usuário
  // aciona pelo botão "tentar novamente". Antes desta suíte, só dispararPipelineAutomatico
  // exercitava gerarSaidaFolha/executarEFinalizarSaida; um bug específico do retry manual
  // (ex: processamentoId errado, ou o flag tentativaDeGeracaoIniciada não sendo setado)
  // passaria despercebido.
  function reqRetry(overrides = {}) {
    return {
      params: { processamento_id: PROC_ID },
      usuario: { perfil: PERFIS.ADMIN_CLIENTE, cliente_id: CLIENTE_A },
      body: {},
      query: {},
      ...overrides,
    };
  }

  it("retry manual (POST /:id/gerar-saida) tem sucesso → grava saida_status ok", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "concluido", mes_referencia: "2026-07-01" },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", {
      data: [
        { id: "calc-1", empresa: "Padaria", funcionario: "João", cpf: "111.111.111-11", holerite_path: null },
      ],
      error: null,
    });
    mockDb.queue("folha_calculos", "await", { data: null, error: null });
    mockDb.queue("folha_relatorios", "maybeSingle", { data: null, error: null });
    mockDb.queue("folha_relatorios", "await", { data: null, error: null });
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    const res = criarRes();
    await gerarSaidaFolha(reqRetry(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(mockDb.restantes(), 0);

    const ultimoUpdate = mockDb.ultimoUpdate("processamentos_folha");
    assert.equal(ultimoUpdate.saida_status, "ok");
    assert.equal(ultimoUpdate.motivo_erro, null);
  });

  it("retry manual (POST /:id/gerar-saida) falha → grava saida_status erro sem mudar status", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "concluido", mes_referencia: "2026-07-01" },
      error: null,
    });
    mockDb.queue("folha_calculos", "await", {
      data: [
        { id: "calc-1", empresa: "Padaria", funcionario: "João", cpf: "111.111.111-11", holerite_path: null },
      ],
      error: null,
    });
    mockDb.queue("storage", "upload", { error: { message: "falha ao subir holerite" } });
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    const res = criarRes();
    await gerarSaidaFolha(reqRetry(), res);

    assert.equal(res.statusCode, 500);
    assert.equal(mockDb.restantes(), 0);

    const ultimoUpdate = mockDb.ultimoUpdate("processamentos_folha");
    assert.equal(ultimoUpdate.status, undefined);
    assert.equal(ultimoUpdate.saida_status, "erro");
    assert.match(ultimoUpdate.motivo_erro, /holerite/);
  });

  it("retry manual bloqueado por guard (cálculo ainda não concluído) não mexe em saida_status", async () => {
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: { id: PROC_ID, cliente_id: CLIENTE_A, status: "processando", mes_referencia: "2026-07-01" },
      error: null,
    });

    const res = criarRes();
    await gerarSaidaFolha(reqRetry(), res);

    assert.equal(res.statusCode, 409);
    assert.equal(mockDb.restantes(), 0, "guard de status não deveria disparar nenhuma escrita em saida_status");
    assert.equal(mockDb.ultimoUpdate("processamentos_folha"), undefined);
  });

  it("retry manual: erro de infra ao buscar o processamento também grava saida_status erro", async () => {
    // erroBusca (500) acontece ANTES de qualquer guard de autorização/estado — não é um
    // guard, é uma falha de verdade, então precisa ser registrada (diferente dos guards
    // 403/404/409 acima, que não mexem em saida_status).
    mockDb.queue("processamentos_folha", "maybeSingle", {
      data: null,
      error: { message: "timeout de conexão" },
    });
    mockDb.queue("processamentos_folha", "await", { data: null, error: null });

    const res = criarRes();
    await gerarSaidaFolha(reqRetry(), res);

    assert.equal(res.statusCode, 500);
    assert.equal(mockDb.restantes(), 0);

    const ultimoUpdate = mockDb.ultimoUpdate("processamentos_folha");
    assert.equal(ultimoUpdate.saida_status, "erro");
    assert.match(ultimoUpdate.motivo_erro, /buscar processamento/);
  });
});
