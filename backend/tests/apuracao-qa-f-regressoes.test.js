// Contratos QA-F, passagem 1 de 10/11/2026 e revisões R1–R5/G1.
// Oráculo: LC123 art.18/anexos; Res.CGSN140 art.26 (redação2026), Manual
// PGDAS-D8.2.1 e decisão #726 (ausência=zero). As contas estão nos nomes/asserções;
// nenhuma tabela/fórmula do produto fornece os valores esperados dos testes HTTP.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { iniciarCenarioApuracao, inserir, lerTodos, calculo, REFERENCIAS, refISO, relatorio } from "./helpers/apuracao-qa-f.js";
import { comStorageDescartavel } from "./helpers/servicos-externos.js";
import { calcularSimplesNacional } from "../src/utils/simples-nacional.util.js";
import { dispararPipelineAutomatico } from "../src/controllers/folha.controller.js";
import { contextoDb, servicoDb, criarDbDoUsuario, executarComDbDoUsuario } from "../src/config/db-usuario.js";
import dbContextual from "../src/config/database.js";

const caminho = a => `/apuracoes/${a.id}`;
const atualizar = (s, a, acao) => s.chamar(`${caminho(a)}/${acao}`, { metodo: "PATCH", corpo: {} });
function conferirCalculo(a, { fr, anexo, das, fs, rb, taxa }) {
  if (fr !== undefined) assert.equal(a.fator_r, fr, "Fator R fiscal");
  assert.equal(a.anexo, anexo, "anexo persistido");
  assert.equal(a.valor_calculado, das, "DAS em centavos");
  if (fs !== undefined) assert.equal(a.folha12, fs, "FS12 anualizada");
  if (rb !== undefined) assert.equal(a.rbt12_usado, rb, "RBT12 usada");
  if (taxa !== undefined) assert.equal(a.aliquota_efetiva, taxa, "alíquota completa");
  if (a.anexo_efetivo !== undefined) assert.equal(a.anexo_efetivo, anexo);
}

test("QA-F QA01 provisório legado é legível sem modificar números ou banco", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c);
  const r = await s.banco.from("apuracoes").update({ anexo: "V", fator_r: 0, folha12: null, valor_calculado: 1550, folha_status: "pendente" }).eq("id", a.id); assert.ifError(r.error);
  const antes = await s.estado(a), get = await s.chamar(caminho(a));
  assert.equal(get.status, 200, "QA01 GET de provisório válido");
  conferirCalculo(get.corpo, { fr: 0, fs: null, anexo: "V", das: 1550 });
  assert.equal(get.corpo.anexo_original, "V"); assert.deepEqual(await s.estado(a), antes);
  function metadadosProvisorio(resposta) {
    for (const [campo, valor] of Object.entries({ rbt12: 120000, anexo_original: "V", anexo_efetivo: "V", aliquota_nominal: .155, faixa_limite: 180000, parcela_deduzir: 0, rbt12_metodo: "janela_12_meses", meses_atividade: null })) assert.equal(resposta[campo], valor, `provisório ${campo}`);
  }
  metadadosProvisorio(get.corpo);
  // DAS-1/Gabriel #735: o fluxo novo só é provisório se há processamento
  // conhecido ainda não concluído. Ausência legítima já significa folha zero.
  const novo = await s.cliente(); await s.notas(novo);
  await s.processo(novo, "2026-09-01", 0, { status: "erro" });
  const usuario = await s.usuario(novo, "admin_cliente"), criado = await s.criar(novo);
  const campos = ["valor_calculado", "aliquota_efetiva", "rbt12_usado", "receita_mes", "anexo", "fator_r", "folha12", "folha_status", "status"];
  const numeros = x => Object.fromEntries(campos.map(k => [k, x[k]]));
  const esperado = { valor_calculado: 1550, aliquota_efetiva: .155, rbt12_usado: 120000, receita_mes: 10000, anexo: "V", fator_r: 0, folha12: null, folha_status: "pendente", status: "rascunho" };
  assert.deepEqual(numeros(get.corpo), esperado); assert.deepEqual(numeros(antes), esperado);
  assert.deepEqual(numeros(criado), esperado);
  metadadosProvisorio(criado);
  const aberto = await s.chamar(caminho(criado), { usuario }); assert.equal(aberto.status, 200); assert.deepEqual(numeros(aberto.corpo), esperado); assert.deepEqual(numeros(await s.estado(criado)), esperado);
  metadadosProvisorio(aberto.corpo); assert.equal(aberto.corpo.rbt12, criado.rbt12);
  const antesNovo = await s.estado(criado), estrangeiro = await s.usuario(c, "admin_cliente");
  for (const metodo of ["GET", "DELETE"]) {
    const negado = await s.chamar(caminho(criado), { usuario: estrangeiro, metodo });
    const ausente = await s.chamar(caminho({ id: randomUUID() }), { usuario: estrangeiro, metodo });
    assert.equal(negado.status, 404); assert.deepEqual(negado.corpo, ausente.corpo); assert.deepEqual(await s.estado(criado), antesNovo); assert.deepEqual(await s.estado(a), antes);
  }
  const editado = await s.chamar(caminho(criado), { usuario, metodo: "PATCH", corpo: { valor_editado: 1500, motivo: "Conferência do provisório" } }); assert.equal(editado.status, 200);
  const gravado = await s.estado(criado); assert.equal(gravado.valor_editado, 1500); assert.equal(gravado.valor_calculado, 1550); assert.equal(gravado.historico_edicoes.length, 1); assert.equal(gravado.historico_edicoes[0].motivo, "Conferência do provisório"); assert.equal(gravado.historico_edicoes[0].editado_por, usuario.email);
  const reaberto = await s.chamar(caminho(criado), { usuario }); assert.equal(reaberto.status, 200); assert.equal(reaberto.corpo.valor_editado, 1500);
  metadadosProvisorio(reaberto.corpo);
  const duplicado = () => s.chamar("/apuracoes", { usuario, metodo: "POST", corpo: { mes: 10, ano: 2026, regime: "simples_nacional" } });
  assert.equal((await duplicado()).status, 409); assert.equal((await s.chamar(caminho(criado), { usuario, metodo: "DELETE" })).status, 204);
  assert.deepEqual(await lerTodos(s.banco, "apuracoes", { id: criado.id }), []); assert.equal((await s.chamar(caminho(criado), { usuario })).status, 404); assert.equal((await duplicado()).status, 201);
  // O legado segue provisório mesmo se um report antigo marcou verificado sem FS12.
  const pendente = await atualizar(s, a, "aprovar"); assert.equal(pendente.status, 409); assert.equal(pendente.corpo.erro, "FOLHA_PENDENTE"); assert.deepEqual(await s.estado(a), antes);
  const marcado = await s.banco.from("apuracoes").update({ folha_status: "verificado" }).eq("id", a.id); assert.ifError(marcado.error);
  const antesVerificado = await s.estado(a), verificado = await atualizar(s, a, "aprovar");
  assert.equal(verificado.status, 409); assert.equal(verificado.corpo.erro, "FOLHA_PENDENTE"); assert.deepEqual(await s.estado(a), antesVerificado);
});

