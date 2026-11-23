// Apoio dos testes HTTP da Folha (TEST-FOLHA-2, #750): requisição de verdade, token de usuário de
// verdade, licença de verdade e banco descartável de verdade (massa #680, dois escritórios).
//
// O que NÃO é de verdade: o Storage. O banco descartável da #678 não tem serviço de Storage e o guarda
// de rede dos testes (servicos-externos.js) barra qualquer /storage/v1. Por isso o bucket
// "folhas-pagamento" é uma memória que guarda e devolve os bytes de verdade (upload com upsert:false
// recusa nome repetido, com upsert sobrescreve, download devolve o arquivo, remove apaga) e que deixa o
// teste injetar falha ou segurar um upload. Fora do alcance: o contrato real do SDK de Storage.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import supabase from "../../src/config/database.js";
import { contextoDb, servicoDb } from "../../src/config/db-usuario.js";
import { iniciarApiTeste } from "./http.js";
import { recriarMassa680 } from "./massa-680.js";
import { lerTabela, resetarBanco } from "./banco.js";
import { criarLicenca, cabecalhoLicenca } from "./licenca-agente.js";
import { gerarCpfSintetico } from "../fixtures/massa-680.js";
import { COLUNAS_FOLHA } from "../../src/services/folha.service.js";

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PERFIL = Object.freeze({
  EFFICIENCE: "admin_efficience",
  CLIENTE: "admin_cliente",
  FUNCIONARIO: "funcionario",
});
// UUID válido que não existe em nenhuma tabela da massa (prefixo da massa é 68000000-...).
export const UUID_INEXISTENTE = "99999999-9999-4999-8999-999999999999";
export const TABELAS_DA_FOLHA = [
  "processamentos_folha", "folha_calculos", "folha_relatorios", "eventos", "notificacoes", "processos", "etapas",
];

// ---------------------------------------------------------------------------------------------
// Planilhas
// ---------------------------------------------------------------------------------------------

export function linhaFolha({ empresa, funcionario, cpfBase, salario, adiantamento = 0, ...resto }) {
  return {
    empresa, funcionario, cpf: gerarCpfSintetico(cpfBase), cargo: "Auxiliar", salario_bruto: salario,
    dias_trabalhados: 30, horas_extras: 0, faltas: 0, adiantamento, num_dependentes: 0, vale_transporte: false,
    ...resto,
  };
}

export const EMPRESA_UM = "Empresa Sintetica Um";
export const EMPRESA_DOIS = "Empresa Sintetica Dois";

// Duas linhas simples, uma por empresa, com conta fácil de conferir (ver o TEST-11).
export const MARIA = linhaFolha({ empresa: EMPRESA_UM, funcionario: "Maria Sintetica", cpfBase: "750900011", salario: 1500 });
export const JOSE = linhaFolha({ empresa: EMPRESA_DOIS, funcionario: "Jose Sintetico", cpfBase: "750900012", salario: 3000, adiantamento: 100 });

