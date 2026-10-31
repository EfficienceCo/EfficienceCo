// O hook rodando de verdade: git push real para um bare temporario, com comando de teste falso.
// Aqui: o que nao deve rodar o comando (documentacao, exclusao de branch, tag) e o que parece documentacao mas nao e.
import test from "node:test";
import assert from "node:assert/strict";
import { cenario, commitar, escrever, git0 } from "./ajuda-repo.mjs";

test("push so de .md ou docs/ passa sem rodar o comando, ate com pasta suja", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  assert.equal(c.push(["origin", "feat"]).status, 0);
  assert.equal(c.execucoes().length, 1);

  commitar(c.trabalho, "README.md", "# novo\n");
  const sha = commitar(c.trabalho, "docs/guia.md", "guia\n");
  escrever(c.trabalho, "sujeira.txt", "x\n");
  const r = c.push(["origin", "feat"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.match(r.texto, /so de documentacao/);
  assert.equal(c.refRemota("refs/heads/feat"), sha);
  assert.equal(c.execucoes().length, 1);
});

test("mover codigo para dentro de docs/ ainda roda o comando", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  assert.equal(c.push(["origin", "feat"]).status, 0);
  escrever(c.trabalho, "docs/.gitkeep", "");
  git0(c.trabalho, ["mv", "backend/a.js", "docs/a.md"]);
  git0(c.trabalho, ["add", "-A"]);
  git0(c.trabalho, ["commit", "-q", "-m", "move codigo para docs"]);
  const r = c.push(["origin", "feat"], { saida: 1 });
  assert.notEqual(r.status, 0);
  assert.equal(c.execucoes().length, 1);
});

test("apagar branch nao roda nada, mesmo com pasta suja e comando que falharia", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  assert.equal(c.push(["origin", "feat"]).status, 0);
  git0(c.trabalho, ["switch", "-q", "main"]);
  escrever(c.trabalho, "sujeira.txt", "x\n");
  const antes = c.execucoes().length;
  const r = c.push(["origin", "--delete", "feat"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, antes);
});

test("enviar tag nao roda nada", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["tag", "v1"]);
  const r = c.push(["origin", "v1"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.ok(c.refRemota("refs/tags/v1"));
  assert.equal(c.execucoes().length, 0);
});
