import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { criarCenarioBanco, resetarBanco } from "../helpers/banco.js";
import { iniciarApiTeste } from "../helpers/http.js";
import { lerTentativas, consumirTentativas } from "../helpers/servicos-externos.js";
import { PERFIS } from "../../src/config/perfis.js";

// O runner executa os arquivos em série; cada teste começa e termina sem dados.
beforeEach(resetarBanco);
afterEach(resetarBanco);

async function buscar(banco, tabela, id) {
  const { data, error } = await banco.from(tabela).select("id").eq("id", id);
  assert.equal(error, null, error?.message);
  return data;
}

test("#679: limpar um cenário preserva o outro e pode ser repetido", { timeout: 30_000 }, async t => {
  const primeiro = criarCenarioBanco();
  const outro = criarCenarioBanco();
  t.after(async () => { await primeiro.limpar(); await outro.limpar(); });
  const clienteA = await primeiro.criarCliente();
  const clienteB = await outro.criarCliente();
  const usuarioA = await primeiro.criarUsuario({ clienteId: clienteA.id });
  const usuarioB = await outro.criarUsuario({ clienteId: clienteB.id });
  const funcionarioA = await primeiro.criarFuncionario({ clienteId: clienteA.id });
  const funcionarioB = await outro.criarFuncionario({ clienteId: clienteB.id });

  await primeiro.limpar();
  await primeiro.limpar();
  for (const [tabela, removido, preservado] of [
    ["clientes", clienteA, clienteB], ["usuarios", usuarioA, usuarioB],
    ["funcionarios", funcionarioA, funcionarioB],
  ]) {
    assert.deepEqual(await buscar(outro.banco, tabela, removido.id), []);
    assert.deepEqual(await buscar(outro.banco, tabela, preservado.id), [{ id: preservado.id }]);
  }
  await assert.rejects(primeiro.criarCliente(), /Cenário encerrado/);
});

test("#679: reset remove dados da rota e nova API não herda autenticação", { timeout: 30_000 }, async t => {
  const primeiro = criarCenarioBanco();
  const cliente = await primeiro.criarCliente();
  const usuario = await primeiro.criarUsuario({ clienteId: cliente.id });
  const api = await iniciarApiTeste();
  t.after(() => api.fechar());
  const criada = await api.requisitar("/funcionarios", {
    usuario, metodo: "POST", corpo: {
      cpf: "12345678909", nome: "Criado pela rota, sintético #679",
      data_admissao: "2026-01-05", categoria: "101", salario: 2000,
    },
  });
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.cliente_id, cliente.id);
  assert.equal((await buscar(primeiro.banco, "funcionarios", criada.corpo.id)).length, 1);
  await api.fechar();
  await resetarBanco();

  const segundo = criarCenarioBanco();
  for (const tabela of ["clientes", "usuarios", "funcionarios"]) {
    const { data, error } = await segundo.banco.from(tabela).select("id");
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, [], `${tabela} deve começar vazia.`);
  }
  const novaApi = await iniciarApiTeste();
  t.after(() => novaApi.fechar());
  assert.equal((await novaApi.requisitar(`/funcionarios/${criada.corpo.id}`)).status, 401);
  const novoCliente = await segundo.criarCliente();
  const novoUsuario = await segundo.criarUsuario({ clienteId: novoCliente.id });
  const novoFuncionario = await segundo.criarFuncionario({ clienteId: novoCliente.id });
  assert.equal((await novaApi.requisitar(`/funcionarios/${novoFuncionario.id}`, { usuario: novoUsuario })).status, 200);
  assert.deepEqual(lerTentativas(), []);
});

test("#679: os três perfis usam seu contexto real nas rotas", { timeout: 30_000 }, async t => {
  const cenario = criarCenarioBanco();
  const clienteA = await cenario.criarCliente();
  const clienteB = await cenario.criarCliente();
  const proprio = await cenario.criarFuncionario({ clienteId: clienteA.id });
  const outro = await cenario.criarFuncionario({ clienteId: clienteB.id });
  const api = await iniciarApiTeste();
  t.after(() => api.fechar());
  for (const [perfil, statusOutro] of [
    [PERFIS.ADMIN_EFFICIENCE, 200], [PERFIS.ADMIN_CLIENTE, 404], [PERFIS.FUNCIONARIO, 404],
  ]) {
    const usuario = await cenario.criarUsuario({ clienteId: clienteA.id, perfil });
    assert.equal(usuario.perfil, perfil);
    assert.equal((await api.requisitar(`/funcionarios/${proprio.id}`, { usuario })).status, 200);
    assert.equal((await api.requisitar(`/funcionarios/${outro.id}`, { usuario })).status, statusOutro, perfil);
    assert.equal((await api.requisitar(`/funcionarios/${outro.id}`)).status, 401);
  }
});

test("#679: reset recusa destino indevido antes de tentar rede", async () => {
  const original = process.env.TEST_SUPABASE_URL;
  try {
    process.env.TEST_SUPABASE_URL = "https://destino-invalido.example.invalid";
    await assert.rejects(resetarBanco(), /Destino de teste inválido/);
    assert.deepEqual(lerTentativas(), []);
  } finally {
    process.env.TEST_SUPABASE_URL = original;
  }
});

test("#679: chave anon não pode executar o reset", async () => {
  assert.ok(process.env.TEST_SUPABASE_ANON_KEY, "Chave anon local ausente no executor.");
  const cenario = criarCenarioBanco();
  const cliente = await cenario.criarCliente();
  const anon = createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await anon.rpc("__teste_679_resetar_banco");
  assert.equal(error?.code, "42501");
  assert.deepEqual(await buscar(cenario.banco, "clientes", cliente.id), [{ id: cliente.id }]);
});

test("#679: tentativas consumidas não reaparecem no cenário seguinte", async t => {
  assert.deepEqual(lerTentativas(), []);
  await assert.rejects(fetch("https://esocial.example.invalid/enviar"), /bloqueado: eSocial/);
  const copia = lerTentativas();
  copia[0].servico = "alterado só na cópia";
  assert.equal(lerTentativas()[0].servico, "eSocial");
  assert.equal(consumirTentativas().length, 1);
  assert.deepEqual(lerTentativas(), []);
  const cenario = criarCenarioBanco();
  const api = await iniciarApiTeste();
  t.after(() => api.fechar());
  const { data, error } = await cenario.banco.from("clientes").select("id");
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, []);
  assert.equal((await api.requisitar("/funcionarios")).status, 401);
});