test("QA-F QA02 ausência zero aprovável, startup dois meses e primeiro PA", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  const a = await s.criar(c), recalc = await atualizar(s, a, "recalcular");
  assert.equal(recalc.status, 200, "QA02 ausência legítima não exige12processamentos");
  conferirCalculo(recalc.corpo, { fr: .01, fs: 0, anexo: "V", das: 1550 });
  assert.equal((await atualizar(s, a, "aprovar")).status, 200, "folha zero é aprovável");
  const novo = await s.cliente({ data_inicio_atividade: "2026-08-01", historico_receita: [{ ano: 2026, mes: 8, receita: 50000 }, { ano: 2026, mes: 9, receita: 50000 }] });
  await s.notas(novo, [25000]); await s.processo(novo, "2026-08-01", 15000); await s.processo(novo, "2026-09-01", 15000);
  const b = await s.criar(novo); conferirCalculo(b, { fr: .30, fs: 180000, rb: 600000, anexo: "III", das: 2640, taxa: .1056 });
  const br = await atualizar(s, b, "recalcular"); assert.equal(br.status, 200); conferirCalculo(br.corpo, { fr: .30, fs: 180000, anexo: "III", das: 2640 });
  assert.equal((await atualizar(s, b, "aprovar")).status, 200, "DAS-2 empresa nova é aprovável"); assert.equal((await s.estado(b)).status, "aprovado");
  const primeiro = await s.cliente({ data_inicio_atividade: "2026-10-01", historico_receita: [] });
  await s.notas(primeiro, [25000]); await s.processo(primeiro, "2026-10-01", 7500);
  const d = await s.criar(primeiro); conferirCalculo(d, { fr: .30, fs: 90000, rb: 300000, anexo: "III", das: 2020, taxa: .0808 });
  const dr = await atualizar(s, d, "recalcular"); assert.equal(dr.status, 200); conferirCalculo(dr.corpo, { fr: .30, fs: 90000, anexo: "III", das: 2020 });
  assert.equal((await atualizar(s, d, "aprovar")).status, 200, "primeiro PA com folha calculada é aprovável"); assert.equal((await s.estado(d)).status, "aprovado");
});

