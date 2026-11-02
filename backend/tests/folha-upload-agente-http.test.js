// TEST-11 (#688): POST /folha/upload/agente, a rota que o agente local usa para mandar a planilha
// de folha (automacoes/upload_folha.py e comunicacao/apuracao_folha_agente.py). HTTP de verdade,
// licença por escritório e banco descartável de verdade (massa #680, dois escritórios). O agente se
// identifica pelo x-licenca-token e o escritório vem SÓ da licença: não existe cliente_id no pedido.
//
// O que NÃO é de verdade: o Storage. O banco descartável da #678 não tem serviço de Storage e o
// guarda de rede dos testes (helpers/servicos-externos.js) barra qualquer /storage/v1. Por isso o
// bucket "folhas-pagamento" é uma memória que guarda e devolve os bytes de verdade (upload com
// upsert:false recusa nome repetido, download devolve o arquivo, remove apaga). Ela não conta
// chamadas: os testes conferem o que ficou guardado e o que ficou no banco. Fora do alcance: o
// upload real no Storage do Supabase (contrato do SDK) e a remoção da planilha órfã quando o INSERT
// do processamento falha (o INSERT não tem como falhar com cliente vindo de licença válida).
//
// Números esperados: conta feita à mão neste arquivo (tabela 2026: INSS marginal 7,5% até 1.621,00,
// 9% até 2.902,84, 12% até 4.354,27; IRRF zerado até 5.000,00 de rendimento pela Lei 15.270/2025;
// FGTS 8%). O backend decide o que é 400/401/201; este arquivo só confere.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import supabase from "../src/config/database.js";
import { iniciarApiTeste } from "./helpers/http.js";
import { recriarMassa680 } from "./helpers/massa-680.js";
import { lerTabela, resetarBanco } from "./helpers/banco.js";
import { gerarCpfSintetico } from "./fixtures/massa-680.js";
import { alterarLicenca, cabecalhoLicenca, criarLicenca } from "./helpers/licenca-agente.js";
import { conhecido } from "./helpers/bug-conhecido.js";
import { COLUNAS_FOLHA } from "../src/services/folha.service.js";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CPF_MARIA = gerarCpfSintetico("689900011");
const CPF_JOSE = gerarCpfSintetico("689900012");
const LINHA_MARIA = {
  empresa: "Empresa Sintetica Um", funcionario: "Maria Sintetica", cpf: CPF_MARIA, cargo: "Caixa",
  salario_bruto: 1500, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 0,
  num_dependentes: 0, vale_transporte: false,
};
const LINHA_JOSE = {
  empresa: "Empresa Sintetica Dois", funcionario: "Jose Sintetico", cpf: CPF_JOSE, cargo: "Gerente",
  salario_bruto: 3000, dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento: 100,
  num_dependentes: 0, vale_transporte: false,
};

