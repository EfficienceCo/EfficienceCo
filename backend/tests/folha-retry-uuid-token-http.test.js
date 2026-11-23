// FOLHA-7 (#747): retry de /folha/:id/gerar-saida idempotente (P8), id que não é UUID vira 400 (P13) e
// token do agente checado antes do multipart (P21). HTTP de verdade, licença por escritório e banco
// descartável de verdade (massa #680). Mesmo padrão de folha-upload-agente-http.test.js.
//
// O que NÃO é de verdade: o Storage. O banco descartável não tem serviço de Storage; o bucket
// "folhas-pagamento" é uma memória que respeita `upsert` (upload sem upsert recusa nome repetido,
// com upsert sobrescreve) e guarda os bytes de verdade. Fora do alcance: o upload real no Storage.
//
// T4 (duas chamadas em paralelo) não depende de sorte: o bucket segura os uploads de relatório até
// as DUAS chamadas chegarem lá, então as duas já passaram pela checagem "relatório existe?" (vazia)
// e o 2º INSERT em folha_relatorios bate no UNIQUE (processamento_id, empresa) de forma estável.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import supabase from "../src/config/database.js";
import { iniciarApiTeste } from "./helpers/http.js";
import { recriarMassa680 } from "./helpers/massa-680.js";
import { lerTabela, resetarBanco } from "./helpers/banco.js";
import { gerarCpfSintetico } from "./fixtures/massa-680.js";
import { cabecalhoLicenca, criarLicenca } from "./helpers/licenca-agente.js";
import { COLUNAS_FOLHA } from "../src/services/folha.service.js";
import { sufixoEmpresa } from "../src/services/folha-status.helpers.js";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const linha = (empresa, funcionario, cpfBase, salario) => ({
  empresa, funcionario, cpf: gerarCpfSintetico(cpfBase), cargo: "Caixa", salario_bruto: salario,
  dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0, num_dependentes: 0, vale_transporte: false,
});
const MARIA = linha("Empresa Sintetica Um", "Maria Sintetica", "747900011", 1500);
const JOSE = linha("Empresa Sintetica Dois", "Jose Sintetico", "747900012", 3000);
const PAO = linha("Padaria Pão Quente", "Ana Sintetica", "747900013", 2000);
const PAO_SEM_ACENTO = linha("Padaria Pao Quente", "Bia Sintetica", "747900014", 2500);

