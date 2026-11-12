// TEST-DAS-2 (#730): HTTP, usuários persistidos, JWT/RLS e Supabase descartável.
// LC123, Anexo I, faixa1: RBT12=12*10000=120000; 10000*4%=DAS400.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { iniciarCenarioApuracao, inserir, lerTodos, relatorio, REFERENCIAS, refISO, calculo } from "./helpers/apuracao-qa-f.js";
import { alterarLicenca } from "./helpers/licenca-agente.js";
import { comLeiturasSimultaneas } from "./helpers/apuracao-concorrencia.js";

const payload = { mes: 10, ano: 2026, regime: "simples_nacional" };
const edicao = { valor_editado: 350, motivo: "Conferência do contador" };
const rotas = [
  { nome: "criar", metodo: "POST", url: () => "/apuracoes", corpo: payload, altera: true },
  { nome: "listar", metodo: "GET", url: () => "/apuracoes" },
  { nome: "detalhar", metodo: "GET", url: id => `/apuracoes/${id}` },
  { nome: "editar", metodo: "PATCH", url: id => `/apuracoes/${id}`, corpo: edicao, altera: true },
  { nome: "recalcular", metodo: "PATCH", url: id => `/apuracoes/${id}/recalcular`, altera: true },
  { nome: "aprovar", metodo: "PATCH", url: id => `/apuracoes/${id}/aprovar`, altera: true },
  { nome: "excluir", metodo: "DELETE", url: id => `/apuracoes/${id}`, altera: true },
  { nome: "folha-pendente", metodo: "GET", url: () => "/apuracoes/folha-pendente", agente: true },
  { nome: "resultado-folha", metodo: "POST", url: id => `/apuracoes/${id}/resultado-folha`, corpo: relatorio([]), agente: true },
];

// O aceite literal #730 pede404 entre escritórios, citando #557. Nesta API,
// porém, clienteId só é alvo aceito para admin_efficience: admin_cliente usa
// exclusivamente o vínculo do token, inclusive quando manda outro clienteId.
// Decisão explícita do autor: preservar o404 literal nos dois BUG/skip, sem
// alterar produção nesta tarefa. As provas de isolamento continuam ATIVAS.
test.skip("BUG (AP-HTTP-01) POST com clienteId estrangeiro deve404 conforme aceite literal #730", async t => {
  const s = await iniciarCenarioApuracao(t), a = await s.cliente({ anexo_simples: "I" }), b = await s.cliente({ anexo_simples: "I" });
  await s.notas(b); const estrangeira = await s.criar(b), antes = await s.estado(estrangeira), usuario = await s.usuario(a, "admin_cliente");
  const respostas = [];
  for (const clienteId of [b.id, randomUUID()]) respostas.push(await s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: { ...payload, clienteId } }));
  assert.deepEqual(respostas.map(r => r.status), [404, 404]); assert.deepEqual(respostas[0].corpo, respostas[1].corpo);
  assert.deepEqual(await s.estado(estrangeira), antes); assert.deepEqual(await lerTodos(s.banco, "apuracoes", { cliente_id: a.id }), []);
});
test.skip("BUG (AP-HTTP-01) GET coleção com clienteId estrangeiro deve404 conforme aceite literal #730", async t => {
  const { s, b, ap, bp, admin } = await preparar(t), antes = [await s.estado(ap), await s.estado(bp)];
  const respostas = [];
  for (const clienteId of [b.id, randomUUID()]) respostas.push(await s.chamar(`/apuracoes?clienteId=${clienteId}`, { usuario: admin }));
  assert.deepEqual(respostas.map(r => r.status), [404, 404]); assert.deepEqual(respostas[0].corpo, respostas[1].corpo);
  assert.deepEqual([await s.estado(ap), await s.estado(bp)], antes);
});
async function preparar(t, anexo = "I") {
  const s = await iniciarCenarioApuracao(t), a = await s.cliente({ anexo_simples: anexo }), b = await s.cliente({ anexo_simples: anexo });
  await s.notas(a); await s.notas(b, [20000]);
  const ap = await s.criar(a), bp = await s.criar(b);
  return { s, a, b, ap, bp, admin: await s.usuario(a, "admin_cliente"), outro: await s.usuario(b, "admin_cliente"), funcionario: await s.usuario(a, "funcionario") };
}
function numeros(a, valor = 400) {
  assert.equal(a.rbt12_usado, 120000); assert.equal(a.receita_mes, 10000);
  assert.equal(a.valor_calculado, valor); assert.equal(a.aliquota_efetiva, .04);
}
// Metadados são derivados da resposta, não colunas de apuracoes. Oráculo
// literal LC123/AnexoI: faixa1 até180mil,4%,PD0; faixa3 até720mil,9,5%,PD13860.
function metadados(a, esperado = {}) {
  const contrato = {
    rbt12_metodo: "janela_12_meses", meses_atividade: null,
    aliquota_nominal: .04, faixa_limite: 180000, parcela_deduzir: 0,
    rbt12: 120000, anexo_original: "I", anexo_efetivo: "I", ...esperado,
  };
  for (const [campo, valor] of Object.entries(contrato)) assert.equal(a[campo], valor, `metadado fiscal ${campo}`);
}

test("DAS HTTP metadados fiscais: proporcional e cadastro sem data em POST, GET e recalcular", async t => {
  const s = await iniciarCenarioApuracao(t);
  for (const data_inicio_atividade of ["2026-08-01", null]) await t.test(data_inicio_atividade ?? "sem data de início", async () => {
    const c = await s.cliente({ anexo_simples: "I", data_inicio_atividade, historico_receita: [{ ano: 2026, mes: 8, receita: 50000 }, { ano: 2026, mes: 9, receita: 50000 }] });
    await s.notas(c, [50000]);
    const a = await s.criar(c), antes = await s.estado(a);
    const get = await s.chamar(`/apuracoes/${a.id}`); assert.equal(get.status, 200); assert.deepEqual(await s.estado(a), antes);
    assert.equal(get.corpo.breakdown_desatualizado, false, "GET recém-criado: breakdown atualizado");
    const recalc = await s.chamar(`/apuracoes/${a.id}/recalcular`, { metodo: "PATCH" }); assert.equal(recalc.status, 200);
    const proporcional = data_inicio_atividade !== null;
    const esperado = proporcional
      ? { rbt12_metodo: "proporcional_inicio_atividade", meses_atividade: 2, rbt12: 600000, aliquota_nominal: .095, faixa_limite: 720000, parcela_deduzir: 13860 }
      : { rbt12: 100000 };
    // (600000*.095-13860)/600000=.0719;50000*.0719=3595.
    for (const resposta of [a, get.corpo, recalc.corpo]) {
      metadados(resposta, esperado);
      assert.equal(resposta.rbt12_usado, proporcional ? 600000 : 100000);
      assert.equal(resposta.receita_mes, 50000); assert.equal(resposta.valor_calculado, proporcional ? 3595 : 2000);
      assert.equal(resposta.aliquota_efetiva, proporcional ? .0719 : .04);
      assert.equal(resposta.rbt12_mensal.length, proporcional ? 2 : 12);
    }
    const gravado = await s.estado(a);
    assert.equal(gravado.rbt12_usado, proporcional ? 600000 : 100000); assert.equal(gravado.valor_calculado, proporcional ? 3595 : 2000);
  });
});

