// Apoio dos testes HTTP da Conciliação (TEST-9, #686): requisição de verdade, token de usuário
// de verdade e banco descartável de verdade. Aqui só mora o que se repete entre os arquivos
// de tests/conciliacao/: montagem da massa #680, "quem chama", fotografia do banco e OFX.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { recriarMassa680 } from "./massa-680.js";
import { resetarBanco } from "./banco.js";
import { iniciarApiTeste } from "./http.js";
import { CONFIG_MASSA_680 } from "../fixtures/massa-680.js";

export const PERFIL = Object.freeze({
  EFFICIENCE: "admin_efficience",
  CLIENTE: "admin_cliente",
  FUNCIONARIO: "funcionario",
});

export const PERFIS_DA_AREA = [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE];

// UUID válido que não existe em nenhuma tabela da massa (prefixo da massa é 68000000-...).
export const UUID_INEXISTENTE = "99999999-9999-4999-8999-999999999999";

const TABELAS_FOTOGRAFADAS = [
  "extratos_bancarios", "transacoes_extrato", "lancamentos_contabeis", "conciliacoes", "pares_conciliacao",
];

// Testes de bug conhecido: ficam com `skip` e a issue no motivo. Com RODAR_BUGS_CONHECIDOS=1 eles
// rodam de verdade (é como se prova que o `skip` ainda é necessário e que o teste falha pelo
// motivo certo). Quando a issue for corrigida, trocar `conhecido(...)` por `{}`.
export function conhecido(motivo) {
  return process.env.RODAR_BUGS_CONHECIDOS === "1" ? {} : { skip: motivo };
}

// Descrição dos dois escritórios da massa #680. Os números seguem criarMassaDominio680:
// cada escritório tem 4 extratos (aguardando e erro sem conciliação; dois processados), uma
// sessão em andamento de 21 pares (7 automáticos, 7 prováveis com 1 confirmado, 7 sem par) e uma
// sessão concluída de 2 pares (automático e provável confirmado).
function descreverEscritorio(massa, indice) {
  const prefixo = CONFIG_MASSA_680.prefixoIds;
  const inicio = (indice + 1) * 10_000;
  const id = numero => `${prefixo}-${String(numero).padStart(12, "0")}`;
  const cliente = massa.tabelas.clientes[indice];
  const usuario = perfil => massa.tabelas.usuarios.find(item => item.cliente_id === cliente.id && item.perfil === perfil);
  return {
    rotulo: indice === 0 ? "A" : "B",
    cliente,
    usuario,
    extrato: { aguardando: id(inicio + 1), processado: id(inicio + 2), erro: id(inicio + 3), processadoMes9: id(inicio + 4) },
    sessaoAberta: id(inicio + 10),
    sessaoConcluida: id(inicio + 11),
    // i = posição do par na sessão (0..20 na aberta, 0..1 na concluída).
    parAberto: i => id(inicio + 500 + i),
    transacaoAberta: i => id(inicio + 100 + i),
    lancamentoAberto: i => id(inicio + 300 + i),
    parConcluido: i => id(inicio + 600 + i),
    transacaoConcluida: i => id(inicio + 200 + i),
    lancamentoConcluido: i => id(inicio + 400 + i),
  };
}

// Ator = quem chama. admin_efficience escolhe o escritório por cliente_id; os outros dois
// ficam presos ao cliente_id do token, então o ator só acrescenta o cliente quando precisa.
export function ator(escritorio, perfil) {
  return { escritorio, perfil, usuario: escritorio.usuario(perfil) };
}

export function atoresDe(escritorio) {
  return PERFIS_DA_AREA.map(perfil => ator(escritorio, perfil));
}

function comClienteNaQuery(caminho, a) {
  if (a.perfil !== PERFIL.EFFICIENCE) return caminho;
  return `${caminho}${caminho.includes("?") ? "&" : "?"}cliente_id=${a.escritorio.cliente.id}`;
}

export function chamar(api, a, { metodo = "GET", caminho, corpo, formulario, clienteIdCamelCase = false }) {
  let url = caminho;
  let corpoFinal = corpo;
  if (a.perfil === PERFIL.EFFICIENCE) {
    const chave = clienteIdCamelCase ? "clienteId" : "cliente_id";
    if (formulario) formulario.append(chave, a.escritorio.cliente.id);
    else if (metodo === "GET" || metodo === "DELETE") url = `${caminho}${caminho.includes("?") ? "&" : "?"}${chave}=${a.escritorio.cliente.id}`;
    else corpoFinal = { [chave]: a.escritorio.cliente.id, ...(corpo ?? {}) };
  }
  return api.requisitar(url, { usuario: a.usuario, metodo, corpo: corpoFinal, formulario });
}

