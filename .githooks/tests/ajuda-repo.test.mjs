import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mesmoCaminho } from "./ajuda-repo.mjs";

test("mesmoCaminho enxerga um link para a mesma pasta como igual e pastas distintas como diferentes", (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "caminho-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const alvo = path.join(base, "alvo");
  const outro = path.join(base, "outro");
  const link = path.join(base, "link");
  fs.mkdirSync(alvo);
  fs.mkdirSync(outro);
  fs.symlinkSync(alvo, link, "junction");
  assert.equal(mesmoCaminho(link, alvo), true);
  assert.equal(mesmoCaminho(alvo, link), true);
  assert.equal(mesmoCaminho(alvo, outro), false);
});
