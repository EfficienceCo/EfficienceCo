import supabase from "../config/database.js";

export async function criarNotificacao(cliente_id, tipo, mensagem) {
  const { error } = await supabase
    .from("notificacoes")
    .insert({ cliente_id, tipo, mensagem });

  if (error) {
    console.error("[notificacoes.service] Erro ao criar notificação:", error.message);
  }
}