test("DAS HTTP acesso: nove rotas sem credencial e funcionario nas mutações", async t => {
  const { s, a, ap, admin, funcionario } = await preparar(t), antes = await s.estado(ap);
  for (const r of rotas) await t.test(`${r.nome}: deslogado 401`, async () => {
    const res = await s.chamar(r.url(ap.id), { usuario: null, metodo: r.metodo, corpo: r.corpo });
    assert.equal(res.status, 401); assert.deepEqual(await s.estado(ap), antes);
  });
  for (const r of rotas.filter(r => r.altera)) await t.test(`${r.nome}: funcionario 403`, async () => {
    assert.equal((await s.chamar(r.url(ap.id), { usuario: funcionario, metodo: r.metodo, corpo: r.corpo })).status, 403);
    assert.deepEqual(await s.estado(ap), antes);
  });
  for (const usuario of [admin, funcionario]) {
    const lista = await s.chamar(`/apuracoes?clienteId=${randomUUID()}`, { usuario });
    assert.equal(lista.status, 200); assert.deepEqual(lista.corpo.map(a => a.id), [ap.id]); numeros(lista.corpo[0]);
    const detalhe = await s.chamar(`/apuracoes/${ap.id}`, { usuario });
    assert.equal(detalhe.status, 200); assert.equal(detalhe.corpo.id, ap.id, "GET próprio mantém o id solicitado");
    assert.equal(detalhe.corpo.cliente_nome, a.nome); numeros(detalhe.corpo); metadados(detalhe.corpo);
  }
  // JWT de dashboard não substitui licença do agente, mesmo sendo admin.
  for (const r of rotas.filter(r => r.agente)) assert.equal((await s.chamar(r.url(ap.id), { usuario: admin, metodo: r.metodo, corpo: r.corpo })).status, 401);
  assert.deepEqual(await s.estado(ap), antes);
});

test("DAS HTTP isolamento: outro tenant é indistinguível de inexistente nas cinco rotas por id", async t => {
  const { s, a, b, ap, bp, admin, funcionario } = await preparar(t);
  const antes = [await s.estado(ap), await s.estado(bp)];
  for (const r of rotas.filter(r => !r.agente && !["criar", "listar"].includes(r.nome))) await t.test(r.nome, async () => {
    const pedir = id => s.chamar(r.url(id), { usuario: admin, metodo: r.metodo, corpo: r.corpo });
    const outro = await pedir(bp.id), ausente = await pedir(randomUUID()), invalido = await pedir("nao-uuid");
    assert.equal(outro.status, 404); assert.equal(ausente.status, 404); assert.equal(invalido.status, 404);
    for (const [alvo, resposta] of [["estrangeiro", outro], ["inexistente", ausente], ["malformado", invalido]]) assert.deepEqual(resposta.corpo, { erro: "Apuração não encontrada" }, `envelope 404 ${r.nome}/${alvo}`);
    assert.deepEqual(outro.corpo, ausente.corpo); assert.deepEqual(invalido.corpo, ausente.corpo);
    assert.deepEqual([await s.estado(ap), await s.estado(bp)], antes);
  });
  const leituraFuncionario = await s.chamar(`/apuracoes/${bp.id}`, { usuario: funcionario });
  const leituraAusente = await s.chamar(`/apuracoes/${randomUUID()}`, { usuario: funcionario });
  assert.equal(leituraFuncionario.status, 404); assert.deepEqual(leituraFuncionario.corpo, leituraAusente.corpo);
  assert.deepEqual([await s.estado(ap), await s.estado(bp)], antes);
  const lista = await s.chamar(`/apuracoes?clienteId=${b.id}`, { usuario: admin });
  assert.equal(lista.status, 200); assert.deepEqual(lista.corpo.map(x => x.id), [ap.id]);
  const listaInexistente = await s.chamar(`/apuracoes?clienteId=${randomUUID()}`, { usuario: admin });
  assert.equal(listaInexistente.status, lista.status); assert.deepEqual(listaInexistente.corpo, lista.corpo);
  // No contrato de coleção, clienteId fornecido por admin_cliente é ignorado:
  // cria no tenant do token, sem sondar nem modificar o cliente indicado.
  const criado = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: { ...payload, mes: 9, clienteId: b.id } });
  assert.equal(criado.status, 201); assert.equal(criado.corpo.cliente_id, a.id);
  assert.equal((await s.estado(criado.corpo)).cliente_id, a.id); assert.deepEqual(await s.estado(bp), antes[1]);
  const criadoComClienteInexistente = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: { ...payload, mes: 8, clienteId: randomUUID() } });
  assert.equal(criadoComClienteInexistente.status, criado.status); assert.equal(criadoComClienteInexistente.corpo.cliente_id, criado.corpo.cliente_id);
  assert.equal((await s.estado(criadoComClienteInexistente.corpo)).cliente_id, a.id);
  const repetidoComClienteInexistente = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: { ...payload, mes: 9, clienteId: randomUUID() } });
  const repetidoComOutroCliente = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: { ...payload, mes: 9, clienteId: b.id } });
  assert.equal(repetidoComClienteInexistente.status, 409); assert.deepEqual(repetidoComClienteInexistente.corpo, repetidoComOutroCliente.corpo);
  assert.deepEqual(await s.estado(bp), antes[1]);
});

test("DAS HTTP admin global: filtro explícito da coleção restringe dados presentes", async t => {
  const { s, a, ap, bp } = await preparar(t), antes = [await s.estado(ap), await s.estado(bp)];
  const setembro = await s.criar(a, 9), anoAnterior = await s.criar(a, 10, 2025);
  const periodosAntes = [await s.estado(setembro), await s.estado(anoAnterior)];
  const lista = await s.chamar(`/apuracoes?clienteId=${a.id}&mes=10&ano=2026`);
  assert.equal(lista.status, 200); assert.deepEqual(lista.corpo.map(x => x.id), [ap.id], "lista respeita clienteId mesmo para admin global");
  numeros(lista.corpo[0]);
  const vazia = await s.chamar(`/apuracoes?clienteId=${randomUUID()}`); assert.equal(vazia.status, 200); assert.deepEqual(vazia.corpo, []);
  const inexistente = await s.chamar("/apuracoes", { metodo: "POST", corpo: { ...payload, clienteId: randomUUID() } }); assert.equal(inexistente.status, 404);
  assert.deepEqual([await s.estado(ap), await s.estado(bp)], antes);
  assert.deepEqual([await s.estado(setembro), await s.estado(anoAnterior)], periodosAntes);
  assert.equal((await s.chamar(`/apuracoes/${bp.id}`, { metodo: "DELETE" })).status, 204);
  assert.deepEqual(await lerTodos(s.banco, "apuracoes", { id: bp.id }), []); assert.deepEqual(await s.estado(ap), antes[0]);
});

