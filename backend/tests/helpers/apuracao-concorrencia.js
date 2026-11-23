import assert from "node:assert/strict";

// Barreira no transporte, sem fabricar respostas, trocar o banco ou desativar
// JWT/RLS. Os dois SELECTs HTTP reais terminam sobre o mesmo rascunho antes
// de entregar suas respostas aos controllers e liberar os UPDATEs reais.
export async function comLeiturasSimultaneas(id, executar, primeiraEscrita) {
  const original = globalThis.fetch;
  let leituras = 0, liberar, versao;
  const barreira = new Promise(resolve => { liberar = resolve; });
  let concluirPrimeira;
  const escrita = new Promise(resolve => { concluirPrimeira = resolve; });
  const timeout = setTimeout(() => { liberar(); concluirPrimeira(); }, 8_000);
  globalThis.fetch = async (entrada, opcoes) => {
    const url = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url);
    const metodo = opcoes?.method ?? entrada?.method ?? "GET";
    const alvo = url.origin === process.env.TEST_SUPABASE_URL && url.pathname === "/rest/v1/apuracoes" && url.searchParams.get("id") === `eq.${id}`;
    const patch = alvo && metodo.toUpperCase() === "PATCH";
    const acao = patch && JSON.parse(opcoes.body).status === "aprovado" ? "aprovar" : "editar";
    if (patch && primeiraEscrita && acao !== primeiraEscrita) await escrita;
    const resposta = await original(entrada, opcoes);
    if (patch && primeiraEscrita && acao === primeiraEscrita) concluirPrimeira();
    if (url.origin === process.env.TEST_SUPABASE_URL && url.pathname === "/rest/v1/apuracoes"
      && metodo.toUpperCase() === "GET" && url.searchParams.get("id") === `eq.${id}`) {
      assert.equal(resposta.status, 200, "SELECT real da corrida");
      const corpo = await resposta.clone().json();
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      assert.equal(linha.status, "rascunho", "as duas operações leram rascunho");
      if (leituras === 0) versao = linha.atualizado_em;
      else assert.equal(linha.atualizado_em, versao, "as duas leituras usam a mesma versão");
      leituras += 1;
      if (leituras === 2) liberar();
      await barreira;
    }
    return resposta;
  };
  try {
    const resultado = await executar();
    assert.equal(leituras, 2, "corrida controlada exige duas leituras reais");
    return resultado;
  } finally {
    clearTimeout(timeout);
    liberar();
    concluirPrimeira();
    globalThis.fetch = original;
  }
}
