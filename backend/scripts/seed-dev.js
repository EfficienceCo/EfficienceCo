/**
 * Dataset mínimo e idempotente para desenvolvimento e QA.
 *
 * Execute a partir de backend/:
 *   npm run seed:dev
 *   npm run seed:dev -- --dry-run
 *
 * Escritas remotas exigem SUPABASE_SERVICE_KEY e SEED_DEV_CONFIRM=SEED_DEV.
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

export const IDS_SEED_DEV = Object.freeze({
  cliente: "ca81be59-428b-43e2-bfbc-e28b7dce8a0a",
  clienteInterno: "00000000-0000-0000-0000-000000000000",
  adminEfficience: "a1111111-1111-1111-1111-111111111111",
  adminCliente: "b2222222-2222-2222-2222-222222222222",
  funcionario: "c3333333-3333-3333-3333-333333333333",
  licenca: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  lancamentoFiscal: "de000000-0000-0000-0000-000000000006",
});

export const CREDENCIAIS_SEED_DEV = Object.freeze({
  senha: "senha123",
  tokenLicenca: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  usuarios: [
    {
      id: IDS_SEED_DEV.adminEfficience,
      cliente_id: IDS_SEED_DEV.clienteInterno,
      nome: "Admin Efficience",
      email: "admin.efficience@teste.com",
      perfil: "admin_efficience",
    },
    {
      id: IDS_SEED_DEV.adminCliente,
      cliente_id: IDS_SEED_DEV.cliente,
      nome: "Admin Cliente",
      email: "admin.cliente@teste.com",
      perfil: "admin_cliente",
    },
    {
      id: IDS_SEED_DEV.funcionario,
      cliente_id: IDS_SEED_DEV.cliente,
      nome: "Funcionário Padrão",
      email: "funcionario@teste.com",
      perfil: "funcionario",
    },
  ],
});

function referenciaMes(agora, deslocamento) {
  const data = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + deslocamento, 1),
  );

  return { mes: data.getUTCMonth() + 1, ano: data.getUTCFullYear() };
}

export function validarConfiguracaoSeed(env = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("O seed de desenvolvimento não pode rodar com NODE_ENV=production.");
  }

  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL é obrigatória para executar o seed.");
  }

  try {
    new URL(env.SUPABASE_URL);
  } catch {
    throw new Error("SUPABASE_URL deve ser uma URL válida.");
  }

  if (!env.SUPABASE_SERVICE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_KEY é obrigatória; a chave pública não pode executar o seed.",
    );
  }

  if (env.SEED_DEV_CONFIRM !== "SEED_DEV") {
    throw new Error(
      "Defina SEED_DEV_CONFIRM=SEED_DEV para confirmar que o banco alvo é de desenvolvimento.",
    );
  }

  return {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_KEY,
  };
}

export async function criarDatasetSeed({
  agora = new Date(),
  gerarHash = (senha) => bcrypt.hash(senha, 10),
} = {}) {
  const historicoReceita = Array.from({ length: 12 }, (_, index) => ({
    ...referenciaMes(agora, index - 12),
    receita: 20_000,
  }));
  const senhaHash = await gerarHash(CREDENCIAIS_SEED_DEV.senha);
  const validadeLicenca = new Date(agora);
  validadeLicenca.setUTCFullYear(validadeLicenca.getUTCFullYear() + 1);
  const competenciaAtual = referenciaMes(agora, 0);
  const dataEmissao = `${competenciaAtual.ano}-${String(competenciaAtual.mes).padStart(2, "0")}-15`;

  return {
    clientes: [
      {
        id: IDS_SEED_DEV.clienteInterno,
        nome: "Efficience Interno",
        cnpj: "00000000001100",
        status: "ativo",
      },
      {
        id: IDS_SEED_DEV.cliente,
        nome: "Cliente Teste Dev",
        cnpj: "11111111000111",
        status: "ativo",
        regime_tributario: "simples_nacional",
        cnae: "6201501",
        anexo_simples: "I",
        historico_receita: historicoReceita,
      },
    ],
    usuarios: CREDENCIAIS_SEED_DEV.usuarios.map((usuario) => ({
      ...usuario,
      senha_hash: senhaHash,
    })),
    licencas: [
      {
        id: IDS_SEED_DEV.licenca,
        cliente_id: IDS_SEED_DEV.cliente,
        token: CREDENCIAIS_SEED_DEV.tokenLicenca,
        ativa: true,
        validade: validadeLicenca.toISOString(),
      },
    ],
    lancamentosFiscais: [
      {
        id: IDS_SEED_DEV.lancamentoFiscal,
        cliente_id: IDS_SEED_DEV.cliente,
        chave_nfe: "00000000000000000000000000000000000000000001",
        tipo: "saida",
        cnpj_emitente: "11111111000111",
        cnpj_destinatario: "00000000001100",
        valor_total: 20_000,
        icms: 0,
        pis: 0,
        cofins: 0,
        ipi: 0,
        data_emissao: dataEmissao,
      },
    ],
  };
}

async function upsert(supabase, tabela, dados) {
  const { error } = await supabase.from(tabela).upsert(dados, { onConflict: "id" });

  if (error) {
    throw new Error(`Falha ao semear ${tabela}: ${error.message}`);
  }
}

export async function executarSeed({ supabase, dataset, log = console.log }) {
  await upsert(supabase, "clientes", dataset.clientes);
  log(`[seed] clientes: ${dataset.clientes.length}`);

  await upsert(supabase, "usuarios", dataset.usuarios);
  log(`[seed] usuários: ${dataset.usuarios.length}`);

  await upsert(supabase, "licencas", dataset.licencas);
  log(`[seed] licenças: ${dataset.licencas.length}`);

  await upsert(supabase, "lancamentos_fiscais", dataset.lancamentosFiscais);
  log(`[seed] lançamentos fiscais: ${dataset.lancamentosFiscais.length}`);
}

function imprimirResumo({ dryRun = false } = {}) {
  const prefixo = dryRun ? "[seed] Dry-run válido" : "[seed] Concluído";
  console.log(`\n${prefixo}. Credenciais de desenvolvimento:`);
  for (const usuario of CREDENCIAIS_SEED_DEV.usuarios) {
    console.log(`  ${usuario.perfil}: ${usuario.email} / ${CREDENCIAIS_SEED_DEV.senha}`);
  }
  console.log(`  licença: ${CREDENCIAIS_SEED_DEV.tokenLicenca}`);
  console.log(`  cliente_id: ${IDS_SEED_DEV.cliente}`);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const dataset = await criarDatasetSeed();

  if (argv.includes("--dry-run")) {
    imprimirResumo({ dryRun: true });
    return;
  }

  const { supabaseUrl, serviceKey } = validarConfiguracaoSeed(env);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await executarSeed({ supabase, dataset });
  imprimirResumo();
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  main().catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exitCode = 1;
  });
}
