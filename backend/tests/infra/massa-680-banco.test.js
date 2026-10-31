import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { recriarMassa680, snapshotMassa680 } from "../helpers/massa-680.js";
import { resetarBanco } from "../helpers/banco.js";
import { iniciarApiTeste } from "../helpers/http.js";
import { lerTentativas } from "../helpers/servicos-externos.js";
import { CONFIG_MASSA_680 } from "../fixtures/massa-680.js";
import { cpfValido } from "../../src/utils/comum.util.js";

afterEach(resetarBanco);

test("#680: duas recriações dão o mesmo banco sem duplicar registros", { timeout: 60_000 }, async () => {
  await recriarMassa680();
  const primeira = await snapshotMassa680();
  const esperadas = {
    clientes: 2, usuarios: 6, lancamentos_contabeis: 32, extratos_bancarios: 8,
    transacoes_extrato: 46, conciliacoes: 4, pares_conciliacao: 46,
    lancamentos_fiscais: 8, lancamentos_fiscais_itens: 8, obrigacoes: 6,
  };
  for (const [tabela, quantidade] of Object.entries(esperadas)) assert.equal(primeira[tabela].length, quantidade, tabela);
  assert.ok(primeira.clientes.every(cliente => cliente.total_usuarios === 3));
  await recriarMassa680();
  assert.deepEqual(await snapshotMassa680(), primeira);
});

test("#680: estados são persistidos em ambos os contextos", { timeout: 30_000 }, async () => {
  await recriarMassa680();
  const snapshot = await snapshotMassa680();
  const estados = linhas => [...new Set(linhas.map(linha => linha.status))].sort();
  for (const cliente of snapshot.clientes) {
    const linhas = tabela => snapshot[tabela].filter(linha => linha.cliente_id === cliente.id);
    assert.deepEqual(estados(linhas("extratos_bancarios")), ["aguardando", "erro", "processado"]);
    assert.deepEqual(estados(linhas("conciliacoes")), ["concluida", "em_andamento"]);
    assert.deepEqual(estados(linhas("lancamentos_fiscais")), ["ativa", "cancelada"]);
    assert.deepEqual(estados(linhas("obrigacoes")), ["atrasada", "concluida", "pendente"]);
    assert.ok(linhas("obrigacoes").find(item => item.status === "concluida").comprovante_path);
    assert.equal(linhas("usuarios").length, 3);
  }
});

test("#680: CPF do emitente mantém 11 dígitos no banco em ambos os contextos", { timeout: 30_000 }, async () => {
  const { massa } = await recriarMassa680();
  const snapshot = await snapshotMassa680();
  const notasCpf = snapshot.lancamentos_fiscais.filter(nota => nota.cnpj_emitente.length === 11);
  assert.equal(notasCpf.length, 2);
  for (const cliente of snapshot.clientes) {
    const notas = notasCpf.filter(nota => nota.cliente_id === cliente.id);
    assert.equal(notas.length, 1);
    const nota = notas[0];
    const entrada = massa.entradasNfe.find(item => item.cliente_id === cliente.id && item.caso === "entrada-emitente-cpf");
    assert.match(nota.cnpj_emitente, /^\d{11}$/);
    assert.ok(cpfValido(nota.cnpj_emitente));
    assert.equal(nota.cnpj_emitente, entrada.emitente);
    assert.equal(nota.chave_nfe, entrada.chave);
    assert.equal(nota.tipo, "entrada");
    assert.equal(nota.status, "ativa");
    assert.equal(snapshot.lancamentos_fiscais_itens.filter(item => item.lancamento_id === nota.id && item.cliente_id === cliente.id).length, 1);
  }
});

test("#680: HTTP pagina 21 transações em 15 + 6 sem misturar clientes", { timeout: 30_000 }, async t => {
  const { massa } = await recriarMassa680();
  const api = await iniciarApiTeste();
  t.after(() => api.fechar());
  for (const [indice, cenario] of massa.paginacao.entries()) {
    const usuario = massa.tabelas.usuarios.find(item => item.id === cenario.usuarioId);
    const caminho = `/conciliacoes/extrato/${cenario.extratoId}/transacoes?limit=15`;
    const primeira = await api.requisitar(`${caminho}&offset=0`, { usuario });
    const segunda = await api.requisitar(`${caminho}&offset=15`, { usuario });
    assert.equal(primeira.status, 200);
    assert.equal(segunda.status, 200);
    assert.equal(primeira.corpo.total, 21);
    assert.equal(segunda.corpo.total, 21);
    assert.equal(primeira.corpo.data.length, 15);
    assert.equal(segunda.corpo.data.length, 6);
    const todos = [...primeira.corpo.data, ...segunda.corpo.data];
    assert.equal(new Set(todos.map(item => item.id)).size, 21);
    assert.ok(todos.every(item => item.cliente_id === cenario.clienteId && item.extrato_id === cenario.extratoId));
    const esperadas = massa.tabelas.transacoes_extrato.filter(item => item.extrato_id === cenario.extratoId)
      .sort((a, b) => b.data_lancamento.localeCompare(a.data_lancamento)).map(item => item.id);
    assert.deepEqual(todos.map(item => item.id), esperadas);
    const outro = massa.tabelas.usuarios.find(item => item.id === massa.paginacao[1 - indice].usuarioId);
    assert.equal((await api.requisitar(`${caminho}&offset=0`, { usuario: outro })).status, 404);
  }
});

test("#680: configuração inválida não apaga a massa já carregada", { timeout: 30_000 }, async () => {
  await recriarMassa680();
  const antes = await snapshotMassa680();
  await assert.rejects(recriarMassa680({ ...CONFIG_MASSA_680, instante: "sem-data" }), /data de referência/);
  assert.deepEqual(await snapshotMassa680(), antes);
});

test("#680: carga recusa destino indevido antes de tentar rede", async () => {
  const original = process.env.TEST_SUPABASE_URL;
  try {
    process.env.TEST_SUPABASE_URL = "https://destino-invalido.example.invalid";
    await assert.rejects(recriarMassa680(), /Destino de teste inválido/);
    assert.deepEqual(lerTentativas(), []);
  } finally {
    process.env.TEST_SUPABASE_URL = original;
  }
});