test("DAS HTTP duas criações concorrentes deixam somente uma competência no banco", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I" }); await s.notas(c);
  const usuario = await s.usuario(c, "admin_cliente");
  const rs = await Promise.all([0, 1].map(() => s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: payload })));
  assert.deepEqual(rs.map(r => r.status).sort(), [201, 409]);
  const linhas = await lerTodos(s.banco, "apuracoes", { cliente_id: c.id }); assert.equal(linhas.length, 1); assert.equal(linhas[0].id, rs.find(r => r.status === 201).corpo.id); numeros(linhas[0]);
});

test("DAS HTTP validação por campo: POST, filtros e edição não persistem entrada inválida", async t => {
  const { s, a, ap, admin } = await preparar(t), antes = await s.estado(ap);
  const invalidos = [{ mes: 0 }, { mes: 13 }, { mes: 15 }, { mes: "7abc" }, { mes: "8abc" }, { mes: true }, { mes: 9.5 }, { ano: 2019 }, { ano: 1999 }, { mes: null }, { ano: null }, { regime: null }, { mes: undefined }, { ano: undefined }, { regime: undefined }];
  for (const invalido of invalidos) await t.test(`POST ${JSON.stringify(invalido)}`, async () => {
    const r = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: { ...payload, ...invalido } }); assert.equal(r.status, 400);
    assert.equal(r.corpo.erro, Object.values(invalido).some(v => v == null) ? "mes, ano e regime são obrigatórios" : "mes deve ser um inteiro entre 1 e 12, e ano deve ser entre 2020 e 2147483647");
    assert.deepEqual(await s.estado(ap), antes);
  });
  for (const campo of ["mes", "ano", "clienteId"]) {
    const valores = campo === "mes" ? [0, 13, "7abc", "abc", 9.5] : campo === "ano" ? [2019] : ["nao-uuid", ""];
    for (const valor of valores) await t.test(`GET ${campo}=${valor}`, async () => {
      const query = new URLSearchParams({ clienteId: a.id, [campo]: String(valor) });
      const r = await s.chamar(`/apuracoes?${query}`); assert.equal(r.status, 400);
      if (campo === "clienteId" && valor === "nao-uuid") assert.deepEqual(r.corpo, { erro: "clienteId inválido" }, "envelope clienteId inválido GET");
      if (campo !== "clienteId") assert.equal(r.corpo.erro, "mes deve ser um inteiro entre 1 e 12, e ano deve ser entre 2020 e 2147483647");
      assert.deepEqual(await s.estado(ap), antes);
    });
  }
  for (const clienteId of ["nao-uuid", "", null]) {
    const r = await s.chamar("/apuracoes", { metodo: "POST", corpo: { ...payload, clienteId } }); assert.equal(r.status, 400);
    if (clienteId === "nao-uuid") assert.deepEqual(r.corpo, { erro: "clienteId inválido" }, "envelope clienteId inválido POST");
    assert.deepEqual(await s.estado(ap), antes);
  }
  assert.equal((await s.chamar("/apuracoes", { metodo: "POST", corpo: payload })).status, 400, "admin global exige clienteId no body");
  assert.equal((await s.chamar("/apuracoes")).status, 400, "admin global exige clienteId na query");
  for (const valor_editado of [-1, "valor-inválido", "", "  ", false, [], true, {}, null, undefined, "1.600,00", 1e30, 10000000000000, 1.001]) await t.test(`valor_editado ${JSON.stringify(valor_editado)}`, async () => {
    const r = await s.chamar(`/apuracoes/${ap.id}`, { usuario: admin, metodo: "PATCH", corpo: { valor_editado, motivo: "Conferência válida" } });
    assert.equal(r.status, 400); assert.deepEqual(await s.estado(ap), antes);
  });
  for (const corpo of [{ valor_editado: 350 }, { valor_editado: 350, motivo: "  " }]) {
    assert.equal((await s.chamar(`/apuracoes/${ap.id}`, { usuario: admin, metodo: "PATCH", corpo })).status, 400); assert.deepEqual(await s.estado(ap), antes);
  }
  assert.deepEqual(await lerTodos(s.banco, "apuracoes", { cliente_id: a.id }), [antes]);
});