// Cada teste recria a massa #680 (reset + carga): estado conhecido, sem herdar de teste anterior.
export async function iniciarBateria() {
  const api = await iniciarApiTeste();
  return {
    api,
    async recriar() {
      const { massa, banco } = await recriarMassa680();
      return { massa, banco, A: descreverEscritorio(massa, 0), B: descreverEscritorio(massa, 1) };
    },
    async encerrar() {
      try { await api.fechar(); }
      finally { await resetarBanco(); }
    },
  };
}

async function lerTudo(banco, tabela, clienteId) {
  let consulta = banco.from(tabela).select("*").order("id");
  if (clienteId && tabela !== "pares_conciliacao") consulta = consulta.eq("cliente_id", clienteId);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha lendo ${tabela}: ${error.message}`);
  return data;
}

// Fotografia de todas as tabelas da área. Sem clienteId: essas tabelas inteiras, dos dois escritórios. Com clienteId: só as
// linhas daquele escritório (os pares entram pelas conciliações dele). Comparar antes e depois
// de uma chamada recusada prova que nada mudou, nem do outro lado.
export async function fotografar(banco, clienteId = null) {
  const foto = {};
  for (const tabela of TABELAS_FOTOGRAFADAS) foto[tabela] = await lerTudo(banco, tabela, clienteId);
  if (clienteId) {
    const sessoes = new Set(foto.conciliacoes.map(item => item.id));
    foto.pares_conciliacao = foto.pares_conciliacao.filter(item => sessoes.has(item.conciliacao_id));
  }
  return foto;
}

export async function buscarLinha(banco, tabela, id) {
  const { data, error } = await banco.from(tabela).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha lendo ${tabela}: ${error.message}`);
  return data;
}

export async function buscarLinhas(banco, tabela, filtros = {}) {
  let consulta = banco.from(tabela).select("*").order("id");
  for (const [coluna, valor] of Object.entries(filtros)) consulta = consulta.eq(coluna, valor);
  const { data, error } = await consulta;
  if (error) throw new Error(`Falha lendo ${tabela}: ${error.message}`);
  return data;
}

async function inserir(banco, tabela, linhas) {
  const { data, error } = await banco.from(tabela).insert(linhas).select("*");
  if (error) throw new Error(`Erro preparando ${tabela}: ${error.message}`);
  return data;
}

// Extrato já processado (como o upload deixa) com as transações dadas: { data, valor, tipo, descricao }.
export async function criarExtratoProcessado(banco, clienteId, { mes, ano, transacoes = [], nome = "extrato-teste.ofx" }) {
  const [extrato] = await inserir(banco, "extratos_bancarios", {
    cliente_id: clienteId, banco: "0341", conta: "7890", mes, ano, arquivo_nome: nome,
    status: "processado", processado_em: new Date().toISOString(),
    arquivo_hash: createHash("sha256").update(`${clienteId}-${nome}-${mes}-${ano}`).digest("hex"),
  });
  const linhas = transacoes.length
    ? await inserir(banco, "transacoes_extrato", transacoes.map((t, i) => ({
      extrato_id: extrato.id, cliente_id: clienteId, data_lancamento: t.data, valor: t.valor,
      tipo: t.tipo, descricao: t.descricao ?? null, id_banco: t.id_banco ?? `FIT-${extrato.id.slice(0, 8)}-${i}`,
    })))
    : [];
  return { extrato, transacoes: linhas };
}

// Lançamentos contábeis: { data, valor, tipo, descricao }.
export async function criarLancamentos(banco, clienteId, lancamentos) {
  return inserir(banco, "lancamentos_contabeis", lancamentos.map(l => ({
    cliente_id: clienteId, data_lancamento: l.data, valor: l.valor, tipo: l.tipo,
    descricao: l.descricao ?? "Lançamento sintético #686", categoria: l.categoria ?? null,
  })));
}