export async function planilha(linhas, { semColuna } = {}) {
  const colunas = COLUNAS_FOLHA.filter(coluna => coluna.key !== semColuna);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folha");
  ws.addRow(colunas.map(coluna => coluna.header));
  for (const linha of linhas) ws.addRow(colunas.map(coluna => linha[coluna.key]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// INSS 2026 feito à mão (faixas marginais 7,5% até 1.621,00, 9% até 2.902,84, 12% até 4.354,27),
// só para salários até o fim da 3ª faixa. Independente do motor de cálculo.
export function inss2026(base) {
  assert.ok(base <= 4354.27, "inss2026 só vale até o fim da 3ª faixa");
  const faixa = (de, ate, aliquota) => Math.max(0, Math.min(base, ate) - de) * aliquota;
  const total = faixa(0, 1621, 0.075) + faixa(1621, 2902.84, 0.09) + faixa(2902.84, 4354.27, 0.12);
  return Math.round(total * 100) / 100;
}

// 15 funcionários em 2 empresas (8 + 7), salários de 1.500 a 4.300 (IRRF zerado até 5.000 pela
// Lei 15.270/2025). Cada um traz o esperado, calculado aqui à mão.
export function quinzeFuncionarios() {
  return Array.from({ length: 15 }, (_, i) => {
    const salario = 1500 + 200 * i;
    const adiantamento = i % 3 === 0 ? 50 : 0;
    const linha = linhaFolha({
      empresa: i < 8 ? EMPRESA_UM : EMPRESA_DOIS,
      funcionario: `Funcionario Sintetico ${String(i + 1).padStart(2, "0")}`,
      cpfBase: `7509${String(i + 100).padStart(5, "0")}`,
      salario, adiantamento,
    });
    const inss = inss2026(salario);
    linha.esperado = {
      inss, fgts: Math.round(salario * 0.08 * 100) / 100, ir: 0,
      liquido: Math.round((salario - inss - adiantamento) * 100) / 100,
    };
    return linha;
  });
}

// ---------------------------------------------------------------------------------------------
// Bucket em memória
// ---------------------------------------------------------------------------------------------

export function criarBucketEmMemoria() {
  const arquivos = new Map();
  const bucket = {
    // Ganchos de teste: `falharSe(caminho)` devolve true para simular erro do Storage;
    // `antesDoUpload(caminho)` pode segurar o upload (corrida entre chamadas).
    falharSe: null,
    antesDoUpload: null,
    uploads: [],
    async upload(caminho, conteudo, { upsert = false } = {}) {
      bucket.uploads.push({ caminho, upsert });
      if (bucket.antesDoUpload) await bucket.antesDoUpload(caminho);
      if (bucket.falharSe?.(caminho)) return { data: null, error: { message: "storage indisponivel (teste)" } };
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

// ---------------------------------------------------------------------------------------------
// Bateria: API, massa #680 (2 escritórios), licenças, bucket
// ---------------------------------------------------------------------------------------------

function descrever(massa, cliente, rotulo, token) {
  const usuario = perfil => massa.tabelas.usuarios.find(u => u.cliente_id === cliente.id && u.perfil === perfil);
  return { rotulo, cliente, usuario, token };
}

export async function iniciarBateriaFolha() {
  const api = await iniciarApiTeste();
  const storageOriginal = supabase.storage.from;
  let memoria;
  const bateria = {
    api,
    get memoria() { return memoria; },
    async recriar() {
      const { massa, banco } = await recriarMassa680();
      const [clienteA, clienteB] = massa.tabelas.clientes;
      // Licença ativa para os dois escritórios: sem ela as rotas web respondem 403 e o agente 401.
      const tokenA = await criarLicenca(banco, clienteA.id);
      const tokenB = await criarLicenca(banco, clienteB.id);
      memoria = criarBucketEmMemoria();
      supabase.storage.from = nome => {
        assert.equal(nome, "folhas-pagamento", "a Folha só pode usar o bucket folhas-pagamento");
        return memoria.bucket;
      };
      return { banco, massa, memoria, A: descrever(massa, clienteA, "A", tokenA), B: descrever(massa, clienteB, "B", tokenB) };
    },
    async encerrar() {
      supabase.storage.from = storageOriginal;
      try { await api.fechar(); } finally { await resetarBanco(); }
    },
  };
  return bateria;
}

// ---------------------------------------------------------------------------------------------
// Ações pelo HTTP e leitura do banco
// ---------------------------------------------------------------------------------------------

export function formularioFolha({ arquivo, nome = "folha.xlsx", tipo = MIME_XLSX, campo = "planilha", mes = "2026-10", extras = {} } = {}) {
  const dados = new FormData();
  if (arquivo !== undefined) dados.append(campo, new Blob([arquivo], { type: tipo }), nome);
  if (mes !== null) dados.append("mes_referencia", mes);
  for (const [chave, valor] of Object.entries(extras)) dados.append(chave, valor);
  return dados;
}

export const enviarWeb = (api, usuario, form) => api.requisitar("/folha/upload", { usuario, metodo: "POST", formulario: form });
export const enviarAgente = (api, token, form) => api.requisitar("/folha/upload/agente", {
  metodo: "POST", formulario: form, cabecalhos: cabecalhoLicenca(token),
});

export async function lerProcessamento(banco, id) {
  const { data, error } = await banco.from("processamentos_folha").select("*").eq("id", id).single();
  if (error) throw new Error(`Falha lendo o processamento ${id}: ${error.message}`);
  return data;
}

export async function esperar(descricao, ler, pronto, limiteMs = 60_000) {
  const limite = Date.now() + limiteMs;
  for (;;) {
    const valor = await ler();
    if (pronto(valor)) return valor;
    if (Date.now() > limite) throw new Error(`${descricao} não aconteceu: ${JSON.stringify(valor)}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

// O pipeline (cálculo + holerites + relatórios) roda em segundo plano depois do 201: espera o fim,
// que é "erro" ou "saída resolvida" (ok ou erro). Todo teste que faz upload chama isto antes de acabar.
export const esperarPipeline = (banco, id) => esperar(`pipeline de ${id}`, () => lerProcessamento(banco, id),
  p => p.status === "erro" || (["concluido", "calculado"].includes(p.status) && p.saida_status !== "pendente"));

// Upload web de uma planilha válida pelo escritório e espera o pipeline fechar com tudo gerado.
export async function folhaPronta(api, banco, usuario, linhas, { mes = "2026-10", nome } = {}) {
  const resposta = await enviarWeb(api, usuario, formularioFolha({ arquivo: await planilha(linhas), mes, nome }));
  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  const final = await esperarPipeline(banco, resposta.corpo.processamento_id);
  assert.equal(final.status, "concluido", JSON.stringify(final));
  assert.equal(final.saida_status, "ok", final.motivo_erro);
  return final;
}

// Processamento "pendente" criado direto no banco, com a planilha já no bucket, SEM disparar o
// pipeline: serve para exercitar /calcular e /gerar-saida uma de cada vez.
let sequencia = 0;
export async function semearProcessamento(banco, memoria, cliente, { linhas = [MARIA, JOSE], mes = "2026-10-01", status = "pendente", arquivo } = {}) {
  const conteudo = arquivo ?? await planilha(linhas);
  const caminho = `clientes/${cliente.id}/${mes}/semente_${++sequencia}_folha.xlsx`;
  memoria.arquivos.set(caminho, Buffer.from(conteudo));
  const { data, error } = await banco.from("processamentos_folha").insert({
    cliente_id: cliente.id, mes_referencia: mes, status, arquivo_origem_path: caminho,
  }).select("*").single();
  if (error) throw new Error(`Erro preparando processamentos_folha: ${error.message}`);
  return data;
}

export const comoUsuario = (api, usuario, caminho, metodo = "GET") => api.requisitar(caminho, { usuario, metodo });

// Fotografia das tabelas da Folha (dois escritórios) e do bucket: igual antes e depois = nada foi gravado.
export async function fotografarFolha(banco, memoria) {
  const foto = {
    storage: [...memoria.arquivos.entries()].map(([caminho, bytes]) => `${caminho}#${createHash("sha1").update(bytes).digest("hex")}`).sort(),
  };
  for (const tabela of TABELAS_DA_FOLHA) foto[tabela] = await lerTabela(banco, tabela);
  return foto;
}

export const contar = async (banco, tabela, filtros = {}) => (await lerTabela(banco, tabela, "id", filtros)).length;

export const ehPdf = conteudo => Buffer.isBuffer(conteudo) && conteudo.subarray(0, 4).toString() === "%PDF";

// ---------------------------------------------------------------------------------------------
// Espionagem das consultas ao banco (provar que o filtro de escritório está na consulta)
// ---------------------------------------------------------------------------------------------

// Troca supabase.from por um passa-adiante que registra os filtros `.eq(...)` aplicados a `tabela`.
// Com `ignorarClienteId`, a consulta segue SEM o `.eq("cliente_id", ...)`: é como se o controller
// tivesse esquecido o filtro (usado, com a RLS desligada, para provar a checagem de dono que vem depois).
// Quem chama restaura com a função devolvida.
export function espiarConsultas(tabela, { ignorarClienteId = false } = {}) {
  const registro = [];
  const embrulhar = construtor => new Proxy(construtor, {
    get(alvo, prop) {
      const valor = Reflect.get(alvo, prop, alvo);
      if (typeof valor !== "function" || prop === "then" || prop === "catch" || prop === "finally") {
        return typeof valor === "function" ? valor.bind(alvo) : valor;
      }
      return (...argumentos) => {
        if (prop === "eq") {
          registro.push([argumentos[0], argumentos[1]]);
          if (ignorarClienteId && argumentos[0] === "cliente_id") return embrulhar(alvo);
        }
        const resultado = valor.apply(alvo, argumentos);
        return resultado && typeof resultado === "object" && typeof resultado.then === "function" ? embrulhar(resultado) : resultado;
      };
    },
  });
  supabase.from = nome => {
    const construtor = (contextoDb.getStore() ?? servicoDb).from(nome);
    return nome === tabela ? embrulhar(construtor) : construtor;
  };
  return { registro, restaurar: () => { supabase.from = clienteDoContexto; } };
}
// Restaurar = voltar a delegar ao client do contexto (o Proxy de database.js guarda a sobrescrita).
const clienteDoContexto = nome => (contextoDb.getStore() ?? servicoDb).from(nome);

// Faz toda consulta de `tabela` com a operação `operacao` ("select", "insert", "update") devolver erro
// de banco. As demais tabelas e operações seguem de verdade. Quem chama restaura com a função devolvida.
export function falharConsultas(tabela, operacao, mensagem = "falha injetada no banco (teste)") {
  const erro = { data: null, error: { message: mensagem } };
  const falho = new Proxy({}, {
    get: (_, prop) => (prop === "then" ? resolve => resolve(erro) : () => falho),
  });
  supabase.from = nome => {
    const construtor = (contextoDb.getStore() ?? servicoDb).from(nome);
    if (nome !== tabela) return construtor;
    return new Proxy(construtor, {
      get(alvo, prop) {
        const valor = Reflect.get(alvo, prop, alvo);
        if (prop === operacao) return () => falho;
        return typeof valor === "function" ? valor.bind(alvo) : valor;
      },
    });
  };
  return { restaurar: () => { supabase.from = clienteDoContexto; } };
}

// LGPD: o texto não pode conter nenhum dos CPFs dados, nem só com dígitos nem mascarado (000.000.000-00).
// Confere os CPFs conhecidos do teste em vez de uma regex genérica (que casaria com pedaço de UUID).
export function assertSemCpf(texto, cpfs, contexto = "") {
  for (const cpf of cpfs) {
    const mascarado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    assert.ok(!texto.includes(cpf) && !texto.includes(mascarado), `${contexto}: o CPF ${cpf} apareceu em ${texto}`);
  }
}
