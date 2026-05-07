// Conexão com Supabase
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_KEY } = process.env;
const supabaseKey = SUPABASE_SERVICE_KEY || SUPABASE_KEY;

if (!SUPABASE_URL || !supabaseKey) {
  console.error(
    "[database] Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias.",
  );
  throw new Error(
    "Configuração do Supabase ausente: defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env",
  );
}

const supabase = createClient(SUPABASE_URL, supabaseKey);

export default supabase;
