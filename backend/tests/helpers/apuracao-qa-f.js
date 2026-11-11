// Massa própria do QA-F: sem reset global, dados herdados ou servidor fixo.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import ExcelJS from "exceljs";
import { criarCenarioBanco } from "./banco.js";
import { iniciarApiTeste } from "./http.js";
import { criarLicenca } from "./licenca-agente.js";
import { comStorageDescartavel } from "./servicos-externos.js";
import { COLUNAS_FOLHA, COLUNA_CATEGORIA } from "../../src/services/folha.service.js";

export const REFERENCIAS = Array.from({ length: 12 }, (_, i) => {
  const n = 2025 * 12 + 9 + i;
  return { ano: Math.floor(n / 12), mes: n % 12 + 1 };
});
export const refISO = r => `${r.ano}-${String(r.mes).padStart(2, "0")}-01`;
export const relatorio = (refs = REFERENCIAS, extra = {}) => ({
  temDozeMeses: refs.length === 12, mesesEncontrados: refs,
  totalMesesEncontrados: refs.length, ...extra,
});

export async function inserir(banco, tabela, linhas) {
  const { data, error } = await banco.from(tabela).insert(linhas).select();
  assert.ifError(error);
  return data;
}

export async function lerTodos(banco, tabela, filtros) {
  const tudo = [];
  for (let inicio = 0; ; inicio += 1000) {
    let q = banco.from(tabela).select("*").order("id").range(inicio, inicio + 999);
    for (const [k, v] of Object.entries(filtros)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    const { data, error } = await q; assert.ifError(error);
    tudo.push(...data);
    if (data.length < 1000) return tudo;
  }
}

export async function aguardar(fn, descricao, timeout = 30_000) {
  const fim = Date.now() + timeout;
  while (Date.now() < fim) {
    const valor = await fn();
    if (valor) return valor;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(`Timeout aguardando ${descricao}`);
}

export async function iniciarCenarioApuracao(t) {
  const massa = criarCenarioBanco(), banco = massa.banco, clientes = [], arquivos = new Set(), uploads = new Set();
  const pasta = await mkdtemp(path.join(tmpdir(), "efficience-qa-f-"));
  const api = await comStorageDescartavel(() => iniciarApiTeste());
  // Rotas de upload e seus jobs herdam somente a permissão de storage local do
  // servidor de teste, não a identidade do usuário ou uma permissão de rede externa.
  let admin;
  t.after(async () => {
    try {
      for (const id of uploads) await aguardar(async () => {
        const { data, error } = await banco.from("processamentos_folha").select("status,saida_status").eq("id", id).maybeSingle();
        assert.ifError(error);
        return !data || data.status === "erro" || ["ok", "erro"].includes(data.saida_status);
      }, "fim do pipeline próprio antes da limpeza");
    } finally {
      await api.fechar();
      // Toda remoção fica restrita aos clientes criados pelo próprio cenário.
      for (const c of clientes) {
        const processos = await lerTodos(banco, "processamentos_folha", { cliente_id: c.id });
        for (const p of processos) if (p.arquivo_origem_path.startsWith(`clientes/${c.id}/`)) arquivos.add(p.arquivo_origem_path);
        // Lotes pequenos evitam milhares de consultas na massa de paginação;
        // os IDs continuam limitados aos processamentos do próprio cliente.
        for (let inicio = 0; inicio < processos.length; inicio += 100) {
          const ids = processos.slice(inicio, inicio + 100).map(p => p.id);
          for (const [table, coluna] of [["folha_calculos", "holerite_path"], ["folha_relatorios", "arquivo_path"]]) {
            const rows = await lerTodos(banco, table, { processamento_id: ids });
            for (const row of rows) if (row[coluna]) arquivos.add(row[coluna]);
            const del = await banco.from(table).delete().in("processamento_id", ids); assert.ifError(del.error);
          }
        }
        for (const table of ["processamentos_folha", "apuracoes", "licencas", "eventos", "notificacoes"]) {
          const del = await banco.from(table).delete().eq("cliente_id", c.id); assert.ifError(del.error);
        }
      }
      if (arquivos.size) await comStorageDescartavel(async () => {
        for (const arquivo of arquivos) assert.ok(clientes.some(c => arquivo.startsWith(`clientes/${c.id}/`)), "arquivo fora da fixture");
        const del = await banco.storage.from("folhas-pagamento").remove([...arquivos]); assert.ifError(del.error);
      });
      await massa.limpar();
      await rm(pasta, { recursive: true, force: true });
    }
  });
  async function cliente(extra = {}) {
    const c = await massa.criarCliente({ nome: `QA-F regressão ${randomUUID()}` }); clientes.push(c);
    const { data, error } = await banco.from("clientes").update({ regime_tributario: "simples_nacional", anexo_simples: "V", data_inicio_atividade: "2018-01-01", historico_receita: REFERENCIAS.map(r => ({ ...r, receita: 10000 })), ...extra }).eq("id", c.id).select().single();
    assert.ifError(error); Object.assign(c, data);
    c.licenca = await criarLicenca(banco, c.id);
    if (!admin) admin = await massa.criarUsuario({ clienteId: c.id, perfil: "admin_efficience" });
    return c;
  }
  function chamar(caminho, { usuario = admin, metodo = "GET", corpo, ...resto } = {}) {
    return api.requisitar(caminho, { usuario, metodo, corpo, ...resto });
  }
  async function criar(c, mes = 10, ano = 2026) {
    const r = await chamar("/apuracoes", { metodo: "POST", corpo: { clienteId: c.id, mes, ano, regime: "simples_nacional" } });
    assert.equal(r.status, 201, `criação da fixture: ${JSON.stringify(r.corpo)}`); return r.corpo;
  }
  async function estado(a) {
    const r = await banco.from("apuracoes").select("*").eq("id", a.id).single(); assert.ifError(r.error); return r.data;
  }
  const reportar = (c, a, payload = relatorio()) => chamar(`/apuracoes/${a.id}/resultado-folha`, { usuario: null, metodo: "POST", corpo: payload, cabecalhos: { "x-licenca-token": c.licenca } });
  async function notas(c, valores = [10000], extra = {}) {
    return inserir(banco, "lancamentos_fiscais", valores.map(valor => ({ cliente_id: c.id, chave_nfe: BigInt("0x" + randomUUID().replaceAll("-", "")).toString().padStart(44, "0"), tipo: "saida", cnpj_emitente: "12345678000195", cnpj_destinatario: "11222333000181", valor_total: valor, data_emissao: "2026-10-10", arquivo_xml: "QA-F/regressao.xml", status: "ativa", ...extra })));
  }
  async function processo(c, referencia, salario = 0, extra = {}) {
    const [p] = await inserir(banco, "processamentos_folha", { cliente_id: c.id, mes_referencia: referencia, status: "concluido", arquivo_origem_path: "fixture-qa-f-sem-arquivo", ...extra });
    if (salario) await inserir(banco, "folha_calculos", calculo(p.id, salario));
    return p;
  }
  async function planilha(c, salario = 5000) {
    const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Folha");
    sheet.columns = [...COLUNAS_FOLHA, COLUNA_CATEGORIA];
    sheet.addRow({ empresa: c.nome, funcionario: "Empregado QA-F", cpf: "52998224725", cargo: "QA", salario_bruto: salario, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0, num_dependentes: 0, vale_transporte: "NAO", categoria: "EMPREGADO" });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  async function prepararStorage() {
    await comStorageDescartavel(async () => {
      const { data, error } = await banco.storage.listBuckets(); assert.ifError(error);
      const bucket = data.find(b => b.id === "folhas-pagamento");
      if (bucket) assert.equal(bucket.public, false);
      else { const novo = await banco.storage.createBucket("folhas-pagamento", { public: false }); assert.ifError(novo.error); }
    });
  }
  async function pendente(c, ref, salario = 5000) {
    await prepararStorage();
    const arquivo = `clientes/${c.id}/qa-f/${randomUUID()}.xlsx`; arquivos.add(arquivo);
    await comStorageDescartavel(async () => { const up = await banco.storage.from("folhas-pagamento").upload(arquivo, await planilha(c, salario), { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); assert.ifError(up.error); });
    return processo(c, ref, 0, { status: "pendente", arquivo_origem_path: arquivo });
  }
  async function worker(c, { item, arquivosMes = REFERENCIAS, invalido } = {}) {
    await prepararStorage();
    for (const r of arquivosMes) {
      const pastaMes = path.join(pasta, c.nome, "Folha", refISO(r).slice(0, 7)); await mkdir(pastaMes, { recursive: true });
      await writeFile(path.join(pastaMes, "folha.xlsx"), r.ano === invalido?.ano && r.mes === invalido?.mes ? Buffer.from("xlsx inválido QA-F") : await planilha(c));
    }
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    const python = path.join(repo, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const script = fileURLToPath(new URL("./worker-folha-qa-f.py", import.meta.url));
    const child = spawn(python, [script], { cwd: path.join(repo, "agente/worker"), windowsHide: true, env: { ...process.env, API_URL: api.baseUrl, LICENSE_TOKEN: c.licenca, PASTA_BASE: pasta, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" }, stdio: ["pipe", "pipe", "pipe"] });
    let log = ""; child.stdout.on("data", b => { log += b; }); child.stderr.on("data", b => { log += b; });
    child.stdin.end(JSON.stringify(item ?? null));
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    const processos = await lerTodos(banco, "processamentos_folha", { cliente_id: c.id });
    for (const p of processos) if (p.arquivo_origem_path !== "fixture-qa-f-sem-arquivo") uploads.add(p.id);
    assert.equal(code, 0, log); return log;
  }
  return { banco, api, cliente, criar, chamar, estado, reportar, notas, processo, pendente, worker, prepararStorage,
    usuario: (c, perfil) => massa.criarUsuario({ clienteId: c.id, perfil }),
    async concluidos(c) {
      return aguardar(async () => {
        const ps = await lerTodos(banco, "processamentos_folha", { cliente_id: c.id });
        return ps.length && ps.every(p => p.status === "concluido" && p.saida_status === "ok") && ps;
      }, "cálculo e PDFs reais");
    },
  };
}

export function calculo(id, salario) {
  return { processamento_id: id, empresa: "QA-F", funcionario: "Empregado sintético", cpf: "52998224725", cargo: "QA", salario_bruto: salario, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0, num_dependentes: 0, vale_transporte: false, valor_horas_extras: 0, valor_faltas: 0, desconto_vt: 0, base_calculo: salario, inss: 0, fgts: 0, ir: 0, liquido: salario };
}
