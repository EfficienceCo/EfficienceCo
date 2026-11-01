import { createHash } from "node:crypto";
import { CONFIG_MASSA_680, criarMassaBase680, gerarCpfSintetico, gerarCnpjSintetico } from "./massa-680.js";

function chaveNfe(documento, numero) {
  // NF-e: CPF ocupa as 14 posições da chave com zeros à esquerda (NT 2018.001).
  // O campo emitente/CPF continua com 11 dígitos; não é adaptado para o banco.
  const base = `352610${documento.padStart(14, "0")}55001${String(numero).padStart(9, "0")}1${String(numero).padStart(8, "0")}`;
  let soma = 0;
  let peso = 2;
  for (const digito of [...base].reverse()) {
    soma += Number(digito) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + (resto < 2 ? 0 : 11 - resto);
}

// Descrição pura dos registros; somente o helper de carga acessa o banco.
export function criarMassaDominio680(config = CONFIG_MASSA_680) {
  const base = criarMassaBase680(config);
  const id = numero => `${config.prefixoIds}-${String(numero).padStart(12, "0")}`;
  const instante = config.instante;
  const dia = deslocamento => new Date(Date.parse(instante) + deslocamento * 86_400_000).toISOString().slice(0, 10);
  const tabelas = {
    ...base, lancamentos_contabeis: [], extratos_bancarios: [], transacoes_extrato: [],
    conciliacoes: [], pares_conciliacao: [], lancamentos_fiscais: [],
    lancamentos_fiscais_itens: [], obrigacoes: [],
  };
  const entradasNfe = [];
  const paginacao = [];

  for (const [indiceCliente, cliente] of base.clientes.entries()) {
    const rotulo = indiceCliente === 0 ? "a" : "b";
    const inicio = (indiceCliente + 1) * 10_000;
    const admin = base.usuarios.find(usuario => usuario.cliente_id === cliente.id && usuario.perfil === "admin_cliente");
    const extratos = [
      ["aguardando", 10], ["processado", 10], ["erro", 10], ["processado", 9],
    ].map(([status, mes], indice) => ({
      id: id(inicio + indice + 1), cliente_id: cliente.id, banco: "Banco sintético #680",
      conta: `conta-${rotulo}`, mes, ano: 2026, arquivo_nome: `massa-680-${rotulo}-${indice}.ofx`,
      status, criado_em: instante, processado_em: status === "processado" ? instante : null,
      arquivo_hash: status === "processado" ? createHash("sha256").update(`massa-680-${rotulo}-${indice}`).digest("hex") : null,
    }));
    tabelas.extratos_bancarios.push(...extratos);

    for (const [indiceSessao, quantidade] of [21, 2].entries()) {
      const concluida = indiceSessao === 1;
      const extrato = extratos[concluida ? 3 : 1];
      const sessaoId = id(inicio + 10 + indiceSessao);
      tabelas.conciliacoes.push({
        id: sessaoId, cliente_id: cliente.id, extrato_id: extrato.id, mes: extrato.mes, ano: 2026,
        status: concluida ? "concluida" : "em_andamento", total_transacoes: quantidade,
        // Aberta: sete automáticos e um provável confirmado; fechada: dois casados.
        total_conciliadas: concluida ? 2 : 8, total_pendentes: concluida ? 0 : 13,
        criado_em: instante, concluida_em: concluida ? instante : null, criado_por: admin.id,
      });
      for (let indice = 0; indice < quantidade; indice += 1) {
        const confianca = ["automatico", "provavel", "sem_par"][indice % 3];
        const transacaoId = id(inicio + (concluida ? 200 : 100) + indice);
        const lancamentoId = confianca === "sem_par" ? null : id(inicio + (concluida ? 400 : 300) + indice);
        const data = `2026-${String(extrato.mes).padStart(2, "0")}-${String(indice + 1).padStart(2, "0")}`;
        const tipo = indice % 2 === 0 ? "credito" : "debito";
        const valor = (indice + 1) * 10;
        tabelas.transacoes_extrato.push({
          id: transacaoId, extrato_id: extrato.id, cliente_id: cliente.id, data_lancamento: data,
          valor, tipo, descricao: `Transação sintética ${rotulo}-${indiceSessao}-${indice}`,
          id_banco: `680-${rotulo}-${indiceSessao}-${indice}`, conciliado: concluida, criado_em: instante,
        });
        if (lancamentoId) tabelas.lancamentos_contabeis.push({
          id: lancamentoId, cliente_id: cliente.id, data_lancamento: data, valor, tipo,
          descricao: `Lançamento sintético ${rotulo}-${indiceSessao}-${indice}`,
          categoria: "sintetica-680", conciliado: concluida, criado_em: instante, criado_por: admin.id,
        });
        const confirmado = confianca === "provavel" && indice === 1;
        tabelas.pares_conciliacao.push({
          id: id(inicio + (concluida ? 600 : 500) + indice), conciliacao_id: sessaoId,
          transacao_id: transacaoId, lancamento_id: lancamentoId, confianca,
          confirmado_por: confirmado ? admin.id : null, confirmado_em: confirmado ? instante : null,
          criado_em: instante,
        });
      }
      if (!concluida) paginacao.push({ clienteId: cliente.id, extratoId: extrato.id, usuarioId: admin.id, total: 21, limite: 15 });
    }

    const terceiro = gerarCnpjSintetico(`${68090001 + indiceCliente}0001`);
    const casos = ["entrada-autorizada", "saida-autorizada", "saida-cancelada", "entrada-sem-protocolo", "entrada-emitente-cpf"];
    for (const [indice, caso] of casos.entries()) {
      const numero = inicio + 700 + indice;
      const tipo = caso.startsWith("entrada") ? "entrada" : "saida";
      const emitenteCpf = caso.endsWith("cpf");
      const emitente = emitenteCpf ? gerarCpfSintetico(String(680000201 + indiceCliente)) : tipo === "entrada" ? terceiro : cliente.cnpj;
      const destinatario = tipo === "entrada" ? cliente.cnpj : terceiro;
      const chave = chaveNfe(emitente, numero);
      const protocolo = caso.includes("sem-protocolo") ? null : String(168000000000000 + numero);
      const persistivel = protocolo !== null;
      const arquivo = `massa-680/nfe-${rotulo}-${caso}.xml`;
      entradasNfe.push({
        cliente_id: cliente.id, caso, numero, chave, emitente, destinatario,
        protocolo, dataEmissao: `2026-10-${String(indice + 1).padStart(2, "0")}`,
        arquivo, persistivel,
        pendencia: protocolo ? null : "Entrada sem autorização, deve ser recusada",
      });
      if (!persistivel) continue;
      const cancelada = caso.endsWith("cancelada");
      tabelas.lancamentos_fiscais.push({
        id: id(numero), cliente_id: cliente.id, chave_nfe: chave, tipo,
        cnpj_emitente: emitente, cnpj_destinatario: destinatario, valor_total: 100,
        icms: 0, pis: 0, cofins: 0, ipi: 0, data_emissao: `2026-10-${String(indice + 1).padStart(2, "0")}`,
        arquivo_xml: arquivo, criado_em: instante, status: cancelada ? "cancelada" : "ativa",
        cancelado_em: cancelada ? instante : null, motivo_cancelamento: cancelada ? "Cancelamento sintético #680" : null,
        protocolo_cancelamento: cancelada ? String(268000000000000 + numero) : null,
        tp_nf: 1, inconsistencias: [],
      });
      tabelas.lancamentos_fiscais_itens.push({
        id: id(inicio + 800 + indice), lancamento_id: id(numero), cliente_id: cliente.id,
        n_item: 1, cfop: "5102", ncm: "01012100",
      });
    }

    for (const [indice, status] of ["pendente", "concluida", "atrasada"].entries()) {
      tabelas.obrigacoes.push({
        id: id(inicio + 900 + indice), cliente_id: cliente.id,
        nome: `Obrigação sintética ${rotulo} ${status} #680`, tipo: "mensal", recorrente: true,
        data_vencimento: dia(status === "pendente" ? 10 : status === "atrasada" ? -5 : -1),
        status, criado_em: instante,
        comprovante_path: status === "concluida" ? `massa-680/comprovante-${rotulo}.pdf` : null,
      });
    }
  }
  return { tabelas, entradasNfe, paginacao, referencia: instante };
}
