import cron from "node-cron";
import { varrearAlertasObrigacoes } from "../services/obrigacoes-alertas.service.js";

async function executarVarredura() {
  console.log("[obrigacoes-alertas.job] Iniciando varredura diária de vencimentos");
  try {
    const { alertados, erros } = await varrearAlertasObrigacoes();
    console.log(
      `[obrigacoes-alertas.job] Concluído — ${alertados} alerta(s), ${erros} erro(s).`,
    );
  } catch (err) {
    console.error("[obrigacoes-alertas.job] Falha na varredura:", err.message);
  }
}

export function iniciarJobAlertasObrigacoes() {
  // Diário às 06:10 UTC — 10 min depois dos certificados, para não competir
  // pela mesma janela de conexões do Supabase.
  cron.schedule("10 6 * * *", executarVarredura, { timezone: "UTC" });
  console.log(
    "[obrigacoes-alertas.job] Job de alertas de obrigação registrado (todo dia às 06:10 UTC)",
  );
}
