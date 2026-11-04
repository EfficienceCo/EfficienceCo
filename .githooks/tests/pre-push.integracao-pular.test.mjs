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

// Bypass apontado na revisao do #713: `git push origin <tag>:refs/heads/<branch>` envia codigo para um branch.
test("tag enviada para refs/heads/ de outro commit e recusada sem rodar o comando", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "ruim"]);
  commitar(c.trabalho, "backend/a.js", "codigo sem teste\n");
  git0(c.trabalho, ["tag", "v-ruim"]);
  git0(c.trabalho, ["tag", "-a", "anot-ruim", "-m", "anotada"]);
  git0(c.trabalho, ["switch", "-q", "main"]);
  const r = c.push(["origin", "v-ruim:refs/heads/alvo"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /commit enviado nao e o da pasta/);
  assert.equal(c.refRemota("refs/heads/alvo"), null);
  assert.equal(c.execucoes().length, 0);

  const anotada = c.push(["origin", "anot-ruim:refs/heads/alvo"]);
  assert.notEqual(anotada.status, 0);
  assert.match(anotada.texto, /commit enviado nao e o da pasta/);
  assert.equal(c.refRemota("refs/heads/alvo"), null);
  assert.equal(c.execucoes().length, 0);
});

test("ref local que nao e commit enviada para refs/heads/ cancela o push (nunca libera)", (t) => {
  const c = cenario(t);
  const r = c.push(["origin", "HEAD^{tree}:refs/heads/alvo"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Erro inesperado/);
  assert.equal(c.refRemota("refs/heads/alvo"), null);
  assert.equal(c.execucoes().length, 0);
});

test("varias refspecs: tag para refs/heads/ de outro commit recusa mesmo junto de uma tag legitima", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "ruim"]);
  commitar(c.trabalho, "backend/a.js", "codigo sem teste\n");
  git0(c.trabalho, ["tag", "v-ruim"]);
  git0(c.trabalho, ["switch", "-q", "main"]);
  git0(c.trabalho, ["tag", "v-ok"]);
  const r = c.push(["origin", "v-ok:refs/tags/v-ok", "v-ruim:refs/heads/alvo"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /commit enviado nao e o da pasta/);
  assert.equal(c.refRemota("refs/heads/alvo"), null);
  assert.equal(c.refRemota("refs/tags/v-ok"), null);
  assert.equal(c.execucoes().length, 0);
});

test("tag (leve e anotada) do HEAD enviada para refs/heads/ roda o comando e falha se o comando falhar", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  git0(c.trabalho, ["tag", "leve"]);
  git0(c.trabalho, ["tag", "-a", "anotada", "-m", "anotada"]);

  const falha = c.push(["origin", "anotada:refs/heads/alvo"], { saida: 1 });
  assert.notEqual(falha.status, 0);
  assert.equal(c.refRemota("refs/heads/alvo"), null);
  assert.equal(c.execucoes().length, 1);

  const ok = c.push(["origin", "leve:refs/heads/alvo"]);
  assert.equal(ok.status, 0, ok.texto);
  assert.equal(c.refRemota("refs/heads/alvo"), git0(c.trabalho, ["rev-parse", "HEAD"]));
  assert.equal(c.execucoes().length, 2);
});

test("branch enviado para refs/tags/ continua sem rodar nada", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["origin", "feat:refs/tags/v2"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.execucoes().length, 0);
});
