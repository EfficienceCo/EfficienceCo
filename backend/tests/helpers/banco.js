import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { PERFIS } from "../../src/config/perfis.js";

// Falha antes de criar o cliente se não estivermos no ambiente da #678.
export function validarBancoDescartavel() {
  const env = process.env;
  const porta = Number(env.TEST_SUPABASE_PORT);
  const url = `http://127.0.0.1:${porta}`;
  if (
    env.NODE_ENV !== "test" ||
    !/^efficience-testes-678-[a-f0-9]{12}$/.test(env.TEST_SUPABASE_PROJECT_ID ?? "") ||
    !Number.isInteger(porta) || porta < 1 || porta > 65535 ||
    env.TEST_SUPABASE_URL !== url || env.SUPABASE_URL !== url ||
    !env.TEST_SUPABASE_SERVICE_KEY ||
    env.SUPABASE_SERVICE_KEY !== env.TEST_SUPABASE_SERVICE_KEY
  ) {
    throw new Error("Destino de teste inválido. Use npm test na raiz com o banco descartável da #678.");
  }
  return { url, chave: env.TEST_SUPABASE_SERVICE_KEY };
}

function conectarBanco() {
  const { url, chave } = validarBancoDescartavel();
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (entrada, opcoes) => fetch(entrada, {
      ...opcoes, signal: AbortSignal.timeout(10_000), redirect: "error",
    }) },
  });
}

// Limpa as tabelas da aplicação, inclusive dados criados pelas rotas HTTP.
// A função SQL existe apenas no banco temporário preparado pelo executor.
export async function resetarBanco() {
  const banco = conectarBanco();
  const { error } = await banco.rpc("__teste_679_resetar_banco");
  if (error) throw new Error(`Falha no reset do banco descartável: ${error.message}`);
}

// Cada chamada cria seu próprio registro de dados: não há lista global compartilhada.
export function criarCenarioBanco() {
  const banco = conectarBanco();
  const criados = { clientes: new Set(), usuarios: new Set(), funcionarios: new Set() };
  let encerrado = false;

  async function inserir(tabela, campos, colunas = "*") {
    if (encerrado) throw new Error("Cenário encerrado; crie outro antes de inserir dados.");
    const id = randomUUID();
    // Registrar antes do INSERT permite limpar mesmo se a resposta de leitura falhar.
    criados[tabela].add(id);
    const { data, error } = await banco.from(tabela).insert({ ...campos, id }).select(colunas).single();
    if (error) throw new Error(`Erro preparando ${tabela}: ${error.message}`);
    return data;
  }

  function validarClienteDoCenario(clienteId) {
    if (!criados.clientes.has(clienteId)) {
      throw new Error("Use um cliente criado neste cenário.");
    }
  }

  return {
    banco,

    criarCliente({ nome = "Cliente sintético #679" } = {}) {
      return inserir("clientes", { nome });
    },

    criarUsuario({ clienteId, perfil = PERFIS.ADMIN_CLIENTE } = {}) {
      validarClienteDoCenario(clienteId);
      if (!Object.values(PERFIS).includes(perfil)) throw new Error("Perfil de teste inválido.");
      return inserir("usuarios", {
        cliente_id: clienteId,
        nome: "Usuário sintético #679",
        email: `teste-679-${randomUUID()}@example.invalid`,
        senha_hash: bcrypt.hashSync("senha-sintetica-exclusiva-679", 4),
        perfil,
      }, "id,cliente_id,nome,email,perfil");
    },

    criarFuncionario({ clienteId, nome = "Funcionário sintético #679" } = {}) {
      validarClienteDoCenario(clienteId);
      return inserir("funcionarios", {
        cliente_id: clienteId,
        nome,
        cpf: "12345678909",
        data_admissao: "2026-01-05",
        categoria: "101",
        salario: 2000,
      });
    },

    async limpar() {
      encerrado = true;
      const erros = [];
      // Filhos antes dos pais para respeitar as chaves estrangeiras.
      for (const tabela of ["funcionarios", "usuarios", "clientes"]) {
        if (!criados[tabela].size) continue;
        const { error } = await banco.from(tabela).delete().in("id", [...criados[tabela]]);
        if (error) erros.push(new Error(`Erro limpando ${tabela}: ${error.message}`));
        else criados[tabela].clear();
      }
      if (erros.length) throw new AggregateError(erros, "Não foi possível limpar todo o cenário.");
    },
  };
}
