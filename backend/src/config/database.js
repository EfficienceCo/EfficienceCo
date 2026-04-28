// Conexão com Supabase
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "[database] Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias.",
  );
  throw new Error(
    "Configuração do Supabase ausente: defina SUPABASE_URL e SUPABASE_KEY no .env",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