test("QA-F QA03 FSzero/RBpositiva gera FR0,01 no motor, API e persistência", async t => {
  for (const [rb, fs, fr] of [[120000, 0, .01], [0, 0, .01], [0, 1, .28]]) assert.equal(calcularSimplesNacional({ rbt12: rb, receita_mes: 10000, anexo: "V", folha12: fs }).fator_r, fr, "QA03 ramos do art26");
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r));
  const a = await s.criar(c); conferirCalculo(a, { fr: .01, fs: 0, anexo: "V", das: 1550 });
  conferirCalculo(await s.estado(a), { fr: .01, fs: 0, anexo: "V", das: 1550 });
});

test("QA-F QA04 paginação de1001notas,1001salários e1012processamentos", { timeout: 60_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I" });
  await s.notas(c, Array(1001).fill(10)); const a = await s.criar(c);
  assert.equal(a.receita_mes, 10010, "QA04 nenhuma NF-e omitida"); assert.equal(a.valor_calculado, 400.40);
  const get = await s.chamar(caminho(a)); assert.equal(get.status, 200); assert.equal(get.corpo.notas_fiscais.consideradas.length, 1001);
  const recalc = await atualizar(s, a, "recalcular"); assert.equal(recalc.status, 200); assert.equal(recalc.corpo.receita_mes, 10010);
  const salarios = await s.cliente({ historico_receita: REFERENCIAS.map(r => ({ ...r, receita: 30000 })) }); await s.notas(salarios, [25000]);
  const p = await s.processo(salarios, "2026-09-01");
  await inserir(s.banco, "folha_calculos", Array.from({ length: 1001 }, (_, i) => calculo(p.id, i === 1000 ? 1000 : 100)));
  const b = await s.criar(salarios); conferirCalculo(b, { fs: 101000, fr: .28, anexo: "III", das: 2150 });
  const processos = await s.cliente(); await s.notas(processos);
  const duplicados = Array.from({ length: 1001 }, (_, i) => ({ id: randomUUID(), cliente_id: processos.id, mes_referencia: "2026-09-01", status: "concluido", arquivo_origem_path: "fixture-qa-f-sem-arquivo", criado_em: new Date(Date.UTC(2026, 9, 2, 0, 0, i)).toISOString() }));
  await inserir(s.banco, "processamentos_folha", duplicados); await inserir(s.banco, "folha_calculos", calculo(duplicados.at(-1).id, 100));
  for (let i = 0; i < 11; i++) await s.processo(processos, refISO(REFERENCIAS[i]), i === 0 ? 40000 : 0, { criado_em: "2026-10-01T00:00:00Z" });
  assert.equal((await lerTodos(s.banco, "processamentos_folha", { cliente_id: processos.id })).length, 1012);
  const d = await s.criar(processos); conferirCalculo(d, { fs: 40100, fr: .33, anexo: "III", das: 600 });
});

test("QA-F QA05 cancelada auditada uma vez e excluída das somas nas3rotas", async t => {
  // DAS-4/Gabriel #736, QA-F item10: 09/2026, 10000*4%=400;
  // se a cancelada do mês entrasse, seriam 15000*4%=600.
  const refs = Array.from({ length: 12 }, (_, i) => { const n = 2025 * 12 + 8 + i; return { ano: Math.floor(n / 12), mes: n % 12 + 1, receita: 10000 }; });
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I", historico_receita: refs });
  const [ativa] = await s.notas(c, [10000], { data_emissao: "2026-09-10" });
  const [cancelada] = await s.notas(c, [5000], { status: "cancelada", data_emissao: "2026-09-06", cancelado_em: "2026-09-09T02:30:00Z", motivo_cancelamento: "Erro no valor da nota", protocolo_cancelamento: "135260000000001" });
  const [janela] = await s.notas(c, [50000], { status: "cancelada", data_emissao: "2026-03-15", cancelado_em: "2026-03-20T15:00:00Z" });
  const [entrada] = await s.notas(c, [9000], { tipo: "entrada", data_emissao: "2026-09-12" });
  const a = await s.criar(c, 9), get = await s.chamar(caminho(a)), recalc = await atualizar(s, a, "recalcular");
  assert.equal(get.status, 200); assert.equal(recalc.status, 200);
  for (const r of [a, get.corpo, recalc.corpo]) {
    assert.equal(r.valor_calculado, 400); assert.equal(r.receita_mes, 10000); assert.equal(r.rbt12_usado, 120000); assert.equal(r.aliquota_efetiva, .04);
    assert.deepEqual(r.notas_fiscais.consideradas.map(n => n.id), [ativa.id]);
    assert.deepEqual(r.notas_fiscais.consideradas.map(n => [n.chave_nfe, n.tipo]), [[ativa.chave_nfe, "saida"]]);
    const excluidas = r.notas_fiscais.excluidas; assert.equal(excluidas.length, 3);
    assert.deepEqual(excluidas.map(n => [n.chave_nfe, n.tipo]).sort(), [[cancelada.chave_nfe, "saida"], [janela.chave_nfe, "saida"], [entrada.chave_nfe, "entrada"]].sort());
    assert.equal(excluidas.filter(n => n.id === cancelada.id).length, 1, "QA05 cancelada não desaparece");
    const auditada = excluidas.find(n => n.id === cancelada.id);
    assert.deepEqual(auditada, { id: cancelada.id, chave_nfe: cancelada.chave_nfe, tipo: "saida", data_emissao: "2026-09-06", valor_total: 5000, compoe_rbt12: false, compoe_receita_mes: false, motivo: "NF-e cancelada em 08/09/2026 — não compõe a receita bruta.", cancelado_em: "2026-09-09T02:30:00+00:00", motivo_cancelamento: "Erro no valor da nota", protocolo_cancelamento: "135260000000001" });
    assert.equal(new Date(auditada.cancelado_em).toISOString(), "2026-09-09T02:30:00.000Z");
    assert.equal(auditada.motivo, "NF-e cancelada em 08/09/2026 — não compõe a receita bruta.");
    for (const campo of ["cancelado_em", "motivo_cancelamento", "protocolo_cancelamento", "data_emissao", "valor_total"]) assert.equal(auditada[campo], cancelada[campo]);
    assert.equal(auditada.compoe_rbt12, false); assert.equal(auditada.compoe_receita_mes, false);
    assert.equal(excluidas.find(n => n.id === janela.id).motivo, "NF-e cancelada em 20/03/2026 — não compõe a receita bruta.");
    assert.equal(excluidas.find(n => n.id === entrada.id).motivo, "Nota fiscal de entrada não compõe a receita bruta.");
  }
  assert.equal(get.corpo.breakdown_desatualizado, false);
  const gravado = await s.estado(a); conferirCalculo(gravado, { anexo: "I", das: 400, rb: 120000, taxa: .04 }); assert.equal(gravado.receita_mes, 10000);
});

