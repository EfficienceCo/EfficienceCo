/**
 * FOLHA-2 (#742) — o contador precisa ver QUAIS linhas da planilha estão erradas e por quê.
 * Usa o service real (planilhas .xlsx de verdade) e só troca o banco por um registro de chamadas.
 */
import { describe, it, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PERFIS } from "../src/config/perfis.js";
import {
  COLUNAS_FOLHA,
  gerarTemplateFolha,
  validarColunasPlanilha,
} from "../src/services/folha.service.js";

const PROC_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENTE = "11111111-1111-1111-1111-111111111111";

const LINHA_OK = {
  empresa: "Padaria", funcionario: "Maria Silva", cpf: "529.982.247-25", cargo: "Caixa",
  salario_bruto: 3000, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0,
  num_dependentes: 0, vale_transporte: false,
};

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map((c) => c.header));
  for (const linha of linhas) ws.addRow(COLUNAS_FOLHA.map((c) => linha[c.key]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Registro de chamadas: guarda todo update por tabela e devolve o que o teste configurar.
function criarBanco() {
  const banco = {
    updates: [],
    processamento: null,
    arquivo: null,
    from(tabela) {
      const builder = {
        select: () => builder,
        insert: () => builder,
        update(payload) {
          banco.updates.push({ tabela, payload });
          return builder;
        },
        eq: () => builder,
        in: () => builder,
        maybeSingle: () => Promise.resolve({ data: banco.processamento, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: [{ id: PROC_ID }], error: null }).then(resolve, reject),
      };
      return builder;
    },
    storage: {
      from: () => ({
        download: () => Promise.resolve({
          data: { arrayBuffer: async () => banco.arquivo },
          error: null,
        }),
      }),
    },
  };
  return banco;
}

function criarRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe("validarColunasPlanilha — arquivo inválido e planilha vazia (#742)", () => {
  it("bytes que não são xlsx: motivo próprio, sem fingir que faltam todas as colunas", async () => {
    const r = await validarColunasPlanilha(Buffer.from("a,b,c\n1,2,3\n"));
    assert.equal(r.valido, false);
    assert.equal(r.motivo, "arquivo não é uma planilha .xlsx válida");
    assert.deepEqual(r.faltando, []);
  });

  it("modelo baixado e enviado sem nenhuma linha preenchida: motivo próprio", async () => {
    const r = await validarColunasPlanilha(Buffer.from(await gerarTemplateFolha()));
    assert.equal(r.valido, false);
    assert.match(r.motivo, /não tem nenhuma linha de dado preenchida/);
  });

  it("coluna faltando segue sem motivo: o controller usa a mensagem de colunas", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Folha");
    ws.addRow(COLUNAS_FOLHA.filter((c) => c.key !== "cpf").map((c) => c.header));
    ws.addRow(["x"]);
    const r = await validarColunasPlanilha(Buffer.from(await wb.xlsx.writeBuffer()));
    assert.equal(r.valido, false);
    assert.deepEqual(r.faltando, ["cpf"]);
    assert.equal(r.motivo, undefined);
  });

  it("planilha com uma linha preenchida é válida", async () => {
    const r = await validarColunasPlanilha(await planilha([LINHA_OK]));
    assert.equal(r.valido, true);
  });
});

describe("erros por linha chegam ao GET /folha/:id (#742)", () => {
  const banco = criarBanco();
  let calcularFolha;
  let consultarStatusFolha;

  before(async () => {
    mock.module("../src/config/database.js", { defaultExport: banco });
    ({ calcularFolha, consultarStatusFolha } = await import("../src/controllers/folha.controller.js"));
  });

  beforeEach(() => {
    banco.updates = [];
    banco.processamento = {
      id: PROC_ID, cliente_id: CLIENTE, status: "pendente",
      arquivo_origem_path: "x.xlsx", mes_referencia: "2026-10-01",
    };
    mock.method(console, "error", () => {});
  });

  const req = { params: { processamento_id: PROC_ID }, usuario: { perfil: PERFIS.ADMIN_EFFICIENCE } };

  async function calcularCom(linhas) {
    const buf = await planilha(linhas);
    banco.arquivo = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return calcularFolha(req, criarRes());
  }

  it("linhas inválidas: cada erro fica guardado com número da linha e motivo", async () => {
    const res = await calcularCom([
      LINHA_OK,
      { ...LINHA_OK, funcionario: "José", cpf: "123.456.789-00", vale_transporte: "SIMM" },
      { ...LINHA_OK, funcionario: "Ana", cpf: "111.444.777-35", salario_bruto: -100 },
    ]);

    assert.equal(res.statusCode, 422);
    const gravado = banco.updates.find((u) => u.payload.status === "erro").payload;
    assert.equal(gravado.motivo_erro, "Planilha com 2 linha(s) inválida(s)");
    assert.deepEqual(gravado.erros_planilha.map((e) => e.linha), [3, 4]);
    assert.ok(gravado.erros_planilha[0].motivos.includes("cpf inválido"));
    assert.ok(gravado.erros_planilha[0].motivos.some((m) => /vale_transporte inválido; valores aceitos/.test(m)));
    assert.ok(gravado.erros_planilha[1].motivos.includes("salario_bruto deve ser maior que zero") ||
      gravado.erros_planilha[1].motivos.some((m) => /salario_bruto/.test(m)));
  });

  it("planilha sem linha de dado que chegou ao pipeline: a mensagem real, não '1 linha(s) inválida(s)'", async () => {
    await calcularCom([]);
    const gravado = banco.updates.find((u) => u.payload.status === "erro").payload;
    assert.match(gravado.motivo_erro, /não tem nenhuma linha de dado preenchida/);
  });

  it("recálculo bem-sucedido limpa os erros antigos", async () => {
    const res = await calcularCom([LINHA_OK]);
    assert.equal(res.statusCode, 200);
    const calculado = banco.updates.find((u) => u.payload.status === "calculado").payload;
    assert.equal(calculado.erros_planilha, null);
  });

  it("consultarStatusFolha devolve erros_planilha (e [] quando não há)", async () => {
    const erros = [{ linha: 3, motivos: ["cpf inválido"] }];
    banco.processamento = { ...banco.processamento, status: "erro", motivo_erro: "x", erros_planilha: erros };
    const res = criarRes();
    await consultarStatusFolha(req, res);
    assert.deepEqual(res.body.erros_planilha, erros);

    banco.processamento = { ...banco.processamento, erros_planilha: null };
    const res2 = criarRes();
    await consultarStatusFolha(req, res2);
    assert.deepEqual(res2.body.erros_planilha, []);
  });
});