async function planilha(linhas) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(COLUNAS_FOLHA.map(coluna => coluna.header));
  for (const l of linhas) ws.addRow(COLUNAS_FOLHA.map(coluna => l[coluna.key]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function criarBucketEmMemoria() {
  const arquivos = new Map();
  const bucket = {
    // Gancho de teste: roda antes de cada upload (T4 segura os relatórios aqui).
    antesDoUpload: null,
    async upload(caminho, conteudo, { upsert = false } = {}) {
      if (bucket.antesDoUpload) await bucket.antesDoUpload(caminho);
      if (arquivos.has(caminho) && !upsert) return { data: null, error: { message: "The resource already exists" } };
      arquivos.set(caminho, Buffer.from(conteudo));
      return { data: { path: caminho }, error: null };
    },
    async download(caminho) {
      if (!arquivos.has(caminho)) return { data: null, error: { message: "Object not found" } };
      return { data: new Blob([arquivos.get(caminho)]), error: null };
    },
    async remove(caminhos) {
      for (const caminho of caminhos) arquivos.delete(caminho);
      return { data: [], error: null };
    },
  };
  return { arquivos, bucket };
}

describe("FOLHA-7: retry idempotente, id inválido e token antes do multipart (HTTP, banco real)", { timeout: 300_000 }, () => {
  let api; let banco; let massa; let A; let tokenA; let usuarioA; let memoria;
  const originalFrom = supabase.storage.from;
  const originalFromBanco = supabase.from;

  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    supabase.storage.from = originalFrom;
    supabase.from = originalFromBanco;
    try { await api.fechar(); } finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    supabase.from = originalFromBanco;
    ({ massa, banco } = await recriarMassa680());
    [A] = massa.tabelas.clientes;
    usuarioA = massa.tabelas.usuarios.find(u => u.cliente_id === A.id && u.perfil === "admin_cliente");
    tokenA = await criarLicenca(banco, A.id);
    memoria = criarBucketEmMemoria();
    supabase.storage.from = nome => {
      assert.equal(nome, "folhas-pagamento", "a rota só pode usar o bucket de folha");
      return memoria.bucket;
    };
  });

  const formulario = (arquivo, { nome = "folha.xlsx", tipo = MIME_XLSX } = {}) => {
    const dados = new FormData();
    dados.append("planilha", new Blob([arquivo], { type: tipo }), nome);
    dados.append("mes_referencia", "2026-10");
    return dados;
  };
  const enviar = (form, token) => api.requisitar("/folha/upload/agente", {
    metodo: "POST", formulario: form, cabecalhos: cabecalhoLicenca(token),
  });
  const logado = (caminho, metodo = "GET") => api.requisitar(caminho, { usuario: usuarioA, metodo });

  async function esperarPipeline(processamentoId) {
    const limite = Date.now() + 30_000;
    for (;;) {
      const { data, error } = await banco.from("processamentos_folha").select("*").eq("id", processamentoId).single();
      if (error) throw new Error(`Falha lendo o processamento ${processamentoId}: ${error.message}`);
      if (data.status === "erro" || (data.status === "concluido" && data.saida_status !== "pendente")) return data;
      if (Date.now() > limite) throw new Error(`Pipeline não terminou: ${JSON.stringify(data)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Sobe a planilha pelo agente e espera o pipeline fechar com tudo gerado.
  async function processamentoConcluido(linhas) {
    const resposta = await enviar(formulario(await planilha(linhas)), tokenA);
    assert.equal(resposta.status, 201);
    const final = await esperarPipeline(resposta.corpo.processamento_id);
    assert.equal(final.status, "concluido");
    assert.equal(final.saida_status, "ok", final.motivo_erro);
    return final.id;
  }

  const lerProcessamento = async id => (await banco.from("processamentos_folha").select("*").eq("id", id).single()).data;

  describe("P8: retry de /gerar-saida depois que o arquivo foi para o storage e o registro se perdeu", () => {
    it("T1: holerite_path nulo com o PDF já no bucket: 200, caminho regravado, download ok, sem novo cálculo", async () => {
      const id = await processamentoConcluido([MARIA, JOSE]);
      const calculosAntes = await lerTabela(banco, "folha_calculos", "funcionario");
      const perdido = calculosAntes.find(c => c.funcionario === "Maria Sintetica");
      assert.ok(memoria.arquivos.has(perdido.holerite_path));
      const { error } = await banco.from("folha_calculos").update({ holerite_path: null }).eq("id", perdido.id);
      assert.equal(error, null);

      const resposta = await logado(`/folha/${id}/gerar-saida`, "POST");
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.holerites_gerados, 1);

      const calculosDepois = await lerTabela(banco, "folha_calculos", "funcionario");
      assert.equal(calculosDepois.length, calculosAntes.length);
      assert.equal(calculosDepois.find(c => c.id === perdido.id).holerite_path, perdido.holerite_path);
      const download = await logado(`/folha/${id}/download/${perdido.id}`);
      assert.equal(download.status, 200);
      assert.deepEqual(download.corpo, memoria.arquivos.get(perdido.holerite_path));
      assert.equal(download.corpo.subarray(0, 4).toString(), "%PDF");
    });

    it("T2: linha de folha_relatorios apagada com o arquivo no bucket: 200, uma linha por empresa, download ok", async () => {
      const id = await processamentoConcluido([MARIA, JOSE]);
      const antes = await lerTabela(banco, "folha_relatorios", "empresa");
      assert.equal(antes.length, 2);
      const { error } = await banco.from("folha_relatorios").delete().eq("processamento_id", id);
      assert.equal(error, null);

      const resposta = await logado(`/folha/${id}/gerar-saida`, "POST");
      assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
      assert.equal(resposta.corpo.relatorios_gerados, 2);

      const depois = await lerTabela(banco, "folha_relatorios", "empresa");
      assert.deepEqual(depois.map(r => r.empresa), antes.map(r => r.empresa));
      assert.deepEqual(depois.map(r => r.arquivo_path), antes.map(r => r.arquivo_path));
      for (const relatorio of depois) {
        const download = await logado(`/folha/${id}/download/${relatorio.id}`);
        assert.equal(download.status, 200);
        assert.deepEqual(download.corpo, memoria.arquivos.get(relatorio.arquivo_path));
      }
    });

    it("T3: empresas que sanitizam igual (Pão x Pao): dois arquivos, cada download traz o seu, nome sem hash", async () => {
      const id = await processamentoConcluido([PAO, PAO_SEM_ACENTO]);
      const relatorios = await lerTabela(banco, "folha_relatorios", "empresa");
      assert.deepEqual(relatorios.map(r => r.empresa).sort(), ["Padaria Pao Quente", "Padaria Pão Quente"]);
      const caminhos = relatorios.map(r => r.arquivo_path);
      assert.equal(new Set(caminhos).size, 2);
      for (const relatorio of relatorios) {
        assert.ok(relatorio.arquivo_path.includes(`_${sufixoEmpresa(relatorio.empresa)}_`), relatorio.arquivo_path);
      }
      const noBucket = [...memoria.arquivos.keys()].filter(c => c.includes("/relatorios/"));
      assert.deepEqual(noBucket.sort(), [...caminhos].sort());

      const status = await logado(`/folha/${id}`);
      const nomes = status.corpo.arquivos.filter(a => a.tipo === "relatorio").map(a => a.nome);
      assert.deepEqual(nomes, ["relatorio_fechamento_padaria_pao_quente_2026-10.pdf", "relatorio_fechamento_padaria_pao_quente_2026-10.pdf"]);

      const baixados = [];
      for (const relatorio of relatorios) {
        const download = await logado(`/folha/${id}/download/${relatorio.id}`);
        assert.equal(download.status, 200);
        assert.match(download.headers.get("content-disposition"), /relatorio_fechamento_padaria_pao_quente_2026-10\.pdf/);
        assert.doesNotMatch(download.headers.get("content-disposition"), new RegExp(sufixoEmpresa(relatorio.empresa)));
        assert.deepEqual(download.corpo, memoria.arquivos.get(relatorio.arquivo_path));
        baixados.push(download.corpo);
      }
      // Salários diferentes (2.000 x 2.500): o PDF de uma empresa não pode ser o da outra.
      assert.notDeepEqual(baixados[0], baixados[1]);
    });

    it("T4: duas chamadas de /gerar-saida em paralelo: as duas 200, saida_status ok, uma linha por empresa", async () => {
      const id = await processamentoConcluido([MARIA, JOSE]);
      await banco.from("folha_relatorios").delete().eq("processamento_id", id);

      // Segura o upload do 1º relatório até as duas chamadas chegarem (uma por chamada, em paralelo);
      // depois o portão fica aberto. Um limite de 5s solta tudo para o teste nunca travar.
      let chegaram = 0;
      let liberar;
      const portao = new Promise(resolve => { liberar = resolve; });
      const limite = setTimeout(liberar, 5_000);
      memoria.bucket.antesDoUpload = async caminho => {
        if (!caminho.includes("/relatorios/")) return;
        if (++chegaram >= 2) liberar();
        await portao;
      };

      const [primeira, segunda] = await Promise.all([
        logado(`/folha/${id}/gerar-saida`, "POST"),
        logado(`/folha/${id}/gerar-saida`, "POST"),
      ]);
      clearTimeout(limite);
      assert.ok(chegaram >= 2, "as duas chamadas deviam chegar juntas ao upload dos relatórios");
      assert.equal(primeira.status, 200, JSON.stringify(primeira.corpo));
      assert.equal(segunda.status, 200, JSON.stringify(segunda.corpo));
      const final = await lerProcessamento(id);
      assert.equal(final.saida_status, "ok");
      assert.equal(final.motivo_erro, null);
      assert.equal((await lerTabela(banco, "folha_relatorios", "empresa")).length, 2);
    });
  });

  describe("P13: processamento_id que não é UUID", () => {
    const ROTAS = [
      ["POST", "/folha/abc/calcular"],
      ["POST", "/folha/abc/gerar-saida"],
      ["GET", "/folha/abc"],
      ["GET", "/folha/abc/download/qualquer"],
    ];

    it("T5: logado, as 4 rotas respondem 400 e nenhum select em processamentos_folha acontece", async () => {
      let consultas = 0;
      supabase.from = tabela => {
        if (tabela === "processamentos_folha") consultas++;
        return originalFromBanco.call(supabase, tabela);
      };
      for (const [metodo, caminho] of ROTAS) {
        const resposta = await logado(caminho, metodo);
        assert.equal(resposta.status, 400, `${metodo} ${caminho}: ${JSON.stringify(resposta.corpo)}`);
        assert.deepEqual(resposta.corpo, { erro: "processamento_id deve ser um UUID válido" });
      }
      assert.equal(consultas, 0);
    });

    it("T6: deslogado, as 4 rotas continuam 401 (a checagem de id vem depois do login)", async () => {
      for (const [metodo, caminho] of ROTAS) {
        const resposta = await api.requisitar(caminho, { metodo });
        assert.equal(resposta.status, 401, `${metodo} ${caminho}`);
      }
    });
  });

  describe("P21: /folha/upload/agente confere o token antes de ler o arquivo", () => {
    const grande = () => Buffer.alloc(10 * 1024 * 1024 + 1);
    const casos = () => [
      ["arquivo .txt", formulario(Buffer.from("a,b"), { nome: "folha.txt", tipo: "text/plain" })],
      ["arquivo acima de 10MB", formulario(grande())],
    ];

    it("T7: sem token e com token falso, tipo errado ou arquivo grande dá 401 (não 400 do multer)", async () => {
      for (const token of [undefined, "token-que-nao-existe"]) {
        for (const [rotulo, form] of casos()) {
          const resposta = await enviar(form, token);
          assert.equal(resposta.status, 401, `${token ?? "sem token"} + ${rotulo}: ${JSON.stringify(resposta.corpo)}`);
          assert.deepEqual(resposta.corpo, { erro: "Token de licença inválido ou expirado" });
        }
      }
      assert.deepEqual(await lerTabela(banco, "processamentos_folha"), []);
      assert.equal(memoria.arquivos.size, 0);
    });

    it("T8: token válido segue aceito: 201, escritório da licença e pipeline concluído", async () => {
      const resposta = await enviar(formulario(await planilha([MARIA])), tokenA);
      assert.equal(resposta.status, 201);
      const final = await esperarPipeline(resposta.corpo.processamento_id);
      assert.equal(final.cliente_id, A.id);
      assert.equal(final.status, "concluido");
      assert.equal(final.saida_status, "ok");
    });
  });
});
