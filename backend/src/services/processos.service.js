import supabase from "../config/database.js";

export const ETAPAS_PADRAO = {
  folha_pagamento: [
    "Inserir planilha Excel na pasta do mês",
    "Aguardar processamento automático pelo agente",
    "Revisar holerites gerados",
    "Enviar holerites às empresas",
    "Arquivar documentação do mês",
  ],
  abertura_empresa: [
    "Verificar viabilidade do nome empresarial",
    "Registrar na Junta Comercial",
    "Obter CNPJ na Receita Federal",
    "Registrar no município (Alvará)",
    "Registrar no estado (Inscrição Estadual, se aplicável)",
    "Abrir conta bancária pessoa jurídica",
    "Configurar emissão de NFS-e",
  ],
};

/**
 * Cria um processo e suas etapas padrão no banco.
 * @param {string} clienteId
 * @param {string} tipo - chave de ETAPAS_PADRAO
 * @param {Object} [extra] - campos opcionais: nome_empresa, pasta_base, mes_referencia
 * @returns {{ processo, etapas } | { erro: string }}
 */
export async function criarProcessoComEtapas(clienteId, tipo, extra = {}) {
  const descricoesPadrao = ETAPAS_PADRAO[tipo];
  if (!descricoesPadrao) return { erro: `tipo inválido: ${tipo}` };

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .insert({
      cliente_id: clienteId,
      tipo,
      nome_empresa: extra.nome_empresa ?? null,
      pasta_base: extra.pasta_base ?? null,
      mes_referencia: extra.mes_referencia ?? null,
    })
    .select()
    .single();

  if (erroProcesso) return { erro: erroProcesso.message };

  const etapasParaInserir = descricoesPadrao.map((descricao, i) => ({
    processo_id: processo.id,
    descricao,
    ordem: i + 1,
  }));

  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .insert(etapasParaInserir)
    .select();

  if (erroEtapas) return { erro: erroEtapas.message };

  return { processo, etapas };
}