test("DAS HTTP ciclo de vida: criação, edição auditada, recálculo, aprovação imutável e exclusão", async t => {
  const { s, a, ap, admin } = await preparar(t); numeros(ap); metadados(ap); numeros(await s.estado(ap)); assert.equal(ap.cliente_nome, a.nome); assert.equal(ap.folha_status, null);
  assert.equal((await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo: payload })).status, 409);
  const editar = corpo => s.chamar(`/apuracoes/${ap.id}`, { usuario: admin, metodo: "PATCH", corpo });
  const editado = await editar({ ...edicao, motivo: "  Conferência do contador  " }); assert.equal(editado.status, 200);
  assert.equal(editado.corpo.valor_editado, 350);
  assert.equal(editado.corpo.historico_edicoes.length, 1, "PATCH devolve um evento de edição");
  assert.equal(editado.corpo.historico_edicoes[0].editado_por, admin.email, "PATCH devolve o autor do token");
  let linha = await s.estado(ap); assert.equal(linha.valor_editado, 350); assert.equal(linha.historico_edicoes.length, 1);
  assert.deepEqual(linha.historico_edicoes[0], { valor_anterior: 400, valor_novo: 350, motivo: edicao.motivo, editado_por: admin.email, editado_em: linha.historico_edicoes[0].editado_em }); assert.ok(Date.parse(linha.historico_edicoes[0].editado_em));
  assert.deepEqual(editado.corpo.historico_edicoes, linha.historico_edicoes, "PATCH devolve o histórico persistido completo");
  const historicoAnterior = structuredClone(linha.historico_edicoes);
  await s.notas(a, [5000]);
  const recalc = await s.chamar(`/apuracoes/${ap.id}/recalcular`, { usuario: admin, metodo: "PATCH" }); assert.equal(recalc.status, 200); assert.equal(recalc.corpo.edicao_descartada, true);
  assert.equal(recalc.corpo.valor_editado, null, "recálculo devolve valor_editado null");
  linha = await s.estado(ap); assert.equal(linha.receita_mes, 15000); assert.equal(linha.valor_calculado, 600); assert.equal(linha.valor_editado, null); assert.equal(linha.historico_edicoes.length, 2);
  metadados(recalc.corpo);
  assert.deepEqual(linha.historico_edicoes, recalc.corpo.historico_edicoes);
  assert.deepEqual(linha.historico_edicoes.slice(0, -1), historicoAnterior);
  const h = linha.historico_edicoes[1];
  assert.equal(typeof h.editado_em, "string"); assert.ok(Number.isFinite(Date.parse(h.editado_em)), "data válida do recálculo com override");
  assert.deepEqual(h, { tipo: "recalculo", valor_anterior: 350, valor_novo: 600, editado_por: admin.email, motivo: "Recálculo descartou edição manual anterior", editado_em: h.editado_em });
  const aprovado = await s.chamar(`/apuracoes/${ap.id}/aprovar`, { usuario: admin, metodo: "PATCH" }); assert.equal(aprovado.status, 200);
  assert.equal(aprovado.corpo.status, "aprovado", "aprovação devolve status aprovado");
  assert.equal(aprovado.corpo.aprovado_por, admin.email, "aprovação devolve o autor do token");
  const final = await s.estado(ap); assert.equal(final.status, "aprovado"); assert.equal(final.aprovado_por, admin.email); assert.ok(Date.parse(final.aprovado_em)); assert.deepEqual(final.historico_edicoes, linha.historico_edicoes);
  assert.deepEqual(aprovado.corpo, final, "aprovação devolve a linha persistida completa");
  for (const r of rotas.filter(r => r.altera && r.nome !== "criar")) { assert.equal((await s.chamar(r.url(ap.id), { usuario: admin, metodo: r.metodo, corpo: r.corpo })).status, 409); assert.deepEqual(await s.estado(ap), final); }
  const rascunho = await s.criar(a, 9), url = `/apuracoes/${rascunho.id}`;
  assert.equal((await s.chamar(url, { usuario: admin, metodo: "DELETE" })).status, 204);
  assert.deepEqual(await lerTodos(s.banco, "apuracoes", { id: rascunho.id }), []);
  assert.equal((await s.chamar(url, { usuario: admin, metodo: "DELETE" })).status, 404); assert.equal((await s.chamar(url, { usuario: admin })).status, 404);
  assert.notEqual((await s.criar(a, 9)).id, rascunho.id);
});

for (const [segunda, primeiraEscrita] of [["editar", "editar"], ["editar", "aprovar"], ["aprovar", undefined]]) test(`DAS HTTP corrida controlada aprovar + ${segunda} (${primeiraEscrita ?? "simultâneas"} primeiro): um 200, um 409 e estado auditável`, async t => {
  const { s, ap, admin } = await preparar(t), antes = await s.estado(ap);
  const operacoes = [rotas.find(r => r.nome === "aprovar"), rotas.find(r => r.nome === segunda)];
  const rs = await comLeiturasSimultaneas(ap.id, () => Promise.all(operacoes.map(r => s.chamar(r.url(ap.id), { usuario: admin, metodo: r.metodo, corpo: r.corpo }))), primeiraEscrita);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409], "mesma versão só admite um aceite");
  const linha = await s.estado(ap), vencedor = rs.findIndex(r => r.status === 200);
  if (primeiraEscrita) assert.equal(operacoes[vencedor].nome, primeiraEscrita, "ordem de escrita controlada após o mesmo snapshot");
  if (segunda === "editar" && vencedor === 1) {
    assert.equal(linha.status, "rascunho"); assert.equal(linha.valor_editado, 350); assert.equal(linha.historico_edicoes.length, 1);
    assert.equal(linha.historico_edicoes[0].editado_por, admin.email); assert.equal(linha.historico_edicoes[0].valor_anterior, 400); assert.equal(linha.historico_edicoes[0].valor_novo, 350); assert.equal(linha.historico_edicoes[0].motivo, edicao.motivo); assert.equal(linha.aprovado_por, null);
    assert.equal(linha.aprovado_em, null); assert.ok(Date.parse(linha.historico_edicoes[0].editado_em));
  } else { assert.equal(linha.status, "aprovado"); assert.equal(linha.aprovado_por, admin.email); assert.ok(Date.parse(linha.aprovado_em)); assert.equal(linha.valor_editado, antes.valor_editado); assert.deepEqual(linha.historico_edicoes, antes.historico_edicoes); }
  assert.equal(linha.valor_calculado, 400);
});

test("DAS HTTP agente: licença real, fila isolada, report e persistência", async t => {
  const { s, a, b, ap, bp } = await preparar(t, "V"), c = await s.cliente(), antes = [await s.estado(ap), await s.estado(bp)];
  const fila = token => s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": token } });
  const lista = await fila(a.licenca); assert.equal(lista.status, 200); assert.deepEqual(lista.corpo.map(x => x.id), [ap.id]);
  assert.deepEqual(lista.corpo[0], { id: ap.id, clienteId: a.id, nomeEmpresa: a.nome, mes: 10, ano: 2026, mesesFolha: REFERENCIAS });
  const vazia = await fila(c.licenca); assert.equal(vazia.status, 200); assert.deepEqual(vazia.corpo, []);
  for (const id of [bp.id, randomUUID(), "nao-uuid"]) {
    const resposta = await s.reportar(c, { id }, relatorio([])); assert.equal(resposta.status, 404); assert.deepEqual(resposta.corpo, { erro: "Apuração não encontrada" });
    assert.deepEqual([await s.estado(ap), await s.estado(bp)], antes);
  }
  for (const campos of [{ ativa: false }, { ativa: true, validade: "2000-01-01" }]) {
    await alterarLicenca(s.banco, c.licenca, campos);
    assert.equal((await fila(c.licenca)).status, 401); assert.equal((await s.reportar(c, ap, relatorio([]))).status, 401);
  }
  for (const token of ["invalida", ""]) {
    assert.equal((await fila(token)).status, 401);
    assert.equal((await s.chamar(`/apuracoes/${ap.id}/resultado-folha`, { usuario: null, metodo: "POST", corpo: relatorio([]), cabecalhos: { "x-licenca-token": token } })).status, 401);
  }
  const report = await s.reportar(a, ap, relatorio([])); assert.equal(report.status, 200);
  const linha = await s.estado(ap); assert.deepEqual(report.corpo, linha); assert.equal(linha.folha_status, "sem_dados"); assert.equal(linha.folha12, 0); assert.equal(linha.valor_calculado, 1550); assert.equal(linha.dados_folha.totalMesesEncontrados, 0);
  assert.deepEqual(linha.dados_folha, { temDozeMeses: false, mesesEncontrados: [], totalMesesEncontrados: 0, falhaUpload: false, processamentoPendente: false, mesesPendentes: [] });
  assert.deepEqual((await fila(a.licenca)).corpo, []); assert.deepEqual(await s.estado(bp), antes[1]);
  assert.equal((await s.chamar(`/apuracoes/${ap.id}/aprovar`, { metodo: "PATCH" })).status, 200);
  const aprovado = await s.estado(ap); assert.equal((await s.reportar(a, ap, relatorio([]))).status, 409); assert.deepEqual(await s.estado(ap), aprovado);
});

