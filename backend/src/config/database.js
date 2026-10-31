// Conexão com Supabase (SEG-1 #666).
//
// Dentro de uma requisição autenticada, `supabase` (export default) fala com o
// banco com o token do usuário, então o RLS vale de verdade. Fora de requisição
// (login, jobs, rotas do agente por x-licenca-token) cai no client de serviço.
// shortcut: rotas do agente ainda usam a service key, tirar na fase 3 da #666.
import { servicoDb, contextoDb } from "./db-usuario.js";

export { servicoDb };

const sobrescritas = new Map(); // permite aos testes trocar supabase.from = ...

const supabase = new Proxy(servicoDb, {
  get(_alvo, prop) {
    if (sobrescritas.has(prop)) return sobrescritas.get(prop);
    // Storage mantém o acesso de serviço até as policies de bucket da fase 3.
    if (prop === "storage") return servicoDb.storage;
    const atual = contextoDb.getStore() ?? servicoDb;
    const valor = atual[prop];
    return typeof valor === "function" ? valor.bind(atual) : valor;
  },
  set(_alvo, prop, valor) {
    sobrescritas.set(prop, valor);
    return true;
  },
});

export default supabase;
