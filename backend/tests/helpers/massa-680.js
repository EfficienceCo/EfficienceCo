import { criarCenarioBanco, resetarBanco, validarBancoDescartavel } from "./banco.js";
import { criarMassaDominio680 } from "../fixtures/massa-680-dominio.js";
import { CONFIG_MASSA_680 } from "../fixtures/massa-680.js";

const ordem = [
  "clientes", "usuarios", "extratos_bancarios", "lancamentos_contabeis", "transacoes_extrato",
  "conciliacoes", "pares_conciliacao", "lancamentos_fiscais", "lancamentos_fiscais_itens", "obrigacoes",
];

// Recriação intencional do descartável: não é o seed-dev compartilhado.
export async function recriarMassa680(config = CONFIG_MASSA_680) {
  validarBancoDescartavel();
  const massa = criarMassaDominio680(config);
  await resetarBanco();
  const { banco } = criarCenarioBanco();
  try {
    for (const tabela of ordem) {
      const { error } = await banco.from(tabela).insert(massa.tabelas[tabela]);
      if (error) throw new Error(`Falha carregando ${tabela} da massa #680: ${error.message}`);
    }
  } catch (erro) {
    try { await resetarBanco(); }
    catch (erroLimpeza) { throw new AggregateError([erro, erroLimpeza], "Carga falhou e a limpeza também."); }
    throw erro;
  }
  return { massa, banco };
}

// Lê todos os campos das tabelas carregadas para comparar duas recriações reais.
export async function snapshotMassa680() {
  const { banco } = criarCenarioBanco();
  const snapshot = {};
  for (const tabela of ordem) {
    const { data, error } = await banco.from(tabela).select("*").order("id");
    if (error) throw new Error(`Falha no snapshot de ${tabela}: ${error.message}`);
    snapshot[tabela] = data;
  }
  return snapshot;
}