test("QA-F QA06 seis edições concorrentes preservam todo aceite e sua cadeia", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c); const a = await s.criar(c);
  const usuario = await s.usuario(c, "admin_cliente");
  const rs = await Promise.all(Array.from({ length: 6 }, (_, i) => s.chamar(caminho(a), { usuario, metodo: "PATCH", corpo: { valor_editado: 100 + i, motivo: `QA06edição${i}` } })));
  assert.ok(rs.every(r => [200, 409].includes(r.status))); const aceitos = rs.filter(r => r.status === 200); assert.ok(aceitos.length);
  const linha = await s.estado(a); assert.equal(linha.historico_edicoes.length, aceitos.length, "QA06 cada200 deixa seu evento");
  let anterior = 1550;
  for (const h of linha.historico_edicoes) { assert.equal(h.valor_anterior, anterior); anterior = h.valor_novo; assert.equal(h.editado_por, usuario.email); assert.match(h.motivo, /^QA06edição/); assert.ok(aceitos.some(r => r.corpo.valor_editado === h.valor_novo)); }
  assert.equal(linha.valor_editado, anterior);
});

test("QA-F QA07 report concorrente não escreve depois da aprovação", { timeout: 60_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c);
  for (let i = 0; i < 24; i++) {
    const a = await s.criar(c, i % 12 + 1, 2023 + Math.floor(i / 12));
    const rs = await Promise.all([s.reportar(c, a, relatorio([])), atualizar(s, a, "aprovar")]);
    assert.ok(rs.every(r => [200, 409].includes(r.status)));
    if (rs[0].status === 200) assert.equal(rs[0].corpo.status, "rascunho", "QA07 report nunca devolve aprovado após escrever");
    let linha = await s.estado(a);
    if (linha.status !== "aprovado") { assert.equal((await atualizar(s, a, "aprovar")).status, 200); linha = await s.estado(a); }
    assert.equal((await s.reportar(c, a, relatorio([]))).status, 409); assert.deepEqual(await s.estado(a), linha, "QA07 aprovado integralmente imutável");
  }
});

test("QA-F QA08 inteiros extremos e1e30 são400 sem gravação", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); const a = await s.criar(c), antes = await s.estado(a);
  for (const ano of ["2147483648", "999999999999999999999999"]) assert.equal((await s.chamar(`/apuracoes?clienteId=${c.id}&ano=${ano}`)).status, 400, "QA08 limite doINTEGER");
  assert.equal((await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 1e30, motivo: "QA08 fora doNUMERIC" } })).status, 400);
  assert.deepEqual(await s.estado(a), antes);
});

