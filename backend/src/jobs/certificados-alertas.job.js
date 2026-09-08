import cron from "node-cron";
import { varrearAlertasCertificados } from "../services/certificados-alertas.service.js";

async function executarVarredura() {
  console.log("[certificados-alertas.job] Iniciando varredura diária de vencimentos");
  try {
    const { alertados, erros } = await varrearAlertasCertificados();
    console.log(
      `[certificados-alertas.job] Concluído — ${alertados} alerta(s), ${erros} erro(s).`,
    );
  } catch (err) {
    console.error("[certificados-alertas.job] Falha na varredura:", err.message);
  }
}

export function iniciarJobAlertasCertificados() {
  // Diário às 06:00 UTC
  cron.schedule("0 6 * * *", executarVarredura, { timezone: "UTC" });
  console.log(
    "[certificados-alertas.job] Job de alertas de certificado registrado (todo dia às 06:00 UTC)",
  );
}