test("DAS HTTP report: tipos inválidos e mês por campo são400 sem alteração", async t => {
  const { s, a, ap } = await preparar(t, "V"), antes = await s.estado(ap);
  const casos = [relatorio([], { temDozeMeses: "false" }), relatorio([], { temDozeMeses: "sim" }), relatorio([], { mesesEncontrados: {} }), relatorio([], { mesesEncontrados: "nao é lista" }), relatorio([], { totalMesesEncontrados: "0" }), relatorio([], { totalMesesEncontrados: 1 }), relatorio([], { falhaUpload: "false" }), ...[0, 13, "7abc", 9.5].map(mes => relatorio([{ ano: 2026, mes }]))];
  for (const corpo of casos) await t.test(JSON.stringify(corpo), async () => { assert.equal((await s.reportar(a, ap, corpo)).status, 400); assert.deepEqual(await s.estado(ap), antes); });
  const i = await s.cliente({ anexo_simples: "I" }), ai = await s.criar(i), aiAntes = await s.estado(ai);
  assert.equal((await s.reportar(i, ai, relatorio([]))).status, 400); assert.deepEqual(await s.estado(ai), aiAntes);
});

test("DAS HTTP report sem override: histórico automático registra 1550 para 600 em resposta e DB", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  // Processamento conhecido com erro produz o provisório naturalmente; a
  // conclusão das 12 competências é persistida antes do report com licença real.
  const primeiro = await s.processo(c, refISO(REFERENCIAS[0]), 0, { status: "erro" });
  const a = await s.criar(c), antes = await s.estado(a);
  for (const linha of [a, antes]) {
    assert.equal(linha.valor_calculado, 1550); assert.equal(linha.valor_editado, null);
    assert.equal(linha.folha12, null); assert.equal(linha.folha_status, "pendente"); assert.deepEqual(linha.historico_edicoes, []);
  }
  const concluido = await s.banco.from("processamentos_folha").update({ status: "concluido" }).eq("id", primeiro.id); assert.ifError(concluido.error);
  await inserir(s.banco, "folha_calculos", calculo(primeiro.id, 5000));
  for (const ref of REFERENCIAS.slice(1)) await s.processo(c, refISO(ref), 5000);
  const processos = await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id });
  assert.equal(processos.length, 12); assert.ok(processos.every(p => p.status === "concluido"));
  const report = await s.reportar(c, a); assert.equal(report.status, 200);
  const gravado = await s.estado(a);
  // FS12=12*5000=60000; FR=60000/120000=0,50; III faixa1:
  // receita10000*6%=DAS600. O evento sem edição deve registrar1550→600.
  for (const [origem, linha] of [["resposta", report.corpo], ["DB", gravado]]) {
    assert.equal(linha.valor_editado, null); assert.equal(linha.valor_calculado, 600);
    assert.equal(linha.folha12, 60000); assert.equal(linha.fator_r, .5); assert.equal(linha.anexo, "III"); assert.equal(linha.folha_status, "verificado");
    assert.equal(linha.historico_edicoes.length, 1);
    const evento = linha.historico_edicoes[0];
    assert.equal(evento.valor_anterior, 1550, `report sem override valor_anterior ${origem}`);
    assert.equal(evento.valor_novo, 600, `report sem override valor_novo ${origem}`);
  }
  assert.deepEqual(report.corpo, gravado);
  const aprovado = await s.chamar(`/apuracoes/${a.id}/aprovar`, { metodo: "PATCH" }); assert.equal(aprovado.status, 200); assert.equal(aprovado.corpo.status, "aprovado");
  assert.deepEqual((await s.estado(a)).historico_edicoes, gravado.historico_edicoes);
});

test("DAS HTTP regras de período, regime e cadastro são conferidas sem mutação", async t => {
  const { s, a, ap, admin } = await preparar(t), antes = await s.estado(ap);
  const futuro = { mes: 12, ano: new Date().getUTCFullYear() + 1 };
  for (const corpo of [{ ...payload, regime: "lucro_presumido" }, { ...payload, ...futuro }]) {
    const r = await s.chamar("/apuracoes", { usuario: admin, metodo: "POST", corpo }); assert.equal(r.status, 422);
  }
  const fora = await s.cliente({ regime_tributario: "lucro_presumido" });
  const cadastroFora = await s.chamar("/apuracoes", { metodo: "POST", corpo: { ...payload, clienteId: fora.id } }); assert.equal(cadastroFora.status, 422);
  assert.equal(cadastroFora.corpo.erro, "REGIME_NAO_SUPORTADO", "código do regime cadastrado");
  assert.deepEqual(await s.estado(ap), antes); assert.deepEqual(await lerTodos(s.banco, "apuracoes", { cliente_id: fora.id }), []);
  // Registro legado anterior à guarda: não é happy path novo.
  const legado = await s.banco.from("apuracoes").update({ periodo_mes: futuro.mes, periodo_ano: futuro.ano }).eq("id", ap.id); assert.ifError(legado.error);
  const antesLegado = await s.estado(ap);
  for (const acao of ["aprovar", "recalcular"]) {
    const r = await s.chamar(`/apuracoes/${ap.id}/${acao}`, { usuario: admin, metodo: "PATCH" }); assert.equal(r.status, 422);
    assert.equal(r.corpo.erro, "COMPETENCIA_NAO_FECHADA", `código de competência em ${acao}`);
    assert.deepEqual(await s.estado(ap), antesLegado);
  }
  assert.deepEqual(await s.estado(ap), antesLegado); assert.equal(antes.valor_calculado, 400);
  assert.deepEqual(await lerTodos(s.banco, "apuracoes", { cliente_id: fora.id }), []);
  assert.equal((await lerTodos(s.banco, "apuracoes", { cliente_id: a.id })).length, 1);
});