async function planilha(linhas, { semColuna } = {}) {
  const colunas = COLUNAS_FOLHA.filter(coluna => coluna.key !== semColuna);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(colunas.map(coluna => coluna.header));
  for (const linha of linhas) ws.addRow(colunas.map(coluna => linha[coluna.key]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Bucket em memória (ver o aviso no topo). Guarda os bytes de verdade.
function criarBucketEmMemoria() {
  const arquivos = new Map();
  const bucket = {
    falharUpload: false,
    async upload(caminho, conteudo, { upsert = false } = {}) {
      if (bucket.falharUpload) return { data: null, error: { message: "storage indisponivel (teste)" } };
      if (arquivos.has(caminho) && !upsert) return { data: null, error: { message: "The resource already exists" } };
      arquivos.set(caminho, Buffer.from(conteudo));
      return { data: { path: caminho }, error: null };
    },
    async download(caminho) {
      if (!arquivos.has(caminho)) return { data: null, error: { message: "Object not found" } };
      const bytes = arquivos.get(caminho);
      return { data: new Blob([bytes]), error: null };
    },
    async remove(caminhos) {
      for (const caminho of caminhos) arquivos.delete(caminho);
      return { data: [], error: null };
    },
  };
  return { arquivos, bucket };
}

describe("TEST-11: POST /folha/upload/agente (HTTP, licença e banco reais)", { timeout: 300_000 }, () => {
  let api;
  let banco;
  let massa;
  let A;
  let B;
  let tokenA;
  let tokenB;
  let memoria;
  const originalFrom = supabase.storage.from;

  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    supabase.storage.from = originalFrom;
    try { await api.fechar(); } finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    ({ massa, banco } = await recriarMassa680());
    [A, B] = massa.tabelas.clientes;
    tokenA = await criarLicenca(banco, A.id);
    tokenB = await criarLicenca(banco, B.id);
    memoria = criarBucketEmMemoria();
    supabase.storage.from = nome => {
      assert.equal(nome, "folhas-pagamento", "a rota só pode usar o bucket de folha");
      return memoria.bucket;
    };
  });

  const TABELAS = ["processamentos_folha", "folha_calculos", "folha_relatorios", "eventos", "notificacoes"];
  // Fotografia do banco dos DOIS escritórios e do bucket: igual antes e depois = nada foi gravado.
  async function fotografar() {
    const foto = { storage: [...memoria.arquivos.keys()].sort() };
    for (const tabela of TABELAS) foto[tabela] = await lerTabela(banco, tabela);
    return foto;
  }

  function formulario({ arquivo, nome = "folha.xlsx", tipo = MIME_XLSX, campo = "planilha", mes = "2026-10", extras = {} } = {}) {
    const dados = new FormData();
    if (arquivo !== undefined) dados.append(campo, new Blob([arquivo], { type: tipo }), nome);
    if (mes !== null) dados.append("mes_referencia", mes);
    for (const [chave, valor] of Object.entries(extras)) dados.append(chave, valor);
    return dados;
  }
  const enviar = (form, token) => api.requisitar("/folha/upload/agente", {
    metodo: "POST", formulario: form, cabecalhos: cabecalhoLicenca(token),
  });

  // O pipeline (cálculo + holerites + relatórios) roda em segundo plano depois do 201: espera o fim.
  async function esperarPipeline(processamentoId) {
    const limite = Date.now() + 30_000;
    for (;;) {
      const { data, error } = await banco.from("processamentos_folha").select("*").eq("id", processamentoId).single();
      if (error) throw new Error(`Falha lendo o processamento ${processamentoId} da folha: ${error.message}`);
      if (data.status === "erro" || (data.status === "concluido" && data.saida_status !== "pendente")) return data;
      if (Date.now() > limite) throw new Error(`Pipeline não terminou: ${JSON.stringify(data)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  describe("autenticação e escopo", () => {
    it("sem token: 401 e nada é gravado", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      const antes = await fotografar();
      const resposta = await enviar(formulario({ arquivo }));
      assert.equal(resposta.status, 401);
      assert.deepEqual(resposta.corpo, { erro: "Token de licença inválido ou expirado" });
      assert.deepEqual(await fotografar(), antes);
    });

    it("token que não existe: 401 e nada é gravado", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      const antes = await fotografar();
      const resposta = await enviar(formulario({ arquivo }), "token-que-nao-existe");
      assert.equal(resposta.status, 401);
      assert.deepEqual(await fotografar(), antes);
    });

    it("licença desligada e licença vencida: 401 e nada é gravado; licença de volta, 201", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      const mudarLicenca = campos => alterarLicenca(banco, tokenA, campos);
      const antes = await fotografar();
      await mudarLicenca({ ativa: false });
      assert.equal((await enviar(formulario({ arquivo }), tokenA)).status, 401);
      await mudarLicenca({ ativa: true, validade: "2020-01-01T00:00:00Z" });
      assert.equal((await enviar(formulario({ arquivo }), tokenA)).status, 401);
      assert.deepEqual(await fotografar(), antes);
      // Controle: o mesmo arquivo com a licença de volta é aceito (o 401 acima era da licença).
      await mudarLicenca({ validade: null });
      const ok = await enviar(formulario({ arquivo }), tokenA);
      assert.equal(ok.status, 201);
      await esperarPipeline(ok.corpo.processamento_id);
    });

    it("token do B com cliente_id do A no formulário: o escritório é o da licença, o campo é ignorado", async () => {
      // O agente do A com o token do B (ou um agente que tente escolher o escritório): não há como
      // gravar na folha do A. O pedido vale para o B; o A continua sem nenhuma linha.
      const arquivo = await planilha([LINHA_MARIA]);
      const resposta = await enviar(formulario({ arquivo, extras: { cliente_id: A.id } }), tokenB);
      assert.equal(resposta.status, 201);
      await esperarPipeline(resposta.corpo.processamento_id);

      const processamentos = await lerTabela(banco, "processamentos_folha");
      assert.equal(processamentos.length, 1);
      assert.equal(processamentos[0].id, resposta.corpo.processamento_id);
      assert.equal(processamentos[0].cliente_id, B.id);
      for (const caminho of memoria.arquivos.keys()) {
        assert.ok(caminho.startsWith(`clientes/${B.id}/`), `${caminho} fora da pasta do B`);
      }
      const eventos = await lerTabela(banco, "eventos");
      assert.deepEqual(eventos.map(evento => evento.cliente_id), [B.id]);
    });
  });

  describe("entrada inválida: 400 e nada é gravado", () => {
    async function recusada(form, esperado) {
      const antes = await fotografar();
      const resposta = await enviar(form, tokenA);
      assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
      for (const [campo, valor] of Object.entries(esperado)) assert.deepEqual(resposta.corpo[campo], valor);
      assert.deepEqual(await fotografar(), antes);
    }

    it("sem arquivo", async () => {
      await recusada(formulario({}), { erro: "Planilha é obrigatória" });
    });

    it("arquivo no campo errado", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      await recusada(formulario({ arquivo, campo: "arquivo" }), {
        erro: "Campo de arquivo inesperado. Envie no campo 'planilha'.",
      });
    });

    it("tipo que não é xlsx (csv, pdf)", async () => {
      for (const [tipo, nome] of [["text/csv", "folha.csv"], ["application/pdf", "folha.pdf"]]) {
        await recusada(formulario({ arquivo: Buffer.from("a,b\n1,2\n"), nome, tipo }), {
          erro: "Tipo de arquivo não permitido. Envie um .xlsx.",
        });
      }
    });

    it("arquivo acima de 10MB", async () => {
      await recusada(formulario({ arquivo: Buffer.alloc(10 * 1024 * 1024 + 1) }), {
        erro: "Planilha excede o tamanho máximo permitido (10MB).",
      });
    });

    it("mes_referencia ausente, fora do formato ou com mês 13", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      for (const mes of [null, "", "   ", "10/2026", "2026-13", "2026-00", "2026-1", "outubro"]) {
        await recusada(formulario({ arquivo, mes }), { erro: "mes_referencia é obrigatório no formato YYYY-MM" });
      }
    });

    it("planilha sem uma das colunas obrigatórias: diz qual falta", async () => {
      const arquivo = await planilha([LINHA_MARIA], { semColuna: "cpf" });
      await recusada(formulario({ arquivo }), { erro: "Planilha com colunas obrigatórias faltando", faltando: ["cpf"] });
    });

    it("bytes que não são planilha, mesmo com o tipo xlsx: todas as colunas faltam", async () => {
      await recusada(formulario({ arquivo: Buffer.from("isto nao e um xlsx") }), {
        erro: "Planilha com colunas obrigatórias faltando",
        faltando: COLUNAS_FOLHA.map(coluna => coluna.header),
      });
    });
  });

  describe("storage indisponível", () => {
    it("500 e nenhum processamento fica registrado (sem linha apontando para arquivo que não existe)", async () => {
      memoria.bucket.falharUpload = true;
      const arquivo = await planilha([LINHA_MARIA]);
      const antes = await fotografar();
      const resposta = await enviar(formulario({ arquivo }), tokenA);
      assert.equal(resposta.status, 500);
      assert.deepEqual(resposta.corpo, { erro: "Erro ao salvar planilha" });
      assert.deepEqual(await fotografar(), antes);
    });
  });

  describe("POST grava mais de uma tabela: confere as linhas de todas depois", () => {
    it("201: processamento, cálculos por funcionário, relatórios por empresa, evento e notificação", async () => {
      const arquivo = await planilha([LINHA_MARIA, LINHA_JOSE]);
      const antes = await fotografar();
      assert.deepEqual(antes.processamentos_folha, []);

      const resposta = await enviar(formulario({ arquivo, mes: "2026-10-15" }), tokenA);
      assert.equal(resposta.status, 201);
      const id = resposta.corpo.processamento_id;
      const final = await esperarPipeline(id);

      // processamentos_folha: uma linha, do A, competência normalizada para o dia 1.
      const processamentos = await lerTabela(banco, "processamentos_folha");
      assert.equal(processamentos.length, 1);
      assert.equal(final.id, id);
      assert.equal(final.cliente_id, A.id);
      assert.equal(final.mes_referencia, "2026-10-01");
      assert.equal(final.status, "concluido");
      assert.equal(final.saida_status, "ok");
      assert.equal(final.motivo_erro, null);
      assert.equal(final.evento_conclusao_registrado, true);
      assert.match(final.arquivo_origem_path, new RegExp(`^clientes/${A.id}/2026-10-01/\\d+_folha\\.xlsx$`));
      // A planilha enviada ficou guardada, byte a byte.
      assert.deepEqual(memoria.arquivos.get(final.arquivo_origem_path), arquivo);

      // folha_calculos: um por funcionário, só deste processamento, com a conta feita à mão.
      const calculos = await lerTabela(banco, "folha_calculos", "funcionario");
      assert.equal(calculos.length, 2);
      assert.ok(calculos.every(calculo => calculo.processamento_id === id));
      const [jose, maria] = calculos;
      assert.deepEqual(
        { funcionario: maria.funcionario, empresa: maria.empresa, cpf: maria.cpf, salario_bruto: Number(maria.salario_bruto), inss: Number(maria.inss), fgts: Number(maria.fgts), ir: Number(maria.ir), liquido: Number(maria.liquido) },
        { funcionario: "Maria Sintetica", empresa: "Empresa Sintetica Um", cpf: CPF_MARIA, salario_bruto: 1500, inss: 112.5, fgts: 120, ir: 0, liquido: 1387.5 },
      );
      assert.deepEqual(
        { funcionario: jose.funcionario, empresa: jose.empresa, cpf: jose.cpf, salario_bruto: Number(jose.salario_bruto), adiantamento: Number(jose.adiantamento), inss: Number(jose.inss), fgts: Number(jose.fgts), ir: Number(jose.ir), liquido: Number(jose.liquido) },
        { funcionario: "Jose Sintetico", empresa: "Empresa Sintetica Dois", cpf: CPF_JOSE, salario_bruto: 3000, adiantamento: 100, inss: 248.6, fgts: 240, ir: 0, liquido: 2651.4 },
      );

      // Holerites: cada cálculo aponta para um PDF que existe de verdade no bucket.
      for (const calculo of calculos) {
        assert.ok(calculo.holerite_path?.startsWith(`clientes/${A.id}/2026-10/${id}/holerites/`), calculo.holerite_path);
        assert.equal(memoria.arquivos.get(calculo.holerite_path).subarray(0, 4).toString(), "%PDF");
      }

      // folha_relatorios: um por empresa, com os totais da empresa.
      const relatorios = await lerTabela(banco, "folha_relatorios", "empresa");
      assert.equal(relatorios.length, 2);
      assert.ok(relatorios.every(relatorio => relatorio.processamento_id === id));
      assert.deepEqual(
        relatorios.map(relatorio => ({ empresa: relatorio.empresa, total_funcionarios: relatorio.total_funcionarios, total_bruto: Number(relatorio.total_bruto), total_liquido: Number(relatorio.total_liquido) })),
        [
          { empresa: "Empresa Sintetica Dois", total_funcionarios: 1, total_bruto: 3000, total_liquido: 2651.4 },
          { empresa: "Empresa Sintetica Um", total_funcionarios: 1, total_bruto: 1500, total_liquido: 1387.5 },
        ],
      );
      for (const relatorio of relatorios) {
        assert.ok(relatorio.arquivo_path.startsWith(`clientes/${A.id}/2026-10/${id}/relatorios/`), relatorio.arquivo_path);
        assert.equal(memoria.arquivos.get(relatorio.arquivo_path).subarray(0, 4).toString(), "%PDF");
      }

      // eventos e notificacoes: um de cada, do A.
      const eventos = await lerTabela(banco, "eventos");
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0].cliente_id, A.id);
      assert.equal(eventos[0].sucesso, true);
      assert.match(eventos[0].descricao, /2 funcion/);
      const notificacoes = await lerTabela(banco, "notificacoes");
      assert.equal(notificacoes.length, 1);
      assert.equal(notificacoes[0].cliente_id, A.id);
      assert.equal(notificacoes[0].tipo, "arquivo_processado");

      // Bucket: planilha + 2 holerites + 2 relatórios, nada além disso.
      assert.equal(memoria.arquivos.size, 5);
    });

    it("planilha com linha inválida (CPF errado): 201, o cálculo falha de forma visível e nada de cálculo/relatório/evento", async () => {
      // O upload só confere as colunas; a conta das linhas é do pipeline, que marca o erro no processamento.
      const arquivo = await planilha([LINHA_MARIA, { ...LINHA_JOSE, cpf: "12345678900" }]);
      const resposta = await enviar(formulario({ arquivo }), tokenA);
      assert.equal(resposta.status, 201);
      const final = await esperarPipeline(resposta.corpo.processamento_id);

      assert.equal(final.cliente_id, A.id);
      assert.equal(final.status, "erro");
      assert.equal(final.motivo_erro, "Planilha com 1 linha(s) inválida(s)");
      assert.deepEqual(await lerTabela(banco, "folha_calculos"), []);
      assert.deepEqual(await lerTabela(banco, "folha_relatorios"), []);
      assert.deepEqual(await lerTabela(banco, "eventos"), []);
      assert.deepEqual(await lerTabela(banco, "notificacoes"), []);
      // Só a planilha original ficou no bucket (nenhum holerite).
      assert.deepEqual([...memoria.arquivos.keys()], [final.arquivo_origem_path]);
    });
  });

  describe("arquivo repetido", () => {
    // Caracterização do comportamento atual, não regra confirmada: se a regra mudar (409 ou
    // substituição por cliente + competência), é este teste que muda.
    it("comportamento atual: mesma planilha duas vezes gera 2 processamentos completos e separados", async () => {
      const arquivo = await planilha([LINHA_MARIA]);
      const primeiro = await enviar(formulario({ arquivo }), tokenA);
      const segundo = await enviar(formulario({ arquivo }), tokenA);
      assert.equal(primeiro.status, 201);
      assert.equal(segundo.status, 201);
      assert.notEqual(primeiro.corpo.processamento_id, segundo.corpo.processamento_id);
      await esperarPipeline(primeiro.corpo.processamento_id);
      await esperarPipeline(segundo.corpo.processamento_id);

      const processamentos = await lerTabela(banco, "processamentos_folha");
      assert.equal(processamentos.length, 2);
      assert.ok(processamentos.every(processamento => processamento.cliente_id === A.id && processamento.status === "concluido"));
      assert.notEqual(processamentos[0].arquivo_origem_path, processamentos[1].arquivo_origem_path);
      const calculos = await lerTabela(banco, "folha_calculos");
      assert.equal(calculos.length, 2);
      assert.deepEqual([...new Set(calculos.map(calculo => calculo.processamento_id))].sort(), processamentos.map(processamento => processamento.id).sort());
      assert.equal((await lerTabela(banco, "folha_relatorios")).length, 2);
      assert.equal((await lerTabela(banco, "eventos")).length, 2);
    });
  });

  describe("bugs conhecidos: o teste do comportamento certo fica com skip até a correção", () => {
    it("sem token, o arquivo de tipo errado ou grande demais é recusado como 401, não 400 (PRB-E-44)",
      conhecido("BUG (sem issue; precisa de issue `bug`, catálogo PRB-E-44): o multer roda antes da checagem do token; sem token, tipo errado ou arquivo acima de 10MB devolve 400 em vez de 401 e quem não tem licença chega ao parse do upload"), async () => {
        const antes = await fotografar();
        const errado = await enviar(formulario({ arquivo: Buffer.from("a,b"), nome: "folha.csv", tipo: "text/csv" }));
        const grande = await enviar(formulario({ arquivo: Buffer.alloc(10 * 1024 * 1024 + 1) }));
        assert.equal(errado.status, 401);
        assert.equal(grande.status, 401);
        assert.deepEqual(await fotografar(), antes);
      });
  });
});
