import supabase from "../config/database.js";

export const ETAPAS_PADRAO = {
  folha_pagamento: [
    {
      descricao: "Inserir planilha Excel na pasta do mês",
      tipo: "manual",
      acao: null,
    },
    {
      descricao: "Aguardar processamento automático pelo agente",
      tipo: "manual",
      acao: null,
    },
    { descricao: "Revisar holerites gerados", tipo: "manual", acao: null },
    { descricao: "Enviar holerites às empresas", tipo: "manual", acao: null },
    { descricao: "Arquivar documentação do mês", tipo: "manual", acao: null },
  ],
  abertura_empresa: [
    {
      descricao: "Verificar viabilidade do nome empresarial",
      tipo: "manual",
      acao: null,
    },
    { descricao: "Registrar na Junta Comercial", tipo: "manual", acao: null },
    {
      descricao: "Gerar contrato social",
      tipo: "automatizada",
      acao: "gerar_contrato_social",
    },
    { descricao: "Obter CNPJ na Receita Federal", tipo: "manual", acao: null },
    { descricao: "Registrar no município (Alvará)", tipo: "manual", acao: null },
    {
      descricao: "Registrar no estado (Inscrição Estadual, se aplicável)",
      tipo: "manual",
      acao: null,
    },
    {
      descricao: "Abrir conta bancária pessoa jurídica",
      tipo: "manual",
      acao: null,
    },
    {
      descricao: "Criar estrutura de pastas",
      tipo: "automatizada",
      acao: "criar_pastas",
    },
    { descricao: "Configurar emissão de NFS-e", tipo: "manual", acao: null },
  ],
};

const ETAPAS_CLIENTE_EXISTENTE = [
  ETAPAS_PADRAO.abertura_empresa[0],
  { descricao: "Cadastro interno da empresa", tipo: "manual", acao: null },
  ...ETAPAS_PADRAO.abertura_empresa.slice(4),
];

function obterEtapasPadrao(tipo, cenario) {
  if (tipo === "abertura_empresa" && cenario === "cliente_existente") {
    return ETAPAS_CLIENTE_EXISTENTE;
  }

  return ETAPAS_PADRAO[tipo];
}

/**
 * Cria um processo e suas etapas padrão no banco.
 * @param {string} clienteId
 * @param {string} tipo - chave de ETAPAS_PADRAO
 * @param {Object} [extra] - campos opcionais do processo e cenário de abertura
 * @returns {{ processo, etapas } | { erro: string }}
 */
export async function criarProcessoComEtapas(clienteId, tipo, extra = {}) {
  const etapasPadrao = obterEtapasPadrao(tipo, extra.cenario);
  if (!etapasPadrao) return { erro: `tipo inválido: ${tipo}` };

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .insert({
      cliente_id: clienteId,
      tipo,
      nome_empresa: extra.nome_empresa ?? null,
      pasta_base: extra.pasta_base ?? null,
      mes_referencia: extra.mes_referencia ?? null,
      cenario: extra.cenario ?? null,
      socios: extra.socios ?? null,
      capital_social: extra.capital_social ?? null,
      endereco: extra.endereco ?? null,
      objeto_social: extra.objeto_social ?? null,
    })
    .select()
    .single();

  if (erroProcesso) return { erro: erroProcesso.message };

  const etapasParaInserir = etapasPadrao.map(({ descricao, tipo: tipoEtapa, acao }, i) => ({
    processo_id: processo.id,
    descricao,
    tipo: tipoEtapa,
    acao,
    ordem: i + 1,
  }));

  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .insert(etapasParaInserir)
    .select();

  if (erroEtapas) return { erro: erroEtapas.message };

  return { processo, etapas };
}
