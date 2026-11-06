// Apoio dos testes das rotas da NF-e do agente: payload no formato que o agente manda
// (processar_nfe._payload_lancamento) e leitura das tabelas que a nota escreve. Só dado sintético
// da massa #680; nada de cliente real.
import { gerarCnpjSintetico } from "../fixtures/massa-680.js";
import { lerTabela } from "./banco.js";
import { chaveNfe } from "../fixtures/massa-680-dominio.js";

// CNPJ de terceiro (fornecedor/cliente do cliente) que não é de nenhum escritório da massa.
export const CNPJ_TERCEIRO = gerarCnpjSintetico("689900010001");

// Payload de POST /lancamentos-fiscais como o agente monta (processar_nfe._payload_lancamento).
// `cliente` é a linha de `clientes` que recebe a nota; entrada = o cliente é o destinatário.
export function payloadLancamento(cliente, { tipo = "entrada", numero = 90001, itens, ...mudancas } = {}) {
  const emitente = tipo === "entrada" ? CNPJ_TERCEIRO : cliente.cnpj;
  const destinatario = tipo === "entrada" ? cliente.cnpj : CNPJ_TERCEIRO;
  return {
    chave_nfe: chaveNfe(emitente, numero),
    tipo,
    cnpj_emitente: emitente,
    cnpj_destinatario: destinatario,
    valor_total: "1234.56",
    icms: "12.34",
    pis: "1.50",
    cofins: "6.90",
    ipi: "0.00",
    data_emissao: "2026-10-20",
    arquivo_xml: `Cliente/Notas Fiscais/2026-10/nota-${numero}.xml`,
    cliente_id: cliente.id,
    tp_nf: tipo === "entrada" ? 0 : 1,
    itens: itens ?? [{ n_item: 1, cfop: tipo === "entrada" ? "1102" : "5102", ncm: "01012100" }],
    ...mudancas,
  };
}

export const lerLancamentos = (banco, filtros = {}) =>
  lerTabela(banco, "lancamentos_fiscais", ["chave_nfe", "cliente_id"], filtros);

export const lerItens = (banco, filtros = {}) =>
  lerTabela(banco, "lancamentos_fiscais_itens", ["lancamento_id", "n_item"], filtros);

// Fotografia das tabelas que a NF-e escreve, dos dois escritórios: comparar antes e depois de um
// pedido recusado prova que nada foi gravado, nem do outro lado.
export async function fotografarNfe(banco) {
  const foto = {};
  for (const tabela of ["lancamentos_fiscais", "lancamentos_fiscais_itens", "eventos", "notificacoes"]) {
    foto[tabela] = await lerTabela(banco, tabela);
  }
  return foto;
}
