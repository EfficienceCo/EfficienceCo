import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CREDENCIAIS_SEED_DEV,
  criarDatasetSeed,
  executarSeed,
  validarConfiguracaoSeed,
} from "../scripts/seed-dev.js";

function criarSupabaseFake(erros = {}) {
  const chamadas = [];

  return {
    chamadas,
    cliente: {
      from(tabela) {
        return {
          async upsert(dados, opcoes) {
            chamadas.push({ tabela, dados, opcoes });
            return { error: erros[tabela] ?? null };
          },
        };
      },
    },
  };
}

describe("seed de desenvolvimento", () => {
  // PRB-AP-21 / #504 — `npm run seed:dev` apontava para um script inexistente.
  it("PRB-AP-21: o script npm seed:dev aponta para um arquivo que existe", () => {
    const raizBackend = resolve(fileURLToPath(import.meta.url), "..", "..");
    const pacote = JSON.parse(readFileSync(resolve(raizBackend, "package.json"), "utf8"));
    const comando = pacote.scripts["seed:dev"];

    assert.ok(comando, "package.json precisa declarar o script seed:dev");
    const alvo = comando.match(/^node\s+(\S+\.js)$/)?.[1];
    assert.ok(alvo, `seed:dev deve ser "node <arquivo>.js", veio: ${comando}`);
    assert.ok(existsSync(resolve(raizBackend, alvo)), `${alvo} não existe`);
  });

  it("exige service role, confirmação explícita e bloqueia produção", () => {
    assert.throws(
      () => validarConfiguracaoSeed({ NODE_ENV: "production" }),
      /NODE_ENV=production/,
    );
    assert.throws(
      () => validarConfiguracaoSeed({ SUPABASE_URL: "https://dev.supabase.co" }),
      /SUPABASE_SERVICE_KEY/,
    );
    assert.throws(
      () =>
        validarConfiguracaoSeed({
          SUPABASE_URL: "https://dev.supabase.co",
          SUPABASE_SERVICE_KEY: "service-role",
        }),
      /SEED_DEV_CONFIRM=SEED_DEV/,
    );

    assert.deepEqual(
      validarConfiguracaoSeed({
        SUPABASE_URL: "https://dev.supabase.co",
        SUPABASE_SERVICE_KEY: "service-role",
        SEED_DEV_CONFIRM: "SEED_DEV",
      }),
      {
        supabaseUrl: "https://dev.supabase.co",
        serviceKey: "service-role",
      },
    );
  });

  it("monta dados atuais para login e apuração sem expor senha em texto puro", async () => {
    const dataset = await criarDatasetSeed({
      agora: new Date("2026-09-20T12:00:00.000Z"),
      gerarHash: async (senha) => `hash:${senha}`,
    });
    const cliente = dataset.clientes.find(
      (item) => item.nome === "Cliente Teste Dev",
    );

    assert.equal(cliente.historico_receita.length, 12);
    assert.deepEqual(cliente.historico_receita[0], {
      mes: 9,
      ano: 2025,
      receita: 20_000,
    });
    assert.deepEqual(cliente.historico_receita.at(-1), {
      mes: 8,
      ano: 2026,
      receita: 20_000,
    });
    assert.equal(dataset.lancamentosFiscais[0].data_emissao, "2026-09-15");
    assert.equal(dataset.usuarios.length, CREDENCIAIS_SEED_DEV.usuarios.length);
    assert.ok(dataset.usuarios.every((usuario) => usuario.senha_hash === "hash:senha123"));
    assert.ok(dataset.usuarios.every((usuario) => !("senha" in usuario)));
  });

  it("faz upsert idempotente das tabelas na ordem das dependências", async () => {
    const { cliente, chamadas } = criarSupabaseFake();
    const dataset = await criarDatasetSeed({
      gerarHash: async () => "hash",
    });

    await executarSeed({ supabase: cliente, dataset, log: () => {} });

    assert.deepEqual(
      chamadas.map(({ tabela }) => tabela),
      ["clientes", "usuarios", "licencas", "lancamentos_fiscais"],
    );
    assert.ok(chamadas.every(({ opcoes }) => opcoes.onConflict === "id"));
  });

  it("interrompe no primeiro erro do Supabase com contexto da tabela", async () => {
    const { cliente, chamadas } = criarSupabaseFake({
      usuarios: { message: "constraint violada" },
    });
    const dataset = await criarDatasetSeed({ gerarHash: async () => "hash" });

    await assert.rejects(
      executarSeed({ supabase: cliente, dataset, log: () => {} }),
      /Falha ao semear usuarios: constraint violada/,
    );
    assert.deepEqual(
      chamadas.map(({ tabela }) => tabela),
      ["clientes", "usuarios"],
    );
  });
});
