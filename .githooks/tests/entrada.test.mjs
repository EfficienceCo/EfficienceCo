import test from "node:test";
import assert from "node:assert/strict";
import { lerEntrada } from "../lib/entrada.mjs";

function falhar(codigo) {
  return () => { throw Object.assign(new Error(`leitura falhou (${codigo})`), { code: codigo }); };
}

test("lerEntrada devolve o que o git enviou", () => {
  assert.equal(lerEntrada(() => "linha\n"), "linha\n");
});

test("stdin sem dados (EOF) conta como vazio", () => {
  assert.equal(lerEntrada(falhar("EOF")), "");
});

test("outro erro de leitura nao vira entrada vazia: propaga para o hook cancelar o push", () => {
  assert.throws(() => lerEntrada(falhar("EAGAIN")), /EAGAIN/);
  assert.throws(() => lerEntrada(falhar("EIO")), /EIO/);
  assert.throws(() => lerEntrada(() => { throw new Error("sem codigo"); }), /sem codigo/);
});
