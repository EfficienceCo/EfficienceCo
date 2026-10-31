// O hook rodando de verdade: git push real para um bare temporario, com comando de teste falso.
// Aqui: falha cancela, sucesso envia, pasta suja recusa, --no-verify pula.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { cenario, commitar, escrever, git0, mesmoCaminho } from "./ajuda-repo.mjs";

test("teste que falha cancela o push e o remoto nao muda", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["origin", "feat"], { saida: 1 });
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Push cancelado/);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, 1);
});

test("teste que passa deixa o push seguir, rodando na raiz do clone", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  const sha = commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["origin", "feat"]);
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.refRemota("refs/heads/feat"), sha);
  assert.match(r.texto, /Testes passaram em/);
  assert.equal(c.execucoes().length, 1);
  assert.ok(mesmoCaminho(c.execucoes()[0], c.trabalho));
});

test("push disparado de um subdiretorio roda o comando na raiz do clone", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  const sha = commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["origin", "feat"], { cwd: path.join(c.trabalho, "backend") });
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.refRemota("refs/heads/feat"), sha);
  assert.equal(c.execucoes().length, 1);
  assert.ok(mesmoCaminho(c.execucoes()[0], c.trabalho), c.execucoes()[0]);
});

test("alteracao nao commitada recusa o push e lista os arquivos (rastreado e nao rastreado)", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  escrever(c.trabalho, "backend/a.js", "a3\n");
  escrever(c.trabalho, "backend/novo.test.js", "x\n");
  const r = c.push(["origin", "feat"]);
  assert.notEqual(r.status, 0);
  assert.match(r.texto, /Push recusado/);
  assert.match(r.texto, /backend\/a\.js/);
  assert.match(r.texto, /backend\/novo\.test\.js/);
  assert.equal(c.refRemota("refs/heads/feat"), null);
  assert.equal(c.execucoes().length, 0);
});

test("git push --no-verify pula o hook", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  const sha = commitar(c.trabalho, "backend/a.js", "a2\n");
  escrever(c.trabalho, "sujeira.txt", "x\n");
  const r = c.push(["--no-verify", "origin", "feat"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.refRemota("refs/heads/feat"), sha);
  assert.equal(c.execucoes().length, 0);
});

test("sem core.hooksPath o hook nao existe: nada roda", (t) => {
  const c = cenario(t);
  git0(c.trabalho, ["config", "--unset", "core.hooksPath"]);
  git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
  commitar(c.trabalho, "backend/a.js", "a2\n");
  const r = c.push(["origin", "feat"], { saida: 1 });
  assert.equal(r.status, 0, r.texto);
  assert.equal(c.execucoes().length, 0);
});
