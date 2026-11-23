/**
 * FOLHA-3 (#743) — o processamento só aparece como concluído quando cálculo E arquivos terminaram.
 * No banco: calculado = cálculo salvo, PDFs pendentes ou com falha; concluido = tudo pronto.
 */
import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { PERFIS } from "../src/config/perfis.js";
import {
  statusPublicoProcessamento,
  totalArquivosEsperados,
} from "../src/services/folha-status.helpers.js";

const PROC_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENTE = "11111111-1111-1111-1111-111111111111";

describe("statusPublicoProcessamento", () => {
  it("só 'concluido' sai concluído; calculado fica processando ou erro", () => {
    assert.equal(statusPublicoProcessamento("pendente", "pendente"), "pendente");
    assert.equal(statusPublicoProcessamento("processando", "pendente"), "processando");
    assert.equal(statusPublicoProcessamento("calculado", "pendente"), "processando");
    assert.equal(statusPublicoProcessamento("calculado", "erro"), "erro");
    assert.equal(statusPublicoProcessamento("concluido", "ok"), "concluido");
    assert.equal(statusPublicoProcessamento("erro", "pendente"), "erro");
  });
});

describe("totalArquivosEsperados", () => {
  it("1 holerite por funcionário + 1 relatório por empresa (15 funcionários, 2 empresas = 17)", () => {
    const calculos = Array.from({ length: 15 }, (_, i) => ({ empresa: i < 8 ? "Alfa" : "Beta" }));
    assert.equal(totalArquivosEsperados(calculos), 17);
  });
  it("sem cálculos, zero", () => {
    assert.equal(totalArquivosEsperados([]), 0);
  });
});

describe("GET /folha/:id durante e depois da geração dos PDFs (#743)", () => {
  const dados = { processamento: null, calculos: [], relatorios: [] };
  const banco = {
    from(tabela) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: dados.processamento, error: null }),
        then: (resolve, reject) => Promise.resolve({
          data: tabela === "folha_calculos" ? dados.calculos : dados.relatorios,
          error: null,
        }).then(resolve, reject),
      };
      return builder;
    },
  };
  let consultarStatusFolha;

  before(async () => {
    mock.module("../src/config/database.js", { defaultExport: banco });
    ({ consultarStatusFolha } = await import("../src/controllers/folha.controller.js"));
  });

  beforeEach(() => {
    dados.calculos = [
      { id: "c1", empresa: "Alfa", funcionario: "Ana", holerite_path: "p/a.pdf" },
      { id: "c2", empresa: "Alfa", funcionario: "Bia", holerite_path: null },
      { id: "c3", empresa: "Beta", funcionario: "Caio", holerite_path: null },
    ];
    dados.relatorios = [];
  });

  async function consultar(statusNoBanco, saidaStatus) {
    dados.processamento = {
      id: PROC_ID, cliente_id: CLIENTE, status: statusNoBanco, saida_status: saidaStatus,
      mes_referencia: "2026-10-01", motivo_erro: null,
    };
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await consultarStatusFolha(
      { params: { processamento_id: PROC_ID }, usuario: { perfil: PERFIS.ADMIN_EFFICIENCE } },
      res,
    );
    return res.body;
  }

  it("cálculo salvo e PDFs em andamento: não é concluído e mostra 1 de 5 arquivos", async () => {
    const corpo = await consultar("calculado", "pendente");
    assert.equal(corpo.status, "processando");
    assert.equal(corpo.total_arquivos_esperado, 5); // 3 holerites + 2 relatórios
    assert.equal(corpo.arquivos_gerados, 1);
  });

  it("falha na geração: um estado só, erro (nunca concluído com erro ao lado)", async () => {
    const corpo = await consultar("calculado", "erro");
    assert.equal(corpo.status, "erro");
    assert.equal(corpo.saida_status, "erro");
  });

  it("tudo pronto: concluído", async () => {
    dados.calculos = dados.calculos.map((c) => ({ ...c, holerite_path: `p/${c.id}.pdf` }));
    dados.relatorios = [{ id: "r1", arquivo_path: "p/r1.pdf" }, { id: "r2", arquivo_path: "p/r2.pdf" }];
    const corpo = await consultar("concluido", "ok");
    assert.equal(corpo.status, "concluido");
    assert.equal(corpo.arquivos_gerados, corpo.total_arquivos_esperado);
  });
});
