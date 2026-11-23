import cron from "node-cron";
import supabase from "../config/database.js";
import { criarProcessoComEtapas } from "../services/processos.service.js";
import { mesReferenciaAtual } from "../services/folha-checklist.service.js";

// 23505: o índice único da migration 111 (cliente + mês da folha). Um upload do mesmo
// cliente e mês criou o processo entre o SELECT abaixo e o INSERT (FOLHA-8, #748).
const CODIGO_VIOLACAO_UNICA = "23505";

export async function gerarFolhaMensal(agora = new Date()) {
  const mesReferencia = mesReferenciaAtual(agora);

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
  let jaExistiam = clientes.length - clientesSemProcesso.length;

  for (const cliente of clientesSemProcesso) {
    const resultado = await criarProcessoComEtapas(cliente.id, "folha_pagamento", { mes_referencia: mesReferencia });
    if (resultado.codigo === CODIGO_VIOLACAO_UNICA) {
      jaExistiam++;
    } else if (resultado.erro) {
      console.error(`[folha-mensal.job] Erro ao criar processo para cliente ${cliente.nome}:`, resultado.erro);
      erros++;
    } else {
      criados++;
    }
  }

  console.log(
    `[folha-mensal.job] Concluído — ${criados} processo(s) criado(s), ${erros} erro(s), ${jaExistiam} já existiam.`
  );

  return { criados, erros, jaExistiam };
}

export function iniciarJobFolhaMensal() {
  // Executa às 06:00 UTC no dia 1 de cada mês
  cron.schedule("0 6 1 * *", gerarFolhaMensal, { timezone: "UTC" });
  console.log("[folha-mensal.job] Job de folha mensal registrado (todo dia 1 às 06:00 UTC)");
}
