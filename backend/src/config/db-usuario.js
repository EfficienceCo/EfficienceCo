// Identidade do usuário no banco (SEG-1 #666). Usado por database.js e pelo auth.middleware.
//
// Dentro de uma requisição autenticada, `supabase` (export default) fala com o
// banco com o token do usuário, então o RLS vale de verdade. Fora de requisição
// (login, jobs, rotas do agente por x-licenca-token) cai no client de serviço.
// shortcut: rotas do agente ainda usam a service key, tirar na fase 3 da #666.
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_KEY, SUPABASE_JWT_SECRET } = process.env;
const supabaseKey = SUPABASE_SERVICE_KEY || SUPABASE_KEY;

if (!SUPABASE_URL || !supabaseKey) {
  console.error(
    "[database] Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias.",
  );
  throw new Error(
    "Configuração do Supabase ausente: defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env",
  );
}

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
export const servicoDb = createClient(SUPABASE_URL, supabaseKey, opcoes);

const TTL_TOKEN_SEGUNDOS = 300;
export const contextoDb = new AsyncLocalStorage();

export function emitirTokenSupabase(usuario) {
  return jwt.sign(
    {
      role: "authenticated",
      aud: "authenticated",
      sub: usuario.id,
      cliente_id: usuario.cliente_id ?? null,
      perfil: usuario.perfil,
    },
    SUPABASE_JWT_SECRET,
    { expiresIn: TTL_TOKEN_SEGUNDOS },
  );
}

// Cria o client que age com a identidade do usuário (token aceito pelo Supabase).
// Configuração incompleta nunca pode promover uma requisição à service key.
export function criarDbDoUsuario(usuario) {
  if (!SUPABASE_JWT_SECRET || !SUPABASE_KEY) {
    throw new Error("Configure SUPABASE_JWT_SECRET e SUPABASE_KEY para o acesso com RLS");
  }

  const token = emitirTokenSupabase(usuario);

  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    ...opcoes,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// Executa `fn` com o client do usuário valendo para todo o resto da requisição.
export function executarComDbDoUsuario(usuario, fn) {
  return contextoDb.run(criarDbDoUsuario(usuario), fn);
}

