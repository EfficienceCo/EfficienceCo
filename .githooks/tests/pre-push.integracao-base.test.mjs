// O hook rodando de verdade: git push real para um bare temporario, com comando de teste falso.
// Aqui: contra o que o push e comparado (origin/main, outro branch, sha remoto desconhecido).
import test from "node:test";
import assert from "node:assert/strict";
import { cenario, commitar, git, git0 } from "./ajuda-repo.mjs";

test("branch novo e comparado com origin/main, nao so com o ultimo commit", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat-codigo-e-doc"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  commitar(c.trabalho, "README.md", "# depois\n");
  const r = c.push(["origin", "feat-codigo-e-doc"]);
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.execucoes().length, 1);

  git0(c.trabalho, ["switch", "-q", "main"]);
  git0(c.trabalho, ["switch", "-q", "-c", "feat-so-doc"]);
  commitar(c.trabalho, "docs/a.md", "a\n");
  commitar(c.trabalho, "README.md", "# outra\n");
  const r2 = c.push(["origin", "feat-so-doc"], { saida: 1 });
  assert.equal(r2.status, 0, r2.texto);
  assert.equal(c.execucoes().length, 1);
});

test("branch novo sem origin/main avisa com clareza e roda tudo, ate se for so docs", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "README.md", "# x\n");
  git0(c.trabalho, ["update-ref", "-d", "refs/remotes/origin/main"]);
  const r = c.push(["origin", "feat"]);
  assert.equal(r.status, 0, r.texto);
  assert.match(r.texto, /origin\/main nao existe/);
  assert.equal(c.execucoes().length, 1);
});

test("estando em feat-bom, empurrar feat-ruim e recusado (os testes nao rodam no branch errado)", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat-ruim"]);
  commitar(c.trabalho, "backend/a.js", "quebrado\n");
  git0(c.trabalho, ["switch", "-q", "main"]);
  git0(c.trabalho, ["switch", "-q", "-c", "feat-bom"]);
  commitar(c.trabalho, "backend/b.js", "bom\n");
  // O comando "passaria": e exatamente o defeito que o hook nao pode ter.
  const r = c.push(["origin", "feat-ruim"], { saida: 0 });
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Push recusado/);
  assert.match(r.texto, /git switch feat-ruim/);
  assert.equal(c.refRemota("refs/heads/feat-ruim"), null);
  assert.equal(c.execucoes().length, 0);
});

test("force push com sha remoto que nao existe aqui: mensagem clara, sem 'bad object'", (t) => {
  const c = cenario(t);
  const outro = c.clonarOutro();
  git0(outro, ["switch", "-q", "-c", "feat"]);
  const shaRemoto = commitar(outro, "backend/z.js", "z\n");
  assert.equal(git(outro, ["push", "-q", "origin", "feat"]).status, 0);

  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  const shaLocal = commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["--force", "origin", "feat"]);
  assert.equal(r.status, 0, r.texto);
  assert.doesNotMatch(r.texto, /bad object|fatal/i);
  assert.match(r.texto, /nao existe neste clone/);
  assert.match(r.texto, /git fetch/);
  assert.ok(r.texto.includes(shaRemoto.slice(0, 7)));
  assert.equal(c.execucoes().length, 1, "na duvida, roda");
  assert.equal(c.refRemota("refs/heads/feat"), shaLocal);
});

test("force push com sha remoto desconhecido nao pula, mesmo que o commit local seja so docs", (t) => {
  const c = cenario(t);
  const outro = c.clonarOutro();
  git0(outro, ["switch", "-q", "-c", "feat"]);
  const shaRemoto = commitar(outro, "backend/z.js", "z\n");
  git0(outro, ["push", "-q", "origin", "feat"]);

  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "README.md", "# so docs\n");
  const r = c.push(["--force", "origin", "feat"], { saida: 1 });
  assert.notEqual(r.status, 0);
  assert.equal(c.execucoes().length, 1);
  assert.equal(c.refRemota("refs/heads/feat"), shaRemoto);
});
