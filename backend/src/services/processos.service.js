import supabase from "../config/database.js";

// FOLHA-8 (#748): as 3 primeiras etapas da folha são concluídas pelo pipeline da folha
// (folha-checklist.service.js), nunca por clique nem pelo agente local. A ordem do objeto
// é a ordem dos marcos: um marco conclui também as ações anteriores (catch-up).
export const ACOES_FOLHA = Object.freeze({
  PLANILHA_RECEBIDA: "folha_planilha_recebida",
  CALCULADA: "folha_calculada",
  HOLERITES_GERADOS: "folha_holerites_gerados",
});

export const ETAPAS_PADRAO = {
  folha_pagamento: [
    {
      descricao: "Planilha da folha recebida",
      tipo: "automatizada",
      acao: ACOES_FOLHA.PLANILHA_RECEBIDA,
    },
    {
      descricao: "Folha calculada (INSS, IRRF e FGTS)",
      tipo: "automatizada",
      acao: ACOES_FOLHA.CALCULADA,
    },
    {
      descricao: "Holerites e relatório de fechamento gerados",
      tipo: "automatizada",
      acao: ACOES_FOLHA.HOLERITES_GERADOS,
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
    // O contrato é gravado dentro da árvore de pastas, então ela vem antes (#488).
    {
      descricao: "Criar estrutura de pastas",
      tipo: "automatizada",
      acao: "criar_pastas",
    },
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
    { descricao: "Configurar emissão de NFS-e", tipo: "manual", acao: null },
  ],
};

// Cliente existente já tem contrato e CNPJ: entra com cadastro interno no lugar
// do registro e segue a partir do Alvará, mantendo a criação das pastas.
const ETAPAS_CLIENTE_EXISTENTE = [
  ETAPAS_PADRAO.abertura_empresa[0],
  { descricao: "Cadastro interno da empresa", tipo: "manual", acao: null },
  ETAPAS_PADRAO.abertura_empresa[2],
  ...ETAPAS_PADRAO.abertura_empresa.slice(5),
];

function obterEtapasPadrao(tipo, cenario) {
  if (tipo === "abertura_empresa" && cenario === "cliente_existente") {
    return ETAPAS_CLIENTE_EXISTENTE;
  }

  return ETAPAS_PADRAO[tipo];
}

function montarEtapasParaInserir(processoId, etapasPadrao) {
  return etapasPadrao.map(({ descricao, tipo, acao }, i) => ({
    processo_id: processoId,
    descricao,
    tipo,
    acao,
    ordem: i + 1,
  }));
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

  // `codigo` deixa quem chama distinguir 23505 (índice único da folha por cliente + mês,
  // migration 111) de erro de verdade.
  if (erroProcesso) return { erro: erroProcesso.message, codigo: erroProcesso.code };

  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .insert(montarEtapasParaInserir(processo.id, etapasPadrao))
    .select();

  if (erroEtapas) {
    // Os dois INSERT não estão numa transação. Processo sem etapas é órfão: com o índice
    // único da folha, o job e o upload passariam a achar "já existe" e o mês nunca se
    // recuperaria. Compensa apagando o processo (etapas vão junto pelo ON DELETE CASCADE).
    const { error: erroCompensacao } = await supabase
      .from("processos")
      .delete()
      .eq("id", processo.id);
    if (erroCompensacao) {
      console.error(
        `[processos.service] Falha ao apagar o processo ${processo.id} sem etapas:`,
        erroCompensacao.message,
      );
    }
    return { erro: erroEtapas.message };
  }

  return { processo, etapas };
}

/**
 * FOLHA-8 (#748): recupera o processo de folha que ficou sem nenhuma etapa (o criador antigo
 * gravava o processo e o INSERT das etapas podia falhar). Só age em processo sem etapa
 * alguma: nunca mexe em checklist já existente, concluído ou não. Idempotente e segura
 * contra chamadas concorrentes: o índice único (processo_id, ordem) da migration 111 e o
 * ignoreDuplicates fazem quem chega depois não inserir nada.
 * @param {string} processoId
 * @returns {Promise<{ recuperado: boolean, erro?: string }>}
 */
export async function recuperarEtapasPadraoFolha(processoId) {
  const { data: existentes, error: erroBusca } = await supabase
    .from("etapas")
    .select("id")
    .eq("processo_id", processoId)
    .limit(1);

  if (erroBusca) return { recuperado: false, erro: erroBusca.message };
  if (existentes?.length > 0) return { recuperado: false };

  const { error: erroInsert } = await supabase
    .from("etapas")
    .upsert(montarEtapasParaInserir(processoId, ETAPAS_PADRAO.folha_pagamento), {
      onConflict: "processo_id,ordem",
      ignoreDuplicates: true,
    });

  if (erroInsert) return { recuperado: false, erro: erroInsert.message };
  return { recuperado: true };
}

/**
 * Fecha o processo (status concluido) quando todas as etapas estão concluídas. Usado pela
 * conclusão manual, pelo callback do agente e pelo checklist da folha.
 * @param {string} processoId
 * @returns {{ todasConcluidas: boolean, processo?: Object|null, erro?: string }}
 */
export async function concluirProcessoSeTodasEtapasConcluidas(processoId) {
  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .select("concluida")
    .eq("processo_id", processoId);

  if (erroEtapas) return { todasConcluidas: false, erro: erroEtapas.message };
  if (!etapas || etapas.length === 0 || !etapas.every((etapa) => etapa.concluida)) {
    return { todasConcluidas: false };
  }

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .update({ status: "concluido" })
    .eq("id", processoId)
    .eq("status", "em_andamento")
    .select("tipo, nome_empresa, pasta_base")
    .maybeSingle();

  if (erroProcesso) return { todasConcluidas: true, processo: null, erro: erroProcesso.message };
  return { todasConcluidas: true, processo };
}
