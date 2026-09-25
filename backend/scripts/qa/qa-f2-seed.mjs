// QA-F (#397) — dataset da 2ª passagem (camada 1) no Supabase de DEV.
//
// Pré-requisito: os 7 clientes "QA-F2 *" já cadastrados PELA UI
// (frontend/tests/qa-f2-cadastro.spec.ts) — o cadastro de regime/anexo/histórico
// é justamente um dos itens testados (#496), então não é semeado aqui.
//
// O que este script faz (idempotente):
//   - NF-e de saída/entrada por cliente (upsert por cliente_id + chave_nfe)
//   - 12 meses de folha concluída pros 3 clientes do Anexo V (Fator R 0,40 / 0,16 / 0,28)
// Com --reset, além disso, deixa as pré-condições de qa-f2-apuracao.spec.ts:
//   - apaga todas as apurações dos clientes QA-F2 e as 2 NF-e "extras"
//   - pela API: cria A 08/2026, edita pra 960,50 e aprova; cria A 07/2026 (rascunho)
//   - insere as 2 NF-e extras (2026-03 e 2026-04) → A 07/2026 fica com breakdown desatualizado
//
// Uso (a partir de backend/):
//   node scripts/qa/qa-f2-seed.mjs            # só dados
//   node scripts/qa/qa-f2-seed.mjs --reset    # dados + pré-condições da bateria de UI
// Env: QA_API_URL (default http://localhost:3001), QA_ADMIN_EMAIL, QA_ADMIN_SENHA.
// NUNCA rodar contra produção — usa a service key do .env.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const API = process.env.QA_API_URL || "http://localhost:3001";
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || "admin@teste.com";
const ADMIN_SENHA = process.env.QA_ADMIN_SENHA || "123456";
const RESET = process.argv.includes("--reset");

const NOMES = [
  "QA-F2 Comercio Anexo I",
  "QA-F2 Servicos V FatorR 40",
  "QA-F2 Servicos V FatorR 16",
  "QA-F2 Servicos V FatorR 28",
  "QA-F2 Inicio Atividade",
  "QA-F2 Anexo III So Historico",
  "QA-F2 Lucro Presumido",
];

function falhar(msg) {
  console.error(`[qa-f2-seed] ${msg}`);
  process.exit(1);
}

const { data: clientes, error: erroClientes } = await sb.from("clientes").select("id, nome").like("nome", "QA-F2 %");
if (erroClientes) falhar(erroClientes.message);
const id = Object.fromEntries(clientes.map((c) => [c.nome, c.id]));
const faltando = NOMES.filter((nome) => !id[nome]);
if (faltando.length) falhar(`clientes ausentes (rode qa-f2-cadastro.spec.ts antes): ${faltando.join(", ")}`);

// Chave NF-e fake de 44 dígitos, determinística por cliente + sequência.
const chave = (clienteId, seq) =>
  ("35" + clienteId.replace(/\D/g, "").slice(0, 20) + String(seq).padStart(4, "0")).padEnd(44, "7").slice(0, 44);
const CHAVES_EXTRAS = ["35999999999999999999999999999999999999990001", "35999999999999999999999999999999999999990002"];