// Cenário de novembro/2026 usado nos testes de POST /conciliacoes e do fluxo completo.
// Os pares esperados saem da regra do matching (conciliacao-matching.util.js): automático =
// mesmo tipo, valor com diferença <= R$ 0,01 e mesmo dia; provável = idem com até 3 dias.
//   T1 crédito 1.000,00 em 03/11  x  L1 crédito 1.000,00 em 03/11  -> automático
//   T2 débito    250,50 em 10/11  x  L2 débito    250,50 em 12/11  -> provável (2 dias)
//   T3 crédito    80,00 em 15/11  x  L3 débito     80,00 em 15/11  -> tipo oposto: ficam os dois sem par
//   T4 débito     30,00 em 20/11  (sem lançamento)                 -> transação sem par
//   L4 crédito     5,00 em 28/11  (sem transação)                  -> lançamento sem par
export const CENARIO_NOVEMBRO = Object.freeze({
  transacoes: [
    { data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "T1 deposito" },
    { data: "2026-11-10", valor: 250.5, tipo: "debito", descricao: "T2 tarifa" },
    { data: "2026-11-15", valor: 80, tipo: "credito", descricao: "T3 pix" },
    { data: "2026-11-20", valor: 30, tipo: "debito", descricao: "T4 sem lancamento" },
  ],
  lancamentos: [
    { data: "2026-11-03", valor: 1000, tipo: "credito", descricao: "L1 deposito" },
    { data: "2026-11-12", valor: 250.5, tipo: "debito", descricao: "L2 tarifa" },
    { data: "2026-11-15", valor: 80, tipo: "debito", descricao: "L3 pix oposto" },
    { data: "2026-11-28", valor: 5, tipo: "credito", descricao: "L4 sem transacao" },
  ],
});

export async function montarCenarioNovembro(banco, clienteId, { nome = "novembro.ofx" } = {}) {
  const { extrato, transacoes } = await criarExtratoProcessado(banco, clienteId, {
    mes: 11, ano: 2026, transacoes: CENARIO_NOVEMBRO.transacoes, nome,
  });
  const lancamentos = await criarLancamentos(banco, clienteId, CENARIO_NOVEMBRO.lancamentos);
  const porDescricao = (lista, inicio) => lista.find(item => item.descricao.startsWith(inicio));
  return {
    extrato,
    T: n => porDescricao(transacoes, `T${n} `),
    L: n => porDescricao(lancamentos, `L${n} `),
  };
}