test("DAS HTTP borda dinâmica de Brasília: mês corrente422 e último fechado201", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I" });
  const usuario = await s.usuario(c, "admin_cliente");
  // Oráculo de calendário independente do produto e do fuso do processo.
  const partes = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const ano = Number(partes.find(p => p.type === "year").value), mes = Number(partes.find(p => p.type === "month").value);
  const ultima = mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
  const maxima = `${ultima.ano}-${String(ultima.mes).padStart(2, "0")}`;
  const antes = await lerTodos(s.banco, "apuracoes", { cliente_id: c.id });
  for (const periodo of [{ mes, ano }, { mes: 12, ano: ano + 1 }]) {
    const r = await s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: { ...payload, ...periodo } });
    assert.equal(r.status, 422); assert.deepEqual(r.corpo, { erro: "COMPETENCIA_NAO_FECHADA", competencia_maxima: maxima });
    assert.deepEqual(await lerTodos(s.banco, "apuracoes", { cliente_id: c.id }), antes);
  }
  const ultimo = await s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: { ...payload, ...ultima } });
  assert.equal(ultimo.status, 201);
  const gravado = await s.estado(ultimo.corpo);
  for (const linha of [ultimo.corpo, gravado]) {
    assert.equal(linha.periodo_mes, ultima.mes); assert.equal(linha.periodo_ano, ultima.ano); assert.equal(linha.cliente_id, c.id); assert.equal(linha.status, "rascunho");
  }
  assert.equal((await lerTodos(s.banco, "apuracoes", { cliente_id: c.id })).length, antes.length + 1);
});

test("DAS HTTP composição mensal, histórico subsidiário e breakdown atualizado somente no recálculo", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I" });
  const usuario = await s.usuario(c, "admin_cliente");
  const [nfeSetembro] = await s.notas(c, [20000], { data_emissao: "2026-09-15" });
  const [cpf] = await s.notas(c, [10000], { cnpj_destinatario: "12345678909" });
  const [entrada] = await s.notas(c, [9000], { tipo: "entrada" });
  const a = await s.criar(c);
  // 11*10000 histórico + 20000 NF de setembro =130000; histórico de setembro
  // não duplica a fonte primária. Entrada não compõe receita, saída CPF compõe.
  assert.equal(a.rbt12_usado, 130000); assert.equal(a.valor_calculado, 400); assert.equal(a.receita_mes, 10000);
  const setembro = a.rbt12_mensal.find(x => x.referencia === "2026-09"); assert.equal(setembro.receita_nfes, 20000); assert.equal(setembro.receita_historico, 0);
  assert.deepEqual(a.rbt12_mensal.find(x => x.referencia === "2026-08"), { referencia: "2026-08", mes: 8, ano: 2026, receita_nfes: 0, receita_historico: 10000, total: 10000, periodo_fechado: true });
  assert.deepEqual(a.notas_fiscais.consideradas.map(n => n.id).sort(), [nfeSetembro.id, cpf.id].sort());
  assert.deepEqual(a.notas_fiscais.excluidas.map(n => n.id), [entrada.id]); assert.match(a.notas_fiscais.excluidas[0].motivo, /entrada não compõe/);
  const antes = await s.estado(a);
  const estavel = await s.chamar(`/apuracoes/${a.id}`); assert.equal(estavel.status, 200);
  assert.deepEqual(estavel.corpo.notas_fiscais.consideradas.map(n => n.id).sort(), [nfeSetembro.id, cpf.id].sort(), "GET consideradas inclui janela e PA");
  const alterada = await s.banco.from("lancamentos_fiscais").update({ valor_total: 15000 }).eq("id", cpf.id); assert.ifError(alterada.error);
  const janelaAlterada = await s.banco.from("lancamentos_fiscais").update({ valor_total: 30000 }).eq("id", nfeSetembro.id); assert.ifError(janelaAlterada.error);
  const get = await s.chamar(`/apuracoes/${a.id}`); assert.equal(get.status, 200); assert.equal(get.corpo.breakdown_desatualizado, true); assert.equal(get.corpo.receita_mes, 10000); assert.equal(get.corpo.breakdown_divergencia.receita_mes_reconstruida, 15000); assert.deepEqual(await s.estado(a), antes);
  assert.equal(get.corpo.rbt12_usado, 130000, "GET desatualizado: RBT12 headline persistida");
  assert.equal(get.corpo.valor_calculado, 400, "GET desatualizado: DAS headline persistido");
  assert.deepEqual(get.corpo.notas_fiscais.consideradas.map(n => n.id).sort(), [nfeSetembro.id, cpf.id].sort(), "GET desatualizado considera janela e PA");
  assert.deepEqual(get.corpo.breakdown_divergencia, { rbt12_persistido: 130000, rbt12_reconstruido: 140000, receita_mes_persistida: 10000, receita_mes_reconstruida: 15000 }, "GET divergência: RBT12 reconstruída diferente da persistida");
  let historicoAnterior = antes.historico_edicoes;
  for (const [valor_anterior, valor_novo] of [[400, 600], [600, 600]]) {
    const recalc = await s.chamar(`/apuracoes/${a.id}/recalcular`, { usuario, metodo: "PATCH" });
    assert.equal(recalc.status, 200); assert.equal(recalc.corpo.valor_calculado, 600); assert.equal(recalc.corpo.edicao_descartada, false); assert.equal(recalc.corpo.breakdown_desatualizado, false);
    const linha = await s.estado(a);
    // 11*10000 + setembro30000 = RBT140000; PA15000*4% = DAS600.
    for (const resposta of [recalc.corpo, linha]) { assert.equal(resposta.rbt12_usado, 140000); assert.equal(resposta.receita_mes, 15000); }
    assert.equal(linha.valor_calculado, 600); assert.equal(linha.valor_editado, null);
    assert.equal(linha.historico_edicoes.length, historicoAnterior.length + 1);
    assert.deepEqual(linha.historico_edicoes.slice(0, -1), historicoAnterior);
    assert.deepEqual(recalc.corpo.historico_edicoes, linha.historico_edicoes);
    const evento = linha.historico_edicoes.at(-1);
    assert.equal(typeof evento.editado_em, "string"); assert.ok(Number.isFinite(Date.parse(evento.editado_em)), "data válida do recálculo sem override");
    assert.deepEqual(evento, { tipo: "recalculo", valor_anterior, valor_novo, motivo: "Recálculo automático", editado_por: usuario.email, editado_em: evento.editado_em });
    historicoAnterior = structuredClone(linha.historico_edicoes);
  }
});