test("QA-F QA09 FR10 válido persiste e recalcula sem overflow", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ historico_receita: REFERENCIAS.map(r => ({ ...r, receita: 30000 })) }); await s.notas(c, [25000]); const a = await s.criar(c);
  for (const r of REFERENCIAS) await s.processo(c, refISO(r), 300000);
  const recalc = await atualizar(s, a, "recalcular"); assert.equal(recalc.status, 200, "QA09 FR10 não cabe no antigoNUMERIC5,4");
  conferirCalculo(recalc.corpo, { fr: 10, fs: 3600000, anexo: "III", das: 2150 }); conferirCalculo(await s.estado(a), { fr: 10, anexo: "III", das: 2150 });
});

test("QA-F QA10 alíquota completa coerente na coluna,lista,detalhe e legado", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I", historico_receita: REFERENCIAS.map(r => ({ ...r, receita: 31111.11 })) }); await s.notas(c, [25000]);
  const a = await s.criar(c), taxa = .05787499867410709;
  assert.equal((await s.estado(a)).aliquota_efetiva, taxa, "QA10 coluna não perde casas decimais");
  for (const legado of [false, true]) {
    if (legado) { const r = await s.banco.from("apuracoes").update({ aliquota_efetiva: .0579 }).eq("id", a.id); assert.ifError(r.error); }
    const antes = await s.estado(a), get = await s.chamar(caminho(a)), lista = await s.chamar(`/apuracoes?clienteId=${c.id}`);
    assert.equal(get.status, 200); assert.equal(lista.status, 200);
    for (const b of [a, get.corpo, lista.corpo[0]]) conferirCalculo(b, { anexo: "I", das: 1446.87, rb: 373333.32, taxa });
    assert.deepEqual(await s.estado(a), antes);
  }
});

test("QA-F QA11 report valida contradição,calendário,duplicata e janela", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(), a = await s.criar(c), antes = await s.estado(a);
  for (const payload of [relatorio([], { temDozeMeses: true }), relatorio([{ ano: 2026, mes: 99 }]), relatorio(Array(12).fill({ ano: 2026, mes: 9 })), relatorio([{ ano: 2026, mes: 10 }]), relatorio([{ ano: 0, mes: 1 }])]) {
    assert.equal((await s.reportar(c, a, payload)).status, 400, "QA11 relatório inválido não verifica folha"); assert.deepEqual(await s.estado(a), antes);
  }
  await s.processo(c, "2026-09-01"); assert.equal((await s.reportar(c, a, relatorio([{ ano: 2026, mes: 9 }]))).status, 200);
  assert.equal((await s.estado(a)).folha_status, "verificado");
  assert.equal((await s.estado(a)).dados_folha.processamentoPendente, false, "DAS-3 verificado não convive com processamento pendente");
  assert.equal((await s.reportar(c, a, relatorio([]))).status, 200); assert.equal((await s.estado(a)).folha_status, "sem_dados");
  for (const ref of REFERENCIAS.filter(r => r.mes !== 9)) await s.processo(c, refISO(ref));
  const completo = await s.reportar(c, a, relatorio()); assert.equal(completo.status, 200);
  const gravado = await s.estado(a); assert.equal(gravado.folha_status, "verificado"); assert.deepEqual(completo.corpo, gravado);
  assert.deepEqual(gravado.dados_folha, { temDozeMeses: true, mesesEncontrados: REFERENCIAS, totalMesesEncontrados: 12, falhaUpload: false, processamentoPendente: false, mesesPendentes: [] });
});

test("QA-F QA12 worker real respeita janela explícita e fallback na virada doano", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t);
  const refs = [{ ano: 2026, mes: 8 }, { ano: 2026, mes: 9 }];
  const c = await s.cliente({ data_inicio_atividade: "2026-08-01", historico_receita: refs.map(r => ({ ...r, receita: 50000 })) }); await s.notas(c); const a = await s.criar(c);
  const poll = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } }); assert.equal(poll.status, 200); assert.deepEqual(poll.corpo[0].mesesFolha, refs);
  await s.worker(c, { arquivosMes: [...refs, { ano: 2026, mes: 7 }, { ano: 2026, mes: 10 }] }); await s.concluidos(c);
  assert.deepEqual((await lerTodos(s.banco, "processamentos_folha", { cliente_id: c.id })).map(p => p.mes_referencia).sort(), refs.map(refISO).sort(), "QA12 janela explícita ignora mês anterior à abertura ePA");
  assert.equal((await s.estado(a)).dados_folha.totalMesesEncontrados, 2);
  const ano = Array.from({ length: 12 }, (_, i) => ({ ano: 2025, mes: i + 1 })), d = await s.cliente({ historico_receita: ano.map(r => ({ ...r, receita: 10000 })) }); await s.notas(d, [10000], { data_emissao: "2026-01-10" }); const b = await s.criar(d, 1, 2026);
  const fila = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": d.licenca } }); const { mesesFolha, ...item } = fila.corpo[0]; assert.deepEqual(mesesFolha, ano);
  await s.worker(d, { item, arquivosMes: [...ano, { ano: 2026, mes: 1 }] }); await s.concluidos(d);
  const ps = await lerTodos(s.banco, "processamentos_folha", { cliente_id: d.id });
  assert.equal(ps.length, 12, "QA12 fallback inclui janeiro anterior"); assert.deepEqual(ps.map(p => p.mes_referencia).sort(), ano.map(refISO));
  assert.equal((await s.estado(b)).folha12, 64800); assert.equal((await s.estado(b)).dados_folha.totalMesesEncontrados, 12);
});

