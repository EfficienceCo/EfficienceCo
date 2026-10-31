// O hook e opcional: instalar dependencias nao pode ativa-lo (Railway, Vercel e CI rodam npm install).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ciclo = ["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare"];

function pacote(...partes) {
  return JSON.parse(fs.readFileSync(path.join(raiz, ...partes, "package.json"), "utf8"));
}

test("nenhum package.json do projeto ativa o hook no install/prepare", () => {
  for (const pasta of [[], ["backend"], ["frontend"]]) {
    const scripts = pacote(...pasta).scripts ?? {};
    for (const nome of ciclo) {
      assert.doesNotMatch(scripts[nome] ?? "", /hooksPath|githooks|hooks:install/i, `${[...pasta, "package.json"].join("/")} -> ${nome}`);
    }
  }
});

test("a raiz nao tem script prepare/postinstall/install (nem husky)", () => {
  const { scripts, dependencies = {}, devDependencies = {} } = pacote();
  for (const nome of ciclo) assert.equal(scripts[nome], undefined, nome);
  assert.equal(dependencies.husky ?? devDependencies.husky, undefined);
});

test("hooks:install e um unico git config e test:hooks existe", () => {
  const { scripts } = pacote();
  assert.equal(scripts["hooks:install"], "git config core.hooksPath .githooks");
  assert.match(scripts["test:hooks"], /\.githooks\/tests\//);
});

test("npm test (o que o hook e o CI rodam) executa os testes do hook antes do executor", () => {
  const { scripts } = pacote();
  const passos = scripts.test.split("&&").map((p) => p.trim());
  assert.equal(passos[0], "npm run test:hooks");
  assert.match(passos[1], /scripts\/teste-678\/executar\.mjs/);
});

test(".githooks/pre-push usa LF, tem shebang sh e e executavel no git", () => {
  const conteudo = fs.readFileSync(path.join(raiz, ".githooks", "pre-push"), "utf8");
  assert.ok(conteudo.startsWith("#!/bin/sh\n"));
  assert.ok(!conteudo.includes("\r"));
  const indice = spawnSync("git", ["ls-files", "-s", ".githooks/pre-push"], { cwd: raiz, encoding: "utf8" }).stdout;
  assert.match(indice, /^100755 /);
});

test(".gitattributes forca LF em .githooks/", () => {
  const atributos = fs.readFileSync(path.join(raiz, ".gitattributes"), "utf8");
  assert.match(atributos, /^\.githooks\/\*\*\s+text\s+eol=lf$/m);
});

test("README tem a secao 'Testes antes de cada push' e cita hooks:install", () => {
  const readme = fs.readFileSync(path.join(raiz, "README.md"), "utf8");
  const secao = readme.split(/^## /m).find((s) => s.startsWith("Testes antes de cada push"));
  assert.ok(secao, 'secao "Testes antes de cada push" ausente');
  assert.match(secao, /hooks:install/);
});