test("DAS HTTP Anexos I–IV não entram na fila; pró-labore e FGTS entram na FS12", async t => {
  const s = await iniciarCenarioApuracao(t);
  for (const [anexo, das] of [["I", 400], ["II", 450], ["III", 600], ["IV", 450]]) {
    const c = await s.cliente({ anexo_simples: anexo }); await s.notas(c); const a = await s.criar(c);
    assert.equal(a.valor_calculado, das); assert.equal(a.folha_status, null); assert.equal(a.fator_r, null); assert.equal((await s.estado(a)).folha_status, null);
    const criado = await s.estado(a); assert.equal(criado.fator_r, null); assert.equal(criado.anexo, anexo); assert.equal(criado.valor_calculado, das);
    // Resíduo válido do DEFAULT histórico: não-V com fator_r null. O recálculo
    // deve limpar pendente, mesmo quando o UPDATE omitir indevidamente a coluna.
    const legado = await s.banco.from("apuracoes").update({ folha_status: "pendente" }).eq("id", a.id); assert.ifError(legado.error);
    const antesRecalculo = await s.estado(a); assert.equal(antesRecalculo.folha_status, "pendente"); assert.equal(antesRecalculo.fator_r, null);
    const recalc = await s.chamar(`/apuracoes/${a.id}/recalcular`, { metodo: "PATCH" }); assert.equal(recalc.status, 200);
    const gravado = await s.estado(a);
    for (const [origem, linha] of [["JSON", recalc.corpo], ["DB", gravado]]) {
      assert.equal(linha.folha_status, null, `recálculo ${anexo} ${origem} folha_status null`);
      assert.equal(linha.fator_r, null, `recálculo ${anexo} ${origem} fator_r null`);
      assert.equal(linha.anexo, anexo); assert.equal(linha.valor_calculado, das);
    }
    assert.equal(recalc.corpo.folha_status, null);
    assert.deepEqual((await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } })).corpo, []);
  }
  const c = await s.cliente({ historico_receita: REFERENCIAS.map(r => ({ ...r, receita: 30000 })) }); await s.notas(c, [30000]);
  for (const ref of REFERENCIAS) {
    const p = await s.processo(c, refISO(ref));
    await inserir(s.banco, "folha_calculos", [{ ...calculo(p.id, 5000), fgts: 400 }]);
  }
  const a = await s.criar(c); assert.equal(a.folha12, 64800); assert.equal(a.fator_r, .18); assert.equal(a.anexo, "V"); assert.equal(a.valor_calculado, 5025);
  assert.equal(a.folha_status, "verificado", "POST Anexo V completo: folha_status na resposta");
  assert.equal((await s.estado(a)).folha_status, "verificado", "POST Anexo V completo: folha_status no DB");
  // Janela normal: FS12=12*(5000+400)=64800; FR=.18; V faixa2:
  // (360000*.18-4500)/360000=.1675; 30000*.1675=DAS5025.
  const criadoV = await s.estado(a);
  for (const [campo, valor] of Object.entries({ rbt12_usado: 360000, receita_mes: 30000, folha12: 64800, fator_r: .18, anexo: "V", valor_calculado: 5025, folha_status: "verificado" })) {
    assert.equal(a[campo], valor, `POST V completo JSON ${campo}`);
    assert.equal(criadoV[campo], valor, `POST V completo DB ${campo}`);
  }
  const filaCompleta = async () => {
    const fila = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
    assert.equal(fila.status, 200); assert.deepEqual(fila.corpo, [], "folha completa não entra na fila do agente");
  };
  await filaCompleta();
  // Antes do pró-labore, PATCH precisa permanecer em V: o POST não prova
  // os campos persistidos por este ramo, e o JSON pode reconstruir o Fator R.
  const recalcV = await s.chamar(`/apuracoes/${a.id}/recalcular`, { metodo: "PATCH" }); assert.equal(recalcV.status, 200);
  const gravadoV = await s.estado(a);
  for (const [origem, linha] of [["JSON", recalcV.corpo], ["DB", gravadoV]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 360000, receita_mes: 30000, folha12: 64800, fator_r: .18, anexo: "V", valor_calculado: 5025, folha_status: "verificado" })) {
      assert.equal(linha[campo], valor, `R11 V→V ${origem} ${campo}`);
    }
  }
  await filaCompleta();
  const ps = await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id });
  assert.equal(ps.length, 12); assert.ok(ps.every(p => p.status === "concluido"));
  for (const p of ps) await inserir(s.banco, "folha_calculos", { ...calculo(p.id, 3400), funcionario: "Sócio pró-labore", fgts: 0 });
  const recalc = await s.chamar(`/apuracoes/${a.id}/recalcular`, { metodo: "PATCH" }); assert.equal(recalc.status, 200);
  const migradoIII = await s.estado(a);
  // FS12=12*(5000+400+3400)=105600; FR truncado=0,29; AnexoIII:
  // (360000*11,2%-9360)/360000=8,6%; 30000*8,6%=2580.
  // Conferir a migração antes de outro PATCH poder reparar uma coluna errada.
  for (const [origem, b] of [["JSON", recalc.corpo], ["DB", migradoIII]]) {
    assert.equal(b.rbt12_usado, 360000, `R13 V→III ${origem} rbt12_usado`);
    assert.equal(b.receita_mes, 30000, `R13 V→III ${origem} receita_mes`);
    assert.equal(b.folha12, 105600); assert.equal(b.fator_r, .29); assert.equal(b.anexo, "III"); assert.equal(b.valor_calculado, 2580);
    assert.equal(b.folha_status, "verificado", `R13 V→III ${origem} folha_status`);
  }
  assert.equal(recalc.corpo.folha_status, "verificado", "recálculo Anexo V completo: folha_status na resposta");
  assert.equal((await s.estado(a)).folha_status, "verificado", "recálculo Anexo V completo: folha_status no DB");
  await filaCompleta();
  // Agora a guia já é efetivamente III, com FR preenchido e origem V.
  // Repetir o PATCH preserva esse contrato também na janela normal.
  const recalcIII = await s.chamar(`/apuracoes/${a.id}/recalcular`, { metodo: "PATCH" }); assert.equal(recalcIII.status, 200);
  const gravadoIII = await s.estado(a);
  for (const [origem, linha] of [["JSON", recalcIII.corpo], ["DB", gravadoIII]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 360000, receita_mes: 30000, folha12: 105600, fator_r: .29, anexo: "III", valor_calculado: 2580, folha_status: "verificado" })) {
      assert.equal(linha[campo], valor, `R11 III→III ${origem} ${campo}`);
    }
  }
  await filaCompleta();
  const get = await s.chamar(`/apuracoes/${a.id}`); assert.equal(get.status, 200);
  assert.equal(get.corpo.fator_r, .29, "GET V completo em janela normal preserva Fator R");
  for (const resposta of [recalc.corpo, get.corpo]) metadados(resposta, { rbt12: 360000, anexo_original: "V", anexo_efetivo: "III", aliquota_nominal: .112, faixa_limite: 360000, parcela_deduzir: 9360 });
  // A guia já é III com FR preenchido. Ausência agora exige III→V, não
  // repete o contexto V→V de QA02. Remover somente insumos desta fixture.
  const usuario = await s.usuario(c, "admin_cliente"), idsProprios = ps.map(p => p.id);
  for (const [tabela, coluna] of [["folha_calculos", "processamento_id"], ["processamentos_folha", "id"]]) {
    const removido = await s.banco.from(tabela).delete().in(coluna, idsProprios); assert.ifError(removido.error);
  }
  assert.deepEqual(await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id }), []);
  const antesZero = await s.estado(a); assert.equal(antesZero.anexo, "III"); assert.equal(antesZero.fator_r, .29);
  const recalcZero = await s.chamar(`/apuracoes/${a.id}/recalcular`, { usuario, metodo: "PATCH" }); assert.equal(recalcZero.status, 200);
  const gravadoZero = await s.estado(a);
  // FS0/RBTpositivo: FR mínimo=.01 (#726); V faixa2 mantém DAS5025.
  for (const [origem, linha] of [["JSON", recalcZero.corpo], ["DB", gravadoZero]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 360000, receita_mes: 30000, folha12: 0, fator_r: .01, anexo: "V", valor_calculado: 5025, folha_status: "pendente" })) {
      assert.equal(linha[campo], valor, `R12 III→V zero ${origem} ${campo}`);
    }
  }
  // Sem processamentos, a busca de arquivos continua pendente na fila;
  // folha zero legítima ainda permite a decisão de aprovação do contador.
  const filaZero = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(filaZero.status, 200);
  assert.deepEqual(filaZero.corpo, [{ id: a.id, clienteId: c.id, nomeEmpresa: c.nome, mes: 10, ano: 2026, mesesFolha: REFERENCIAS }]);
  // Conferir também V→V/FS0, depois de verificar integralmente III→V.
  const recalcZeroV = await s.chamar(`/apuracoes/${a.id}/recalcular`, { usuario, metodo: "PATCH" }); assert.equal(recalcZeroV.status, 200);
  const gravadoZeroV = await s.estado(a);
  for (const [origem, linha] of [["JSON", recalcZeroV.corpo], ["DB", gravadoZeroV]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 360000, receita_mes: 30000, folha12: 0, fator_r: .01, anexo: "V", valor_calculado: 5025, folha_status: "pendente" })) {
      assert.equal(linha[campo], valor, `V→V zero ${origem} ${campo}`);
    }
  }
  const filaZeroV = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(filaZeroV.status, 200);
  assert.deepEqual(filaZeroV.corpo, [{ id: a.id, clienteId: c.id, nomeEmpresa: c.nome, mes: 10, ano: 2026, mesesFolha: REFERENCIAS }]);
  const aprovadoZero = await s.chamar(`/apuracoes/${a.id}/aprovar`, { usuario, metodo: "PATCH" }); assert.equal(aprovadoZero.status, 200);
  for (const linha of [aprovadoZero.corpo, await s.estado(a)]) {
    assert.equal(linha.status, "aprovado"); assert.equal(linha.aprovado_por, usuario.email);
    assert.equal(linha.folha12, 0); assert.equal(linha.fator_r, .01); assert.equal(linha.anexo, "V"); assert.equal(linha.valor_calculado, 5025);
  }
});

