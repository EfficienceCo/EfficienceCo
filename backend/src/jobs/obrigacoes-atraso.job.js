import cron from "node-cron";
import { promoverObrigacoesAtrasadas } from "../services/obrigacoes-atraso.service.js";

async function executarVarredura() {
  console.log("[obrigacoes-atraso.job] Iniciando varredura diária de obrigações vencidas");
  try {
    const { promovidas, erros } = await promoverObrigacoesAtrasadas();
    console.log(
      `[obrigacoes-atraso.job] Concluído — ${promovidas} obrigação(ões) marcada(s) como atrasada(s), ${erros} erro(s).`,
    );
  } catch (err) {
    console.error("[obrigacoes-atraso.job] Falha na varredura:", err.message);
  }
}

export function iniciarJobObrigacoesAtrasadas() {
  // Logo depois da virada do dia em Brasília: o prazo é contado em dia útil
  // brasileiro, então a obrigação já aparece atrasada na primeira hora do dia
  // seguinte ao vencimento (e não só às 03:00, se o cron fosse em UTC).
  cron.schedule("10 0 * * *", executarVarredura, { timezone: "America/Sao_Paulo" });
  console.log(
    "[obrigacoes-atraso.job] Job de obrigações atrasadas registrado (todo dia às 00:10 America/Sao_Paulo)",
  );
}
