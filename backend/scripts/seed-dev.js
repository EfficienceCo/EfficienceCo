/**
 * seed-dev.js — Inicializa o banco com dados mínimos para rodar o projeto do zero.
 *
 * Execução (a partir de backend/):
 *   npm run seed:dev
 *
 * Requer:
 *   - backend/.env com SUPABASE_URL e SUPABASE_SERVICE_KEY
 *   - Node.js 18+
 *
 * Idempotente: rodar duas vezes não duplica dados.
 *
 * ATENÇÃO: o script roda contra o banco configurado no .env.
 * Enquanto não houver separação dev/prod, confirme que está
 * apontando para o banco certo antes de executar.
 *
 * As credenciais geradas são exibidas no terminal ao final da execução.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

// UUIDs fixos — garante idempotência por PK
const IDS = {
  cliente:         "de000000-0000-0000-0000-000000000001",
  adminEfficience: "de000000-0000-0000-0000-000000000002",
  adminCliente:    "de000000-0000-0000-0000-000000000003",
  funcionario:     "de000000-0000-0000-0000-000000000004",
  licenca:         "de000000-0000-0000-0000-000000000005",
};

const TOKEN_DEV = "dev-token-efficience-2024";

const USUARIOS = [
  {
    id: IDS.adminEfficience,
    nome: "Admin Efficience",
    email: "admin@efficience.dev",
    senha: "admin123",
    perfil: "admin_efficience",
  },
  {
    id: IDS.adminCliente,
    nome: "Admin Cliente",
    email: "admin@escritorio.dev",
    senha: "admin123",
    perfil: "admin_cliente",
  },
  {
    id: IDS.funcionario,
    nome: "Funcionário Dev",
    email: "func@escritorio.dev",
    senha: "func123",
    perfil: "funcionario",
  },
];

async function seed() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_KEY } = process.env;
  const supabaseKey = SUPABASE_SERVICE_KEY || SUPABASE_KEY;

  if (!SUPABASE_URL || !supabaseKey) {
    console.error("[seed] SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios no .env");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, supabaseKey);

  console.log("[seed] Iniciando seed de dev...\n");

  // 1. Cliente
  const { error: erroCliente } = await supabase
    .from("clientes")
    .upsert(
      {
        id: IDS.cliente,
        nome: "Escritório de Dev Ltda",
        cnpj: "00.000.000/0001-99",
        status: "ativo",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (erroCliente) {
    console.error("[seed] Erro ao criar cliente:", erroCliente.message);
    process.exit(1);
  }
  console.log("✓ Cliente — Escritório de Dev Ltda");

  // 2. Usuários
  for (const u of USUARIOS) {
    const senha_hash = await bcrypt.hash(u.senha, 10);

    const { error } = await supabase
      .from("usuarios")
      .upsert(
        {
          id: u.id,
          cliente_id: IDS.cliente,
          nome: u.nome,
          email: u.email,
          senha_hash,
          perfil: u.perfil,
        },
        { onConflict: "id,cliente_id", ignoreDuplicates: true }
      );

    if (error) {
      console.error(`[seed] Erro ao criar usuário ${u.email}:`, error.message);
      process.exit(1);
    }
    console.log(`✓ Usuário [${u.perfil}] — ${u.email}`);
  }

  // 3. Licença
  const validade = new Date();
  validade.setFullYear(validade.getFullYear() + 1);

  const { error: erroLicenca } = await supabase
    .from("licencas")
    .upsert(
      {
        id: IDS.licenca,
        cliente_id: IDS.cliente,
        token: TOKEN_DEV,
        ativa: true,
        validade: validade.toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (erroLicenca) {
    console.error("[seed] Erro ao criar licença:", erroLicenca.message);
    process.exit(1);
  }
  console.log("✓ Licença ativa — token: " + TOKEN_DEV);

  // Resumo
  console.log(`
╔══════════════════════════════════════════════════════════╗
║              CREDENCIAIS DE DESENVOLVIMENTO              ║
╠══════════════════════════════════════════════════════════╣
║  POST /auth/login  { "email": "...", "senha": "..." }    ║
╠══════════════════╦═══════════════════════╦═══════════════╣
║ Perfil           ║ Email                 ║ Senha         ║
╠══════════════════╬═══════════════════════╬═══════════════╣
║ admin_efficience ║ admin@efficience.dev  ║ admin123      ║
║ admin_cliente    ║ admin@escritorio.dev  ║ admin123      ║
║ funcionario      ║ func@escritorio.dev   ║ func123       ║
╠══════════════════╩═══════════════════════╩═══════════════╣
║  Token licença : dev-token-efficience-2024               ║
║  Cliente ID    : de000000-0000-0000-0000-000000000001    ║
╠══════════════════════════════════════════════════════════╣
║  agente/.env                                             ║
║    LICENSE_TOKEN=dev-token-efficience-2024               ║
║    CLIENTE_ID=de000000-0000-0000-0000-000000000001       ║
║    API_URL=http://localhost:3001                          ║
╚══════════════════════════════════════════════════════════╝
`);
}

seed();