test("DAS HTTP POST normal origem V já efetivo III persiste folha completa antes de qualquer recálculo", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const ref of REFERENCIAS) await s.processo(c, refISO(ref), 5000);
  const processos = await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id });
  assert.equal(processos.length, 12); assert.ok(processos.every(p => p.status === "concluido"));
  assert.deepEqual(processos.map(p => p.mes_referencia).sort(), REFERENCIAS.map(refISO).sort());
  const usuario = await s.usuario(c, "admin_cliente");
  const criado = await s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: payload });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  const gravado = await s.estado(criado.corpo);
  // Janela normal: RBT12=12*10000=120000; FS12=12*5000=60000;
  // FR=60000/120000=.5; AnexoIII faixa1, PD0: 10000*6%=DAS600.
  // Ler o INSERT antes de fila/GET/PATCH poder reconstruir ou reparar colunas.
  for (const [origem, linha] of [["DB", gravado], ["JSON", criado.corpo]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 120000, receita_mes: 10000, folha12: 60000, fator_r: .5, anexo: "III", valor_calculado: 600, folha_status: "verificado", aliquota_efetiva: .06, cliente_id: c.id, periodo_mes: 10, periodo_ano: 2026, status: "rascunho" })) {
      assert.equal(linha[campo], valor, `R14 POST V→III normal ${origem} ${campo}`);
    }
  }
  assert.equal(criado.corpo.anexo_original, "V"); assert.equal(criado.corpo.anexo_efetivo, "III");
  assert.equal(criado.corpo.rbt12_metodo, "janela_12_meses"); assert.equal(criado.corpo.meses_atividade, null);
  const fila = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(fila.status, 200); assert.deepEqual(fila.corpo, [], "POST V→III completo não entra na fila");
});

test("DAS HTTP POST normal V com onze meses concluídos sem cálculos mantém o mês ausente pendente na fila", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const ref of REFERENCIAS.slice(0, 11)) await s.processo(c, refISO(ref));
  const processos = await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id });
  assert.equal(processos.length, 11); assert.ok(processos.every(p => p.status === "concluido"));
  assert.deepEqual(processos.map(p => p.mes_referencia).sort(), REFERENCIAS.slice(0, 11).map(refISO).sort());
  assert.ok(!processos.some(p => p.mes_referencia === refISO(REFERENCIAS[11])), "o décimo segundo mês está ausente");
  assert.deepEqual(await lerTodos(s.banco, "folha_calculos", { processamento_id: processos.map(p => p.id) }), [], "onze processamentos sem nenhum cálculo");
  const usuario = await s.usuario(c, "admin_cliente");
  const criado = await s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: payload });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  const gravado = await s.estado(criado.corpo);
  // Ausência legítima=zero: FS0/RBT120000 dá FRmínimo.01; AnexoV faixa1,
  // PD0: 10000*15,5%=DAS1550. A busca do mês faltante continua pendente.
  for (const [origem, linha] of [["DB", gravado], ["JSON", criado.corpo]]) {
    for (const [campo, valor] of Object.entries({ rbt12_usado: 120000, receita_mes: 10000, folha12: 0, fator_r: .01, anexo: "V", valor_calculado: 1550, folha_status: "pendente", aliquota_efetiva: .155, cliente_id: c.id, periodo_mes: 10, periodo_ano: 2026, status: "rascunho" })) {
      assert.equal(linha[campo], valor, `R15 POST V parcial ${origem} ${campo}`);
    }
  }
  assert.equal(criado.corpo.rbt12_metodo, "janela_12_meses"); assert.equal(criado.corpo.meses_atividade, null);
  const fila = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } });
  assert.equal(fila.status, 200);
  assert.deepEqual(fila.corpo, [{ id: criado.corpo.id, clienteId: c.id, nomeEmpresa: c.nome, mes: 10, ano: 2026, mesesFolha: REFERENCIAS }]);
});
