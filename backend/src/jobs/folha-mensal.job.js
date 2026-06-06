import cron from "node-cron";
import supabase from "../config/database.js";
import { criarProcessoComEtapas } from "../services/processos.service.js";

async function gerarFolhaMensal() {
  const agora = new Date();
  const mesReferencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;

  console.log(`[folha-mensal.job] Iniciando geração para mês ${mesReferencia}`);

  const { data: clientes, error: erroClientes } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("status", "ativo");

  if (erroClientes) {
    console.error("[folha-mensal.job] Erro ao buscar clientes:", erroClientes.message);
    return;
  }

  const { data: jaExistentes, error: erroExistentes } = await supabase
    .from("processos")
    .select("cliente_id")
    .eq("tipo", "folha_pagamento")
    .eq("mes_referencia", mesReferencia);

  if (erroExistentes) {
    console.error("[folha-mensal.job] Erro ao checar processos existentes:", erroExistentes.message);
    return;
  }

  const clientesComProcesso = new Set(jaExistentes.map((p) => p.cliente_id));

  const clientesSemProcesso = clientes.filter((c) => !clientesComProcesso.has(c.id));

  let criados = 0;
  let erros = 0;

  for (const cliente of clientesSemProcesso) {
    const resultado = await criarProcessoComEtapas(cliente.id, "folha_pagamento", { mes_referencia: mesReferencia });
    if (resultado.erro) {
      console.error(`[folha-mensal.job] Erro ao criar processo para cliente ${cliente.nome}:`, resultado.erro);
      erros++;
    } else {
      criados++;
    }
  }

  console.log(
    `[folha-mensal.job] Concluído — ${criados} processo(s) criado(s), ${erros} erro(s), ${clientesComProcesso.size} já existiam.`
  );
}

export function iniciarJobFolhaMensal() {
  // Executa às 06:00 UTC no dia 1 de cada mês
  cron.schedule("0 6 1 * *", gerarFolhaMensal, { timezone: "UTC" });
  console.log("[folha-mensal.job] Job de folha mensal registrado (todo dia 1 às 06:00 UTC)");
}