test("QA-F QA13 XLSX inválido mantém retry; report vazio não apaga falha; correção conclui", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c); const a = await s.criar(c);
  const log = await s.worker(c, { invalido: REFERENCIAS[0] }); assert.match(log, /Erro 400/, "XLSX inválido rejeitado peloHTTP real"); await s.concluidos(c);
  const falhou = await s.estado(a); assert.equal(falhou.folha_status, "pendente", "QA13 falha não vira verificação"); assert.equal(falhou.dados_folha.falhaUpload, true);
  assert.equal((await atualizar(s, a, "recalcular")).status, 409); assert.equal((await atualizar(s, a, "aprovar")).status, 409);
  assert.equal((await s.reportar(c, a, relatorio([]))).status, 200); const vazio = await s.estado(a); assert.equal(vazio.dados_folha.falhaUpload, true); assert.equal(vazio.folha_status, "pendente");
  const poll = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } }); assert.ok(poll.corpo.some(x => x.id === a.id));
  await s.worker(c); await s.concluidos(c); assert.equal((await s.reportar(c, a)).status, 200);
  const corrigido = await s.estado(a); conferirCalculo(corrigido, { fs: 64800, fr: .54, anexo: "III", das: 600 }); assert.equal(corrigido.dados_folha.falhaUpload, false); assert.equal(corrigido.folha_status, "verificado");
  assert.equal((await atualizar(s, a, "recalcular")).status, 200); assert.equal((await atualizar(s, a, "aprovar")).status, 200);
});

test("QA-F QA14 rejeita subcentavos e audita exatamente123,46", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(), a = await s.criar(c), antes = await s.estado(a);
  for (const valor_editado of [123.456, .001]) { assert.equal((await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado, motivo: "QA14 precisão" } })).status, 400, "QA14 subcentavo inválido"); assert.deepEqual(await s.estado(a), antes); }
  const r = await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 123.46, motivo: "QA14 centavos" } }); assert.equal(r.status, 200);
  const linha = await s.estado(a); assert.equal(linha.valor_editado, 123.46); assert.equal(linha.historico_edicoes.at(-1).valor_novo, linha.valor_editado);
});

test("QA-F R1 report antes/depois de12pipelines reais preserva override e auditoria", { timeout: 120_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente(); await s.notas(c); const a = await s.criar(c);
  assert.equal((await s.chamar(caminho(a), { metodo: "PATCH", corpo: { valor_editado: 999, motivo: "R1 decisão manual" } })).status, 200);
  const ps = []; for (const r of REFERENCIAS) ps.push(await s.pendente(c, refISO(r)));
  assert.equal((await s.reportar(c, a)).status, 200); assert.equal((await atualizar(s, a, "aprovar")).status, 409);
  await comStorageDescartavel(() => Promise.all(ps.map(p => dispararPipelineAutomatico(p.id))));
  await s.concluidos(c); const linha = await s.estado(a);
  conferirCalculo(linha, { fs: 64800, fr: .54, anexo: "III", das: 600 }); assert.equal(linha.folha_status, "verificado", "R1 fim do pipeline reconcilia report anterior"); assert.equal(linha.valor_editado, 999);
  assert.equal(linha.historico_edicoes.length, 2); const h = linha.historico_edicoes.at(-1);
  assert.equal(h.origem, "folha"); assert.equal(h.valor_anterior, 999); assert.equal(h.valor_novo, 999); assert.equal(h.valor_calculado_anterior, 1550); assert.equal(h.valor_calculado_novo, 600);
  assert.equal((await s.reportar(c, a)).status, 200);
  const reports = await Promise.all(Array.from({ length: 6 }, () => s.reportar(c, a))); assert.ok(reports.every(r => [200, 409].includes(r.status))); assert.equal((await s.estado(a)).historico_edicoes.length, 2);
  assert.equal((await atualizar(s, a, "aprovar")).status, 200); const aprovado = await s.estado(a);
  const outro = await s.pendente(c, "2026-09-01", 6000); await comStorageDescartavel(() => dispararPipelineAutomatico(outro.id));
  assert.equal((await s.reportar(c, a)).status, 409); assert.deepEqual(await s.estado(a), aprovado);
});