// OFX no formato SGML solto dos bancos brasileiros. Cada transação: { tipo, data, valor, fitid, memo }.
export function montarOfx({ banco = "0341", conta = "1234567890", transacoes }) {
  const blocos = transacoes.map(t => `<STMTTRN>
<TRNTYPE>${t.tipo ?? (Number(t.valor) < 0 ? "DEBIT" : "CREDIT")}
<DTPOSTED>${t.data}
<TRNAMT>${t.valor}
<FITID>${t.fitid}
<MEMO>${t.memo ?? "SEM MEMO"}
</STMTTRN>`).join("\n");
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>${banco}
<ACCTID>${conta}
</BANKACCTFROM>
<BANKTRANLIST>
${blocos}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

// Extrato de novembro/2026 com 2 transações: 11/11 débito de 150,00 e 16/11 crédito de 1.500,00.
export const OFX_NOVEMBRO = {
  transacoes: [
    { data: "20261105", valor: "-150.00", fitid: "NOV-1", memo: "PAGAMENTO BOLETO" },
    { data: "20261110", valor: "1500.00", fitid: "NOV-2", memo: "DEPOSITO" },
  ],
};

export function formularioOfx(conteudo, { nome = "extrato.ofx", campos = {} } = {}) {
  const formulario = new FormData();
  for (const [chave, valor] of Object.entries(campos)) formulario.append(chave, String(valor));
  formulario.append("arquivo", new Blob([Buffer.from(conteudo, "latin1")], { type: "application/octet-stream" }), nome);
  return formulario;
}

export function hashDoArquivo(conteudo) {
  return createHash("sha256").update(Buffer.from(conteudo, "latin1")).digest("hex");
}

export function paraEpoch(valor) {
  return Date.parse(valor);
}

// Sessão com N pares automático e, opcionalmente, 1 provável pendente no fim
// (maior id → segunda página do PostgREST). Usada nos testes da PRB-C-09/#696.
export async function montarSessaoComMuitosPares(banco, clienteId, {
  automaticos,
  comProvavelPendente = false,
  mes = 12,
  ano = 2026,
}) {
  const { extrato } = await criarExtratoProcessado(banco, clienteId, {
    mes,
    ano,
    nome: `volume-${automaticos}-${comProvavelPendente ? "pendente" : "ok"}.ofx`,
    transacoes: [{ data: `${ano}-${String(mes).padStart(2, "0")}-01`, valor: 1, tipo: "credito", descricao: "base" }],
  });
  const insercaoSessao = await banco.from("conciliacoes").insert({
    cliente_id: clienteId,
    extrato_id: extrato.id,
    mes,
    ano,
    status: "em_andamento",
    total_transacoes: automaticos + (comProvavelPendente ? 1 : 0),
    total_conciliadas: 0,
    total_pendentes: automaticos + (comProvavelPendente ? 1 : 0),
  }).select("*");
  assert.equal(insercaoSessao.error, null, insercaoSessao.error?.message);
  const sessao = insercaoSessao.data[0];

  const total = automaticos + (comProvavelPendente ? 1 : 0);
  const transacoes = [];
  const lancamentos = [];
  const pares = [];
  for (let i = 0; i < total; i++) {
    const tid = randomUUID();
    const lid = randomUUID();
    const pid = randomUUID();
    const data = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const automatico = i < automaticos;
    transacoes.push({
      id: tid, extrato_id: extrato.id, cliente_id: clienteId, data_lancamento: data,
      valor: i + 1, tipo: "credito", descricao: `T${i}`, id_banco: `VOL-${i}`, conciliado: false,
    });
    lancamentos.push({
      id: lid, cliente_id: clienteId, data_lancamento: data, valor: i + 1, tipo: "credito",
      descricao: `volume-L${i}`, categoria: "volume-696", conciliado: false,
    });
    pares.push({
      id: pid, conciliacao_id: sessao.id, transacao_id: tid, lancamento_id: lid,
      confianca: automatico ? "automatico" : "provavel",
      confirmado_em: null, confirmado_por: null,
    });
  }

  for (let inicio = 0; inicio < transacoes.length; inicio += 200) {
    const fim = inicio + 200;
    const { error: eT } = await banco.from("transacoes_extrato").insert(transacoes.slice(inicio, fim));
    assert.equal(eT, null, eT?.message);
    const { error: eL } = await banco.from("lancamentos_contabeis").insert(lancamentos.slice(inicio, fim));
    assert.equal(eL, null, eL?.message);
    const { error: eP } = await banco.from("pares_conciliacao").insert(pares.slice(inicio, fim));
    assert.equal(eP, null, eP?.message);
  }

  return { extrato, sessao, pares, transacoes, lancamentos };
}

// Prova "outro escritório = mesmo 404 de id inexistente" com o dado do outro lado presente.
// Para cada ator do escritório A: o pedido ao alvo (linha existente do B) e o pedido a um UUID
// que não existe têm de dar a MESMA resposta (404, mesmo corpo), e as tabelas da Conciliação não mudam.
//   alvo   = { tabela, id } da linha do outro escritório (conferida antes de chamar)
//   montar = (id, ator) => opções de chamar() para esse id
export async function provarOutroEscritorio404(api, banco, { alvo, atores, montar, mensagem }) {
  const linha = await buscarLinha(banco, alvo.tabela, alvo.id);
  if (!linha) throw new Error(`O alvo ${alvo.tabela}/${alvo.id} do outro escritório precisa existir.`);
  for (const a of atores) {
    const antes = await fotografar(banco);
    const inexistente = await chamar(api, a, montar(UUID_INEXISTENTE, a));
    const real = await chamar(api, a, montar(alvo.id, a));
    const quem = `${a.perfil} do ${a.escritorio.rotulo}`;
    assert.equal(inexistente.status, 404, `${quem}: id inexistente`);
    if (mensagem) assert.deepEqual(inexistente.corpo, { erro: mensagem }, `${quem}: corpo do inexistente`);
    assert.equal(real.status, 404, `${quem}: linha do outro escritório`);
    assert.deepEqual(real.corpo, inexistente.corpo, `${quem}: mesmo corpo do inexistente`);
    assert.deepEqual(await fotografar(banco), antes, `${quem}: banco não pode mudar`);
    assert.deepEqual(await buscarLinha(banco, alvo.tabela, alvo.id), linha, `${quem}: alvo intacto`);
  }
}
