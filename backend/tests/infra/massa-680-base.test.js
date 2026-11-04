import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CONFIG_MASSA_680, criarMassaBase680, gerarCpfSintetico, gerarCnpjSintetico } from "../fixtures/massa-680.js";
import { cpfValido, cnpjValido } from "../../src/utils/comum.util.js";

test("#680: mesma configuração produz exatamente a mesma massa em fusos diferentes", async () => {
  assert.deepEqual(criarMassaBase680(), criarMassaBase680());
  const fixture = new URL("../fixtures/massa-680.js", import.meta.url).href;
  const codigo = `import { criarMassaBase680 } from ${JSON.stringify(fixture)}; process.stdout.write(JSON.stringify(criarMassaBase680()));`;
  const resultados = [];
  for (const TZ of ["UTC", "America/Sao_Paulo"]) {
    const env = { ...process.env, TZ };
    delete env.NODE_TEST_CONTEXT;
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "--eval", codigo], { env, timeout: 5_000 });
    resultados.push(JSON.parse(stdout));
  }
  assert.deepEqual(resultados[0], resultados[1]);
  assert.deepEqual(resultados[0], criarMassaBase680());
});

test("#680: contagens e perfis são completos nos dois contextos atuais", () => {
  const massa = criarMassaBase680();
  // Quantidades escolhidas para esta etapa, não calculadas pelo gerador sob teste.
  assert.equal(massa.clientes.length, 2);
  assert.equal(massa.usuarios.length, 6);
  for (const cliente of massa.clientes) {
    const usuarios = massa.usuarios.filter(usuario => usuario.cliente_id === cliente.id);
    assert.equal(usuarios.length, 3);
    assert.deepEqual(usuarios.map(usuario => usuario.perfil).sort(), ["admin_cliente", "admin_efficience", "funcionario"]);
  }
  const ids = [...massa.clientes, ...massa.usuarios].map(registro => registro.id);
  assert.equal(new Set(ids).size, 8);
  assert.ok(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)));
  assert.equal(new Set(massa.usuarios.map(usuario => usuario.email)).size, 6);
});

test("#680: alterar o resultado não altera a próxima criação", () => {
  const primeira = criarMassaBase680();
  const esperada = criarMassaBase680();
  primeira.clientes[0].nome = "Alterado somente nesta cópia";
  primeira.usuarios.pop();
  assert.deepEqual(criarMassaBase680(), esperada);
});

test("#680: datas, IDs e hash podem ser fornecidos explicitamente", () => {
  const config = {
    instante: "2026-11-01T09:30:00.000Z",
    prefixoIds: "68000001-0000-4000-8000",
    senhaHash: bcrypt.hashSync("outra-senha-sintetica", "$2b$04$abcdefghijklmnopqrstuu"),
  };
  const massa = criarMassaBase680(config);
  assert.deepEqual(massa, criarMassaBase680(config));
  for (const registro of [...massa.clientes, ...massa.usuarios]) {
    assert.equal(registro.criado_em, config.instante);
    assert.ok(registro.id.startsWith(config.prefixoIds));
  }
  for (const usuario of massa.usuarios) {
    assert.equal(usuario.senha_hash, config.senhaHash);
    assert.ok(massa.clientes.some(cliente => cliente.id === usuario.cliente_id));
  }
});

test("#680: documentos gerados têm os dígitos verificadores esperados", () => {
  // Vetores fixos para conferir o cálculo, sem consultar o resultado do gerador.
  assert.equal(gerarCpfSintetico("123456789"), "12345678909");
  assert.equal(gerarCnpjSintetico("112223330001"), "11222333000181");
  for (let indice = 1; indice <= 6; indice += 1) {
    assert.ok(cpfValido(gerarCpfSintetico(String(680000100 + indice))));
  }
  assert.ok(criarMassaBase680().clientes.every(cliente => cnpjValido(cliente.cnpj)));
  assert.equal(cpfValido("12345678900"), false);
  assert.equal(cnpjValido("11222333000180"), false);
});

test("#680: credenciais são sintéticas e o hash fixo permite a senha de teste", () => {
  const massa = criarMassaBase680();
  assert.ok(massa.usuarios.every(usuario => usuario.email.endsWith("@example.invalid")));
  assert.ok(massa.usuarios.every(usuario => usuario.nome.includes("sintético")));
  assert.ok(massa.usuarios.every(usuario => usuario.senha_hash === CONFIG_MASSA_680.senhaHash));
  assert.ok(bcrypt.compareSync("senha-sintetica-680", massa.usuarios[0].senha_hash));
});

test("#680: configuração e bases inválidas são recusadas", () => {
  assert.throws(() => criarMassaBase680({ ...CONFIG_MASSA_680, instante: "data-inválida" }), /data de referência/);
  assert.throws(() => criarMassaBase680({ ...CONFIG_MASSA_680, instante: "2026-10-15T12:00:00" }), /data de referência/);
  assert.throws(() => criarMassaBase680({ ...CONFIG_MASSA_680, instante: "2026-02-30T12:00:00.000Z" }), /data de referência/);
  assert.throws(() => criarMassaBase680({ ...CONFIG_MASSA_680, prefixoIds: "id-inválido" }), /prefixo UUID/);
  assert.throws(() => criarMassaBase680({ ...CONFIG_MASSA_680, senhaHash: "sem-hash" }), /hash bcrypt/);
  assert.throws(() => gerarCpfSintetico("000000000"), /base sintética/);
  assert.throws(() => gerarCnpjSintetico("123"), /base sintética/);
});