test("QA-F R2 PA2020 aceita folha2019 da janela sem relaxar calendário", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ historico_receita: [] }), a = await s.criar(c, 1, 2020);
  const poll = await s.chamar("/apuracoes/folha-pendente", { usuario: null, cabecalhos: { "x-licenca-token": c.licenca } }); assert.equal(poll.status, 200); assert.ok(poll.corpo[0].mesesFolha.every(r => r.ano === 2019));
  for (const r of [{ ano: 0, mes: 12 }, { ano: 2019, mes: 13 }, { ano: 2018, mes: 12 }]) assert.equal((await s.reportar(c, a, relatorio([r]))).status, 400);
  await s.processo(c, "2019-12-01"); const r = await s.reportar(c, a, relatorio([{ ano: 2019, mes: 12 }])); assert.equal(r.status, 200, "R2 ano daFS não é piso2020 doPA"); assert.equal(r.corpo.folha_status, "verificado");
});

async function conferirEmpresaNova(s, { meses, receita, folha, fr, anexo, das }) {
  const inicio = 2026 * 12 + 9 - meses;
  const refs = Array.from({ length: meses }, (_, i) => { const n = inicio + i; return { ano: Math.floor(n / 12), mes: n % 12 + 1 }; });
  const c = await s.cliente({ data_inicio_atividade: refISO(refs[0]), historico_receita: refs.map((r, i) => ({ ...r, receita: i ? 0 : receita })) }); await s.notas(c);
  for (let i = 0; i < refs.length; i++) await s.processo(c, refISO(refs[i]), i ? 0 : folha);
  const a = await s.criar(c);
  async function leituras() {
    const antes = await s.estado(a), get = await s.chamar(caminho(a)), list = await s.chamar(`/apuracoes?clienteId=${c.id}`); assert.equal(get.status, 200); assert.equal(list.status, 200);
    for (const r of [get.corpo, list.corpo[0]]) { conferirCalculo(r, { fr, anexo, das, taxa: anexo === "V" ? .155 : .06 }); if (r.anexo_original !== undefined) assert.equal(r.anexo_original, "V"); }
    assert.deepEqual(await s.estado(a), antes, "leitura não modifica a apuração");
  }
  conferirCalculo(a, { fr, anexo, das }); await leituras();
  const recalc = await atualizar(s, a, "recalcular"); assert.equal(recalc.status, 200); conferirCalculo(recalc.corpo, { fr, anexo, das });
  const report = await s.reportar(c, a, relatorio(refs)); assert.equal(report.status, 200); conferirCalculo(report.corpo, { fr, anexo, das }); await leituras();
  assert.equal((await atualizar(s, a, "aprovar")).status, 200); await leituras();
}

test("QA-F R3 razão das somas em7meses,exato28% e umcentavo abaixo", async t => {
  const s = await iniciarCenarioApuracao(t);
  await conferirEmpresaNova(s, { meses: 7, receita: 100001, folha: 28000.28, fr: .28, anexo: "III", das: 600 });
  await conferirEmpresaNova(s, { meses: 7, receita: 100001, folha: 28000.27, fr: .27, anexo: "V", das: 1550 });
});

test("QA-F R4 leitura não remigra V por bases arredondadas em11meses", async t => {
  const s = await iniciarCenarioApuracao(t);
  await conferirEmpresaNova(s, { meses: 11, receita: 100.01, folha: 28, fr: .27, anexo: "V", das: 1550 });
  await conferirEmpresaNova(s, { meses: 11, receita: 100, folha: 28, fr: .28, anexo: "III", das: 600 });
});

