// Comando padrao do hook: sem PRE_PUSH_COMANDO (ou vazia) ele tem que rodar `npm test`, o mesmo do CI.
// Um `npm` falso na frente do PATH (so no env do git deste teste) registra os argumentos recebidos.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cenario, commitar, git, git0 } from "./ajuda-repo.mjs";

function instalarNpmFalso(base) {
  const pasta = path.join(base, "npm-falso");
  fs.mkdirSync(pasta);
  // Windows: o shell:true resolve `npm` via cmd.exe, que acha npm.cmd. Linux/macOS: um `npm` executavel em sh.
  fs.writeFileSync(path.join(pasta, "npm.cmd"), '@echo off\r\necho %*>> "%PRE_PUSH_REGISTRO%"\r\nexit /b 0\r\n');
  fs.writeFileSync(path.join(pasta, "npm"), '#!/bin/sh\necho "$*" >> "$PRE_PUSH_REGISTRO"\nexit 0\n', { mode: 0o755 });
  return pasta;
}

function pushSemComando(c, comando) {
  const pasta = instalarNpmFalso(c.base);
  const chave = Object.keys(process.env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const registro = path.join(c.base, "npm-chamadas.log");
  const env = {
    [chave]: `${pasta}${path.delimiter}${process.env[chave] ?? ""}`,
    PRE_PUSH_COMANDO: comando,
    PRE_PUSH_REGISTRO: registro,
  };
  const r = git(c.trabalho, ["push", "origin", "feat"], env);
  const chamadas = fs.existsSync(registro) ? fs.readFileSync(registro, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  return { r, chamadas };
}

for (const [nome, comando] of [["indefinida", undefined], ["vazia", ""]]) {
  test(`PRE_PUSH_COMANDO ${nome}: o hook roda \`npm test\``, (t) => {
    const c = cenario(t);
    git0(c.trabalho, ["switch", "-q", "-c", "feat"]);
    const sha = commitar(c.trabalho, "backend/a.js", "a2\n");
    const { r, chamadas } = pushSemComando(c, comando);
    assert.equal(r.status, 0, r.texto);
    assert.match(r.texto, /Rodando "npm test"/);
    assert.deepEqual(chamadas, ["test"]);
    assert.equal(c.refRemota("refs/heads/feat"), sha);
  });
}
