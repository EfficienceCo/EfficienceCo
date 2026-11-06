// Falhas do proprio hook: o push tem que ser cancelado, nunca liberado por engano.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cenario, commitar, git, git0, pastaHooks } from "./ajuda-repo.mjs";

test("stdin invalido (erro inesperado): sai com 1 e diz que cancelou por seguranca", (t) => {
  const c = cenario(t);
  const r = spawnSync("node", [path.join(pastaHooks, "lib", "executar.mjs")], {
    cwd: c.trabalho, input: "lixo\n", encoding: "utf8", windowsHide: true,
  });
  assert.equal(r.status, 1, `${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /Erro inesperado/);
  assert.match(r.stderr, /Push cancelado por seguranca/);
  assert.equal(c.execucoes().length, 0);
});

test("comando de teste inexistente cancela o push e o remoto nao muda", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = git(c.trabalho, ["push", "origin", "feat"], { PRE_PUSH_COMANDO: "comando-que-nao-existe-xyz" });
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Push cancelado: os testes falharam/);
  assert.match(r.texto, /codigo de saida/);
  assert.equal(c.refRemota("refs/heads/feat"), null);
});
