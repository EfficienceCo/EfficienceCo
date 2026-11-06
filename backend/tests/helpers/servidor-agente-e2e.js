// Sobe o backend REAL (app.js, sem jobs) no banco descartável, com a massa #680 e uma
// licença do escritório A, para o teste do AGENTE (pytest) falar com ele por HTTP de verdade.
// Não é um teste (o executor só descobre *.test.js): o pytest o inicia com `node` e lê, no log, a
// linha `E2E-PRONTO {json}` com a URL, os ids dos dois clientes, a licença do A e as notas que a massa declara
// (chave, emitente, destinatário, valor, itens), para o teste conferir o banco contra a massa.
// Encerra quando o pytest fecha a entrada padrão.
import { instalarProtecaoServicosExternos } from "./servicos-externos.js";
import { iniciarApiTeste } from "./http.js";
import { recriarMassa680 } from "./massa-680.js";
import { resetarBanco } from "./banco.js";
import { criarLicenca } from "./licenca-agente.js";

// O backend deste processo é o real: barra SEFAZ, eSocial, Storage, SMTP e rede externa (só loopback
// passa), como o setup-env.js faz nos testes do backend. Instalado antes de qualquer cliente de rede.
instalarProtecaoServicosExternos();

const { massa, banco } = await recriarMassa680();
const [A, B] = massa.tabelas.clientes;

// O que a massa diz que cada nota escriturada tem. O agente é quem tem de criar essas linhas:
// por isso elas saem do banco (o teste confere o que o agente gravou contra esta descrição).
const esperadas = massa.tabelas.lancamentos_fiscais.map(nota => ({
  ...nota,
  itens: massa.tabelas.lancamentos_fiscais_itens
    .filter(item => item.lancamento_id === nota.id)
    .map(({ n_item, cfop, ncm }) => ({ n_item, cfop, ncm })),
}));
for (const tabela of ["lancamentos_fiscais_itens", "lancamentos_fiscais"]) {
  const { error } = await banco.from(tabela).delete().not("id", "is", null);
  if (error) throw new Error(`Falha limpando ${tabela}: ${error.message}`);
}

const tokenA = await criarLicenca(banco, A.id);
const api = await iniciarApiTeste();

console.log(`E2E-PRONTO ${JSON.stringify({
  baseUrl: api.baseUrl,
  clientes: { a: { id: A.id, token: tokenA }, b: { id: B.id } },
  esperadas,
  entradas: massa.entradasNfe,
})}`);

async function encerrar() {
  try { await api.fechar(); } finally { await resetarBanco(); }
}
process.stdin.resume();
process.stdin.on("end", () => { encerrar().then(() => process.exit(0), () => process.exit(1)); });
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => { encerrar().finally(() => process.exit(0)); });
}
