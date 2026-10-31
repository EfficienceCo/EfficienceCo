// Um teste pequeno da infraestrutura: escreve, le e apaga no banco REAL local.
// Nao substitui os testes de isolamento/permissao das proximas issues.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

test("#678: grava e consulta um cliente no banco descartavel", { timeout: 30_000 }, async () => {
  // Tudo isto acontece ANTES de criar o cliente ou enviar uma requisicao.
  assert.match(process.env.TEST_SUPABASE_PROJECT_ID ?? "", /^efficience-testes-678-/);
  assert.match(process.env.TEST_SUPABASE_PORT ?? "", /^\d+$/);
  const esperado = `http://127.0.0.1:${process.env.TEST_SUPABASE_PORT}`;
  assert.equal(process.env.TEST_SUPABASE_URL, esperado, "Destino diferente do banco de teste.");
  assert.ok(process.env.TEST_SUPABASE_SERVICE_KEY, "Chave local de teste ausente.");

  const banco = createClient(esperado, process.env.TEST_SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (entrada, opcoes) => fetch(entrada, { ...opcoes, signal: AbortSignal.timeout(10_000) }) },
  });
  const id = randomUUID();
  const nome = "Escritorio sintetico da infraestrutura #678";
  const { error: erroInsercao } = await banco.from("clientes").insert({ id, nome });
  assert.equal(erroInsercao, null, erroInsercao?.message);
  try {
    const { data, error } = await banco.from("clientes").select("id,nome").eq("id", id).single();
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, { id, nome });
  } finally {
    const { error } = await banco.from("clientes").delete().eq("id", id);
    assert.equal(error, null, error?.message);
  }
  // Confere tambem que a remocao teve efeito.
  const { data, error } = await banco.from("clientes").select("id").eq("id", id);
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, []);
});