function meses(inicio, fim) {
  const lista = [];
  let [ano, mes] = inicio.split("-").map(Number);
  const [anoFim, mesFim] = fim.split("-").map(Number);
  while (ano * 12 + mes <= anoFim * 12 + mesFim) {
    lista.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return lista;
}

const nota = (nome, seq, tipo, data, valor, chaveNfe = chave(id[nome], seq)) => ({
  cliente_id: id[nome],
  chave_nfe: chaveNfe,
  tipo,
  cnpj_emitente: "11222333000181",
  cnpj_destinatario: "44555666000199",
  valor_total: valor,
  data_emissao: data,
});

const notas = [];
// A — Anexo I: 2025-08 vem do histórico manual; 2025-09 tem nota (histórico de 99.999 deve ser ignorado)
meses("2025-09", "2026-08").forEach((ref, i) => notas.push(nota("QA-F2 Comercio Anexo I", i + 1, "saida", `${ref}-15`, 20000)));
notas.push(nota("QA-F2 Comercio Anexo I", 90, "entrada", "2026-08-10", 7000));
notas.push(nota("QA-F2 Comercio Anexo I", 91, "saida", "2026-09-10", 20000)); // mês corrente (aberto)
notas.push(nota("QA-F2 Comercio Anexo I", 92, "saida", "2026-12-01", 20000)); // data futura
// B/C/D — Anexo V: 30.000/mês
for (const nome of ["QA-F2 Servicos V FatorR 40", "QA-F2 Servicos V FatorR 16", "QA-F2 Servicos V FatorR 28"]) {
  meses("2025-08", "2026-08").forEach((ref, i) => notas.push(nota(nome, i + 1, "saida", `${ref}-10`, 30000)));
}
// E — início de atividade: só 3 meses
meses("2026-06", "2026-08").forEach((ref, i) => notas.push(nota("QA-F2 Inicio Atividade", i + 1, "saida", `${ref}-05`, 50000)));
// F — RBT12 só do histórico; receita da competência 08/2026
notas.push(nota("QA-F2 Anexo III So Historico", 1, "saida", "2026-08-20", 10000));

const { error: erroNotas } = await sb.from("lancamentos_fiscais").upsert(notas, { onConflict: "cliente_id,chave_nfe" });
if (erroNotas) falhar(erroNotas.message);
console.log(`[qa-f2-seed] ${notas.length} NF-e ok`);

// Folha: [base_calculo, fgts] por mês → FS12 = 12 × (base + fgts)
const FOLHA = {
  "QA-F2 Servicos V FatorR 40": [11000, 1000], // 144.000 / 360.000 = 0,40 → Anexo III
  "QA-F2 Servicos V FatorR 16": [4600, 400], //   60.000 / 360.000 = 0,1666 → trunca 0,16 → Anexo V
  "QA-F2 Servicos V FatorR 28": [7800, 600], //  100.800 / 360.000 = 0,28 exato → Anexo III
};
for (const [nome, [base, fgts]] of Object.entries(FOLHA)) {
  const { data: existentes } = await sb.from("processamentos_folha").select("id").eq("cliente_id", id[nome]);
  if (existentes?.length) continue;
  for (const ref of meses("2025-08", "2026-07")) {
    const { data: proc, error: erroProc } = await sb
      .from("processamentos_folha")
      .insert({ cliente_id: id[nome], mes_referencia: `${ref}-01`, status: "concluido", arquivo_origem_path: `qa-f2/${ref}.xlsx` })
      .select()
      .single();
    if (erroProc) falhar(erroProc.message);
    const { error: erroCalc } = await sb.from("folha_calculos").insert({
      processamento_id: proc.id, empresa: nome, funcionario: "Fulano QA", cpf: "52998224725", cargo: "Analista",
      salario_bruto: base, dias_trabalhados: 30, valor_horas_extras: 0, valor_faltas: 0, desconto_vt: 0,
      base_calculo: base, inss: 0, fgts, ir: 0, liquido: base,
    });
    if (erroCalc) falhar(erroCalc.message);
  }
  console.log(`[qa-f2-seed] folha 12 meses criada: ${nome}`);
}

if (!RESET) process.exit(0);

// --reset: pré-condições da bateria de UI
const idsClientes = Object.values(id);
const { error: erroDelApur } = await sb.from("apuracoes").delete().in("cliente_id", idsClientes);
if (erroDelApur) falhar(erroDelApur.message);
const { error: erroDelExtras } = await sb.from("lancamentos_fiscais").delete().eq("cliente_id", id["QA-F2 Comercio Anexo I"]).in("chave_nfe", CHAVES_EXTRAS);
if (erroDelExtras) falhar(erroDelExtras.message);
console.log("[qa-f2-seed] apurações QA-F2 e NF-e extras removidas");

async function api(method, path, body, token) {
  const resposta = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) falhar(`${method} ${path} → ${resposta.status} ${JSON.stringify(json)}`);
  return json;
}

const { token } = await api("POST", "/auth/login", { email: ADMIN_EMAIL, senha: ADMIN_SENHA });
const clienteA = id["QA-F2 Comercio Anexo I"];
const a08 = await api("POST", "/apuracoes", { clienteId: clienteA, mes: 8, ano: 2026, regime: "simples_nacional" }, token);
await api("PATCH", `/apuracoes/${a08.id}`, { valor_editado: 960.5, motivo: "QA-F2 ajuste de centavos" }, token);
await api("PATCH", `/apuracoes/${a08.id}/aprovar`, null, token);
const a07 = await api("POST", "/apuracoes", { clienteId: clienteA, mes: 7, ano: 2026, regime: "simples_nacional" }, token);
console.log(`[qa-f2-seed] A 08/2026 aprovada (DAS ${a08.valor_calculado} → 960,50) e A 07/2026 rascunho (DAS ${a07.valor_calculado})`);

const extras = [
  nota("QA-F2 Comercio Anexo I", 0, "saida", "2026-03-20", 5000, CHAVES_EXTRAS[0]),
  nota("QA-F2 Comercio Anexo I", 0, "saida", "2026-04-20", 5000, CHAVES_EXTRAS[1]),
];
const { error: erroExtras } = await sb.from("lancamentos_fiscais").upsert(extras, { onConflict: "cliente_id,chave_nfe" });
if (erroExtras) falhar(erroExtras.message);
console.log("[qa-f2-seed] 2 NF-e extras inseridas (A 07/2026 fica com breakdown desatualizado: 220.000 → 230.000)");
