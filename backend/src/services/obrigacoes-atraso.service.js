import supabasePadrao from "../config/database.js";
import { hojeNoBrasil } from "../utils/periodo.util.js";

/**
 * Bug #505 — promove obrigações vencidas de `pendente` para `atrasada`.
 *
 * Até aqui nenhuma rotina escrevia `status = 'atrasada'`: o filtro
 * Status=Atrasada do Calendário Fiscal comparava contra uma coluna que nunca
 * recebia esse valor, e o card "Total atrasadas" (que lê o mesmo status) ficava
 * em 0. Esta varredura é a única fonte de verdade do atraso persistido.
 *
 * Idempotente: só toca linhas ainda `pendente` com vencimento anterior a hoje,
 * então rodar duas vezes no mesmo dia não muda nada. Obrigações `concluida`
 * nunca são tocadas — entregar em atraso não reabre o prazo.
 *
 * @returns {Promise<{ promovidas: number, erros: number }>}
 */
export async function promoverObrigacoesAtrasadas({
  supabase = supabasePadrao,
  agora = new Date(),
} = {}) {
  const hoje = hojeNoBrasil(agora);

  const { data, error } = await supabase
    .from("obrigacoes")
    .update({ status: "atrasada" })
    .eq("status", "pendente")
    .lt("data_vencimento", hoje)
    .select("id");

  if (error) {
    console.error(
      "[obrigacoes-atraso.service] Erro ao promover obrigações atrasadas:",
      error.message,
    );
    return { promovidas: 0, erros: 1 };
  }

  return { promovidas: data?.length ?? 0, erros: 0 };
}
