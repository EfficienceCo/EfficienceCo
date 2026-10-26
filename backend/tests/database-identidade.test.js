import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.SUPABASE_KEY = "anon-key-de-teste";
process.env.SUPABASE_JWT_SECRET = "segredo-supabase-de-teste";

const { default: supabase, servicoDb } = await import("../src/config/database.js");
const { emitirTokenSupabase, executarComDbDoUsuario } = await import("../src/config/db-usuario.js");

const usuario = { id: "u1", cliente_id: "c1", perfil: "admin_cliente" };

describe("identidade do usuário no banco (SEG-1 #666)", () => {
  it("o token do Supabase leva usuário, escritório e perfil e expira em minutos", () => {
    const t = jwt.verify(emitirTokenSupabase(usuario), process.env.SUPABASE_JWT_SECRET);
    assert.equal(t.role, "authenticated");
    assert.equal(t.sub, "u1");
    assert.equal(t.cliente_id, "c1");
    assert.equal(t.perfil, "admin_cliente");
    assert.ok(t.exp - t.iat <= 300);
  });

  it("dentro da requisição o client é o do usuário, inclusive após await; fora dela é o de serviço", async () => {
    assert.equal(supabase.rest, servicoDb.rest);
    const dentro = await executarComDbDoUsuario(usuario, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return supabase.rest;
    });
    assert.notEqual(dentro, servicoDb.rest);
    assert.equal(supabase.rest, servicoDb.rest);
  });

  it("requisições simultâneas não misturam identidades", async () => {
    const pegar = (u) =>
      executarComDbDoUsuario(u, async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        return supabase.rest;
      });
    const [a, b] = await Promise.all([pegar(usuario), pegar({ ...usuario, cliente_id: "c2" })]);
    assert.notEqual(a, b);
  });
});
