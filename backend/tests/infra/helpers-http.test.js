import test from "node:test";
import assert from "node:assert/strict";
import { criarCenarioBanco } from "../helpers/banco.js";
import { iniciarApiTeste } from "../helpers/http.js";

test("#679: consulta HTTP real respeita o cliente e exige autenticação", { timeout: 60_000 }, async t => {
  const cenario = criarCenarioBanco();
  let api;
  // A limpeza roda inclusive quando uma asserção ou a preparação falha.
  t.after(async () => {
    try { await api?.fechar(); }
    finally { await cenario.limpar(); }
  });

  const clienteA = await cenario.criarCliente({ nome: "Cliente A sintético #679" });
  const clienteB = await cenario.criarCliente({ nome: "Cliente B sintético #679" });
  const usuarioA = await cenario.criarUsuario({ clienteId: clienteA.id });
  const usuarioB = await cenario.criarUsuario({ clienteId: clienteB.id });
  const funcionarioB = await cenario.criarFuncionario({ clienteId: clienteB.id });
  api = await iniciarApiTeste();
  const caminho = `/funcionarios/${funcionarioB.id}`;

  await t.test("dono B encontra o registro existente: 200", async () => {
    const resposta = await api.requisitar(caminho, { usuario: usuarioB });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.id, funcionarioB.id);
    assert.equal(resposta.corpo.cliente_id, clienteB.id);
    assert.equal(resposta.corpo.nome, funcionarioB.nome);
  });

  await t.test("usuário de A não acessa o registro de B: 404", async () => {
    const resposta = await api.requisitar(caminho, { usuario: usuarioA });
    assert.equal(resposta.status, 404);
    assert.deepEqual(resposta.corpo, { erro: "Funcionário não encontrado" });
  });

  await t.test("sem usuário, mesmo após chamadas autenticadas: 401", async () => {
    const resposta = await api.requisitar(caminho);
    assert.equal(resposta.status, 401);
    assert.deepEqual(resposta.corpo, { erro: "Token nao fornecido" });
  });

  await cenario.limpar();
  const { data, error } = await cenario.banco.from("funcionarios")
    .select("id").eq("id", funcionarioB.id);
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, [], "A limpeza deve remover o funcionário criado.");
});
