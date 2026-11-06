// O hook rodando de verdade: o que o executor coleta do git (status, HEAD, codigo de saida).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cenario, commitar, escrever, git0 } from "./ajuda-repo.mjs";

test("nao rastreado dentro de pasta nova, com espaco e acento, e listado pelo nome exato", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  escrever(c.trabalho, "pasta nova/arq ção.js", "x\n");
  const r = c.push(["origin", "feat"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Push recusado/);
  assert.ok(r.texto.split(/\r?\n/).includes("  - pasta nova/arq ção.js"), r.texto);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, 0);
});

for (const saida of [2, 127]) {
  test(`comando de teste que sai com ${saida} cancela o push e o remoto nao muda`, (t) => {
    const c = cenario(t);
    git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
    commitar(c.trabalho, "backend/a.js", "a2\n");
    const r = c.push(["origin", "feat"], { saida });
    assert.notEqual(r.status, 0);
    assert.match(r.texto, new RegExp(`codigo de saida ${saida}`));
    assert.equal(c.refRemota("refs/heads/feat"), null);
    assert.equal(c.execucoes().length, 1);
  });
}

test("git status que falha cancela o push por seguranca (indice corrompido)", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  fs.writeFileSync(path.join(c.trabalho, ".git", "index"), "lixo que nao e um indice\n");
  const r = c.push(["origin", "feat"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Erro inesperado/);
  assert.match(r.texto, /Push cancelado por seguranca/);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, 0);
});

test("git rev-parse HEAD que falha cancela o push por seguranca (HEAD sem commit)", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  const sha = commitar(c.trabalho, "backend/a.js", "a2\n");
  git0(c.trabalho, ["symbolic-ref", "HEAD", "refs/heads/inexistente"]);
  const r = c.push(["origin", `${sha}:refs/heads/feat`]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Erro inesperado/);
  assert.match(r.texto, /Push cancelado por seguranca/);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, 0);
});