test("QA-F R5 callback autorizado,perfis,RLS,escopo e restauração do contexto", { timeout: 60_000 }, async t => {
  const s = await iniciarCenarioApuracao(t), estrangeiro = await s.cliente(); await s.notas(estrangeiro); const apEstrangeira = await s.criar(estrangeiro), procEstrangeiro = await s.pendente(estrangeiro, "2026-09-01", 60000), fotoEstrangeira = await s.estado(apEstrangeira);
  for (const perfil of ["admin_cliente", "funcionario"]) {
    const c = await s.cliente(); await s.notas(c); const a = await s.criar(c), usuario = await s.usuario(c, perfil), p = await s.pendente(c, "2026-09-01", 60000);
    assert.equal((await s.reportar(c, a, relatorio([{ ano: 2026, mes: 9 }]))).status, 200);
    assert.equal((await s.chamar(`/folha/${procEstrangeiro.id}/calcular`, { usuario, metodo: "POST", corpo: {} })).status, 404);
    assert.equal((await s.chamar(`/folha/${p.id}/calcular`, { usuario, metodo: "POST", corpo: {} })).status, 200);
    const linha = await s.estado(a); conferirCalculo(linha, { fs: 64800, fr: .54, anexo: "III", das: 600 }); assert.equal(linha.historico_edicoes.length, 1, "R5 ambos perfis geram evento automático");
    assert.deepEqual(await s.estado(apEstrangeira), fotoEstrangeira);
    const procFoto = await s.banco.from("processamentos_folha").select("status").eq("id", procEstrangeiro.id).single(); assert.ifError(procFoto.error); assert.equal(procFoto.data.status, "pendente");
    assert.equal((await s.chamar(caminho(a), { usuario, metodo: "PATCH", corpo: { valor_editado: 999, motivo: "R5 permissão manual" } })).status, perfil === "funcionario" ? 403 : 200);
    if (perfil === "funcionario") for (const acao of ["aprovar", "recalcular"]) assert.equal((await s.chamar(`${caminho(a)}/${acao}`, { usuario, metodo: "PATCH", corpo: {} })).status, 403);
    assert.equal((await atualizar(s, a, "aprovar")).status, 200); const aprovado = await s.estado(a), outro = await s.pendente(c, "2026-09-01", 70000);
    assert.equal((await s.chamar(`/folha/${outro.id}/calcular`, { usuario, metodo: "POST", corpo: {} })).status, 200); assert.deepEqual(await s.estado(a), aprovado);
    // SELECTs e UPDATEs abaixo usam JWTs assinados para usuários reais, não mocks.
    const count = async id => { const q = await dbContextual.from("apuracoes").select("id").eq("cliente_id", id); assert.ifError(q.error); return q.data.length; };
    await executarComDbDoUsuario(usuario, async () => {
      const ctx = contextoDb.getStore(); assert.equal(await count(c.id), 1); assert.equal(await count(estrangeiro.id), 0);
      await Promise.all([contextoDb.run(servicoDb, async () => { assert.equal(await count(estrangeiro.id), 1); await Promise.resolve(); assert.equal(contextoDb.getStore(), servicoDb); }), contextoDb.run(criarDbDoUsuario(await s.usuario(estrangeiro, "funcionario")), async () => { assert.equal(await count(c.id), 0); })]);
      assert.equal(contextoDb.getStore(), ctx);
      await assert.rejects(contextoDb.run(servicoDb, async () => { throw Error("R5 erro interno controlado"); }), /erro interno/); assert.equal(contextoDb.getStore(), ctx); assert.equal(await count(estrangeiro.id), 0);
      if (perfil === "funcionario") { const negado = await dbContextual.from("apuracoes").update({ valor_editado: 1 }).eq("id", a.id).select(); assert.ifError(negado.error); assert.deepEqual(negado.data, [], "policy não permite edição manual"); }
    });
    assert.equal(contextoDb.getStore(), undefined); assert.deepEqual(await s.estado(a), aprovado);
  }
});

test("QA-F G1 cancelamento mantém metadados,dia deBrasília e legado semdata", async t => {
  const s = await iniciarCenarioApuracao(t), c = await s.cliente({ anexo_simples: "I" }); await s.notas(c, [5000]);
  const [um] = await s.notas(c, [1000], { status: "cancelada", cancelado_em: "2026-10-05T02:59:59Z", motivo_cancelamento: "G1 motivo A", protocolo_cancelamento: "G1-protocolo-A" });
  const [dois] = await s.notas(c, [2000], { status: "cancelada", cancelado_em: "2026-10-05T03:00:00Z", motivo_cancelamento: "G1 motivo B", protocolo_cancelamento: "G1-protocolo-B" });
  const [legado] = await s.notas(c, [3000], { status: "cancelada" });
  const a = await s.criar(c), get = await s.chamar(caminho(a)), recalc = await atualizar(s, a, "recalcular"); assert.equal(get.status, 200); assert.equal(recalc.status, 200);
  for (const b of [a, get.corpo, recalc.corpo]) {
    assert.equal(b.valor_calculado, 200); const ns = b.notas_fiscais.excluidas; assert.equal(ns.length, 3);
    for (const [n, dia] of [[um, "04/10/2026"], [dois, "05/10/2026"]]) { const auditada = ns.find(x => x.id === n.id); assert.equal(auditada.cancelado_em, n.cancelado_em); assert.equal(auditada.motivo_cancelamento, n.motivo_cancelamento); assert.equal(auditada.protocolo_cancelamento, n.protocolo_cancelamento); assert.ok(auditada.motivo.includes(dia), "G1 data emBrasília"); }
    const antigo = ns.find(n => n.id === legado.id); for (const campo of ["cancelado_em", "motivo_cancelamento", "protocolo_cancelamento"]) assert.equal(antigo[campo], null); assert.doesNotMatch(antigo.motivo, /\d{2}\/\d{2}\/\d{4}/);
  }
});
