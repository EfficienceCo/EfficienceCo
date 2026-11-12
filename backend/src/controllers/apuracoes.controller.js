import supabase from "../config/database.js";
import { isDeepStrictEqual } from "node:util";
import { PERFIS } from "../config/perfis.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { calcularSimplesNacional } from "../utils/simples-nacional.util.js";
import {
  competenciaEstaFechada,
  dataLocalISO,
  hojeNoBrasil,
  mesJaFechado,
  ultimaCompetenciaFechada,
  ultimoDiaDoMes,
} from "../utils/periodo.util.js";
import { validarHistoricoReceita } from "../utils/regime-tributario.util.js";
import { ehUuid } from "../utils/uuid.util.js";
import { arredondar, chaveMes, inteiroEstrito, numeroNaoNegativo } from "../utils/comum.util.js";

const REGIMES_SUPORTADOS = new Set(["simples_nacional"]);
const FOLHA_STATUS = {
  PENDENTE: "pendente",
  VERIFICADO: "verificado",
  SEM_DADOS: "sem_dados",
};
// Mesma ideia de LIMITE_ETAPAS_POR_POLLING em processos.controller.js — evita
// resposta ilimitada quando pendências de folha se acumulam para um cliente.
const LIMITE_APURACOES_POR_POLLING = 50;
const ANO_MAXIMO = 2147483647;
const VALOR_MAXIMO = 9999999999999.99; // NUMERIC(15,2)

// PostgREST limits each response to 1,000 rows. Stable ordering and fresh
// builders on each page keep the fiscal bases and their audit complete.
async function coletarPaginas(criarConsulta) {
  const linhas = [];
  const tamanho = 1000;
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await criarConsulta().range(inicio, inicio + tamanho - 1);
    if (error) return { data: null, error };
    linhas.push(...(data || []));
    if ((data || []).length < tamanho) return { data: linhas, error: null };
  }
}

function coletarNotas(clienteId, inicio, fim) {
  return coletarPaginas(() => supabase.from("lancamentos_fiscais")
    .select("id, chave_nfe, tipo, valor_total, data_emissao, status, cancelado_em, motivo_cancelamento, protocolo_cancelamento")
    .eq("cliente_id", clienteId).gte("data_emissao", inicio).lte("data_emissao", fim)
    .order("id"));
}

function ehProvisorioSemFolha(apuracao) {
  return apuracao.fator_r != null && apuracao.folha12 == null;
}

function reconstruirCalculo(apuracao) {
  const provisorio = ehProvisorioSemFolha(apuracao);
  const resultado = calcularSimplesNacional({
    rbt12: Number(apuracao.rbt12_usado),
    receita_mes: Number(apuracao.receita_mes),
    anexo: provisorio ? "V" : apuracao.anexo,
    folha12: apuracao.folha12 == null ? null : Number(apuracao.folha12),
    provisorioSemFolha: provisorio,
    aplicarFatorR: provisorio,
  });
  // O enquadramento e FR persistidos foram calculados pelas somas exatas do
  // período. Não refazer essa razão usando bases anualizadas já arredondadas.
  return resultado.erro ? resultado : {
    ...resultado,
    anexo_original: apuracao.fator_r == null ? apuracao.anexo : "V",
    fator_r: apuracao.fator_r,
  };
}

// Folha (FS12 / Fator R) só se aplica ao Anexo V. Anexos I–IV devem gravar
// null explícito — o DEFAULT da coluna é 'pendente' e o CHECK aceita NULL,
// então omitir o campo faria o banco preencher 'pendente' e a tela mostrar
// "Aguardando confirmação do agente" sem sentido (BUG-APUR-11 / #611).
function resolverFolhaStatus(anexoOriginal, pendenteFolha) {
  if (anexoOriginal !== "V") return null;
  return pendenteFolha ? FOLHA_STATUS.PENDENTE : FOLHA_STATUS.VERIFICADO;
}

// GET usa clienteId (camelCase) — mesmo padrão do dashboard em lancamentos-fiscais.controller.js.
function resolverClienteIdQuery(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.query.clienteId;
  }
  return req.usuario?.cliente_id;
}

// POST vem do dashboard (JWT), não do agente — payload usa clienteId (camelCase),
// espelhando a query string dos outros endpoints deste controller.
function resolverClienteIdBody(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.body.clienteId;
  }
  return req.usuario?.cliente_id;
}

// A RBT12 e a FS12 usam os 12 meses ANTERIORES ao período de apuração. Para
// agosto/2026, por exemplo, a janela correta é agosto/2025 a julho/2026.
function calcularJanela12MesesAnteriores(mes, ano) {
  const indiceFim = ano * 12 + (mes - 1) - 1;
  const indiceInicio = indiceFim - 11;
  const anoInicio = Math.floor(indiceInicio / 12);
  const mesInicio = (indiceInicio % 12) + 1;
  const anoFim = Math.floor(indiceFim / 12);
  const mesFim = (indiceFim % 12) + 1;

  const inicio = `${anoInicio}-${String(mesInicio).padStart(2, "0")}-01`;
  const fim = ultimoDiaDoMes(anoFim, mesFim);
  const meses = new Set();

  for (let indice = indiceInicio; indice <= indiceFim; indice += 1) {
    meses.add(chaveMes(Math.floor(indice / 12), (indice % 12) + 1));
  }

  return { inicio, fim, meses };
}

function mesesFolhaEsperados(mes, ano, dataInicioAtividade) {
  const inicio = referenciaInicioAtividade(dataInicioAtividade);
  const janela = calcularJanela12MesesAnteriores(mes, ano);
  if (inicio.referencia === chaveMes(ano, mes)) return new Set([chaveMes(ano, mes)]);
  return new Set([...janela.meses].filter((ref) => !inicio.referencia || ref >= inicio.referencia));
}

function somarHistoricoReceita(historico, mesesEsperados, mesesComNotas) {
  // Mesma validação que clientes.controller.js aplica na escrita (#496): o que a
  // tela de cadastro grava é sempre legível aqui, sem drift entre as pontas.
  const validado = validarHistoricoReceita(historico);
  if (validado.erro) return { erro: validado.erro };

  const receitasPorMes = new Map(
    validado.entradas.map((entrada) => [chaveMes(entrada.ano, entrada.mes), entrada.receita]),
  );

  let total = 0;
  const receitasUsadas = new Map();
  for (const [referencia, receita] of receitasPorMes) {
    // NFes importadas são a fonte primária. O histórico manual só completa os
    // meses ainda ausentes no sistema, evitando dupla contagem.
    if (mesesEsperados.has(referencia) && !mesesComNotas.has(referencia)) {
      total += receita;
      receitasUsadas.set(referencia, receita);
    }
  }

  return { total: arredondar(total), receitasUsadas };
}

function referenciaDaNota(nota) {
  return typeof nota?.data_emissao === "string" ? nota.data_emissao.slice(0, 7) : "";
}

function ehNotaDeSaida(nota) {
  // Os mocks mais antigos não informavam o tipo; mantemos essa compatibilidade
  // sem afrouxar o comportamento real, pois o banco sempre persiste o campo.
  return nota?.tipo === undefined || nota?.tipo === "saida";
}

function filtrarNotasAtivas(notas) {
  // Defesa adicional para mocks/adapters que não apliquem o .eq("status", "ativa").
  // Registros legados sem status continuam ativos; só canceladas são excluídas.
  return (notas || []).filter((nota) => nota?.status !== "cancelada");
}

function resumirNota(nota, detalhes) {
  return {
    id: nota.id ?? null,
    chave_nfe: nota.chave_nfe ?? null,
    tipo: nota.tipo ?? "saida",
    data_emissao: nota.data_emissao,
    valor_total: arredondar(Number(nota.valor_total) || 0),
    ...detalhes,
  };
}

function resumirNotaCancelada(nota) {
  const instante = nota.cancelado_em ? new Date(nota.cancelado_em) : null;
  const data = instante && !Number.isNaN(instante.getTime())
    ? hojeNoBrasil(instante).split("-").reverse().join("/") : null;
  return resumirNota(nota, {
    compoe_rbt12: false, compoe_receita_mes: false,
    motivo: data ? `NF-e cancelada em ${data} — não compõe a receita bruta.`
      : "NF-e cancelada — não compõe a receita bruta.",
    cancelado_em: nota.cancelado_em ?? null,
    motivo_cancelamento: nota.motivo_cancelamento ?? null,
    protocolo_cancelamento: nota.protocolo_cancelamento ?? null,
  });
}

function dataEmissaoISO(nota) {
  return typeof nota?.data_emissao === "string" ? nota.data_emissao.slice(0, 10) : "";
}

// clientes.data_inicio_atividade (BUG-APUR-06) chega como "AAAA-MM-DD". Só o
// mês importa: o mês do início conta inteiro como mês de atividade.
function referenciaInicioAtividade(dataInicioAtividade) {
  if (dataInicioAtividade == null || dataInicioAtividade === "") return { referencia: null };

  const match = typeof dataInicioAtividade === "string"
    ? /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(dataInicioAtividade.trim().slice(0, 10))
    : null;
  const anoInicio = match ? Number(match[1]) : NaN;
  const mesInicio = match ? Number(match[2]) : NaN;

  if (!match || mesInicio < 1 || mesInicio > 12) {
    return { erro: "Data de início de atividade inválida no cadastro do cliente" };
  }

  return { referencia: chaveMes(anoInicio, mesInicio), indice: anoInicio * 12 + (mesInicio - 1) };
}

export function montarBasesCalculo({
  notas,
  historicoReceita,
  mes,
  ano,
  dataInicioAtividade = null,
  hojeISO = dataLocalISO(),
}) {
  const inicioAtividade = referenciaInicioAtividade(dataInicioAtividade);
  if (inicioAtividade.erro) return { erro: inicioAtividade.erro };

  // BUG-APUR-07 (LC 123/2006 art. 18 §2º; Res. CGSN 140/2018 art. 22): com
  // menos de 12 meses de atividade antes da competência, a RBT12 é
  // proporcionalizada. Sem data de início no cadastro, segue a janela cheia —
  // ausência nunca é tratada como "empresa nova".
  const mesesAtividade = inicioAtividade.referencia === null
    ? null
    : ano * 12 + (mes - 1) - inicioAtividade.indice;

  if (mesesAtividade !== null && mesesAtividade < 0) {
    return { erro: "PERIODO_ANTERIOR_AO_INICIO_ATIVIDADE" };
  }

  const rbt12Proporcional = mesesAtividade !== null && mesesAtividade < 12;
  const anteriorAoInicio = (referencia) =>
    inicioAtividade.referencia !== null && referencia < inicioAtividade.referencia;

  const janelaRbt12 = calcularJanela12MesesAnteriores(mes, ano);
  // BUG-APUR-08 / QA-F §F8: só meses já fechados no calendário entram na RBT12 —
  // competência futura ou mês corrente parcial não podem inflar/subestimar a base.
  // Meses anteriores ao início de atividade não existem para a RBT12 (não viram zero).
  const mesesRbt12Fechados = new Set(
    [...janelaRbt12.meses].filter(
      (referencia) => mesJaFechado(referencia, hojeISO) && !anteriorAoInicio(referencia),
    ),
  );
  const mesReferenciaAtual = chaveMes(ano, mes);
  const linhasNotas = Array.isArray(notas) ? notas : [];
  const notasAtivas = filtrarNotasAtivas(linhasNotas);
  const notasSaida = notasAtivas.filter(ehNotaDeSaida);

  const notaComDataFutura = (nota) => {
    const emissao = dataEmissaoISO(nota);
    return Boolean(emissao) && emissao > hojeISO;
  };

  const notasRbt12 = notasSaida.filter((nota) => {
    if (notaComDataFutura(nota)) return false;
    return mesesRbt12Fechados.has(referenciaDaNota(nota));
  });
  const notasReceitaMes = notasSaida.filter((nota) => {
    if (notaComDataFutura(nota)) return false;
    return referenciaDaNota(nota) === mesReferenciaAtual;
  });
  const mesesComNotas = new Set(notasRbt12.map(referenciaDaNota));
  const historico = somarHistoricoReceita(historicoReceita, mesesRbt12Fechados, mesesComNotas);

  if (historico.erro) return historico;

  const receitaNfesPorMes = new Map();
  for (const nota of notasRbt12) {
    const referencia = referenciaDaNota(nota);
    receitaNfesPorMes.set(
      referencia,
      arredondar((receitaNfesPorMes.get(referencia) || 0) + Number(nota.valor_total)),
    );
  }

  const mesesComposicao = [...janelaRbt12.meses].filter((referencia) => !anteriorAoInicio(referencia));
  const rbt12Mensal = mesesComposicao.map((referencia) => {
    const [anoReferencia, mesReferencia] = referencia.split("-").map(Number);
    const periodoFechado = mesesRbt12Fechados.has(referencia);
    const receitaNfes = periodoFechado ? (receitaNfesPorMes.get(referencia) || 0) : 0;
    const receitaHistorico = periodoFechado ? (historico.receitasUsadas.get(referencia) || 0) : 0;

    return {
      referencia,
      mes: mesReferencia,
      ano: anoReferencia,
      receita_nfes: receitaNfes,
      receita_historico: receitaHistorico,
      total: arredondar(receitaNfes + receitaHistorico),
      periodo_fechado: periodoFechado,
    };
  });

  const somaJanela = rbt12Mensal.reduce((soma, item) => soma + item.total, 0);
  const receitaMesBruta = notasReceitaMes.reduce((soma, nota) => soma + Number(nota.valor_total), 0);
  const receitaMes = arredondar(receitaMesBruta);

  // 1º mês de atividade: receita do próprio mês × 12. Do 2º ao 12º: média dos
  // meses de atividade anteriores × 12. Arredonda só no final.
  let rbt12;
  if (!rbt12Proporcional) {
    rbt12 = arredondar(somaJanela);
  } else if (mesesAtividade === 0) {
    rbt12 = arredondar(receitaMesBruta * 12);
  } else {
    rbt12 = arredondar((somaJanela / mesesAtividade) * 12);
  }

  const notasConsideradas = [];
  const notasExcluidasPeriodo = [];

  for (const nota of notasSaida) {
    const referencia = referenciaDaNota(nota);
    const emissaoFutura = notaComDataFutura(nota);
    const naJanela = janelaRbt12.meses.has(referencia);
    const compoeRbt12 = !emissaoFutura && mesesRbt12Fechados.has(referencia);
    const compoeReceitaMes = !emissaoFutura && referencia === mesReferenciaAtual;

    // Data futura ou mês da janela ainda aberto: fora da soma, com motivo explícito.
    if (emissaoFutura || (naJanela && !compoeRbt12 && !compoeReceitaMes)) {
      notasExcluidasPeriodo.push(resumirNota(nota, {
        compoe_rbt12: false,
        compoe_receita_mes: false,
        motivo: emissaoFutura
          ? "Nota fiscal com data de emissão futura — excluída da RBT12 e da receita da competência."
          : anteriorAoInicio(referencia)
            ? "Emitida antes do início de atividade do cliente — excluída da RBT12."
            : "Período ainda não fechado — excluída da RBT12.",
      }));
      continue;
    }

    const motivo = compoeRbt12
      ? "Nota fiscal de saída incluída na RBT12."
      : "Nota fiscal de saída incluída na receita da competência.";

    notasConsideradas.push(resumirNota(nota, {
      compoe_rbt12: compoeRbt12,
      compoe_receita_mes: compoeReceitaMes,
      motivo,
    }));
  }

  const notasExcluidas = [
    ...linhasNotas.filter((nota) => nota.status === "cancelada")
      .map(resumirNotaCancelada),
    ...notasAtivas
      .filter((nota) => !ehNotaDeSaida(nota))
      .map((nota) => resumirNota(nota, {
        compoe_rbt12: false,
        compoe_receita_mes: false,
        motivo: "Nota fiscal de entrada não compõe a receita bruta.",
      })),
    ...notasExcluidasPeriodo,
  ];

  return {
    janelaRbt12,
    rbt12,
    receitaMes,
    receitaPeriodo: mesesAtividade === 0 ? receitaMes : arredondar(somaJanela),
    rbt12Mensal,
    rbt12Metodo: rbt12Proporcional ? "proporcional_inicio_atividade" : "janela_12_meses",
    mesesAtividade: rbt12Proporcional ? mesesAtividade : null,
    notasFiscais: {
      consideradas: notasConsideradas,
      excluidas: notasExcluidas,
    },
  };
}

// O headline (rbt12_usado/receita_mes/valor_calculado) é o valor gravado na
// criação; o breakdown é reconstruído dos lançamentos atuais. Se uma NF-e da
// janela mudou depois, os dois divergem — sinalizamos em vez de reescrever o
// valor persistido (que pode já estar aprovado).
function detectarBreakdownDesatualizado(resultado, bases) {
  const diferenca = (persistido, reconstruido) => arredondar(reconstruido - persistido);
  const rbt12Diferenca = diferenca(resultado.rbt12_usado, bases.rbt12);
  const receitaMesDiferenca = diferenca(resultado.receita_mes, bases.receitaMes);

  return {
    breakdown_desatualizado: rbt12Diferenca !== 0 || receitaMesDiferenca !== 0,
    breakdown_divergencia: {
      rbt12_persistido: resultado.rbt12_usado,
      rbt12_reconstruido: bases.rbt12,
      receita_mes_persistida: resultado.receita_mes,
      receita_mes_reconstruida: bases.receitaMes,
    },
  };
}

function enriquecerApuracao(apuracao, resultado, bases, clienteNome) {
  return {
    ...apuracao,
    cliente_nome: clienteNome,
    anexo_original: resultado.anexo_original,
    anexo_efetivo: resultado.anexo_efetivo,
    faixa_limite: resultado.faixa_limite,
    aliquota_nominal: resultado.aliquota_nominal,
    parcela_deduzir: resultado.parcela_deduzir,
    aliquota_efetiva: resultado.aliquota_efetiva,
    valor_calculado: resultado.valor_das,
    fator_r: resultado.fator_r,
    rbt12: resultado.rbt12_usado,
    rbt12_usado: resultado.rbt12_usado,
    receita_mes: resultado.receita_mes,
    // Derivados na leitura (cliente + período), sem coluna própria (BUG-APUR-07).
    rbt12_metodo: bases.rbt12Metodo,
    meses_atividade: bases.mesesAtividade,
    rbt12_mensal: bases.rbt12Mensal,
    notas_fiscais: bases.notasFiscais,
    ...detectarBreakdownDesatualizado(resultado, bases),
  };
}

// Months without a processing count as zero (#726). An existing failed or
// unfinished processing is different: it must remain retryable and provisional.
async function coletarFolha12(clienteId, janelaRbt12, mesesAtividade = null, mes, ano) {
  const meses = mesesAtividade === 0
    ? new Set([chaveMes(ano, mes)])
    : new Set([...janelaRbt12.meses].slice(-(mesesAtividade || 12)));
  const referencias = [...meses];
  const inicio = `${referencias[0]}-01`;
  const [anoFim, mesFim] = referencias.at(-1).split("-").map(Number);
  const fim = ultimoDiaDoMes(anoFim, mesFim);
  const { data: processamentos, error: erroProcessamentos } = await coletarPaginas(() => supabase
    .from("processamentos_folha")
    .select("id, mes_referencia, criado_em, status")
    .eq("cliente_id", clienteId)
    .gte("mes_referencia", inicio)
    .lte("mes_referencia", fim)
    .order("criado_em", { ascending: false })
    .order("id"));

  if (erroProcessamentos) {
    console.error("[apuracoes.controller] Erro ao buscar processamentos de folha:", erroProcessamentos.message);
    return { erro: "Erro ao buscar dados de folha" };
  }

  const processamentoPorMes = new Map();
  for (const processamento of processamentos || []) {
    const referencia = processamento.mes_referencia?.slice(0, 7);
    if (meses.has(referencia) && !processamentoPorMes.has(referencia)) {
      processamentoPorMes.set(referencia, processamento);
    }
  }
  if ([...processamentoPorMes.values()].some((p) => p.status !== undefined && p.status !== "concluido")) {
    return { folha12: null, semDadosFolha: true, pendenteFolha: true, mesesConcluidos: [] };
  }

  const idsProcessamentos = [...processamentoPorMes.values()].map((p) => p.id);
  const { data: calculos, error: erroCalculos } = idsProcessamentos.length
    ? await coletarPaginas(() => supabase.from("folha_calculos")
      .select("base_calculo, fgts").in("processamento_id", idsProcessamentos).order("id"))
    : { data: [], error: null };

  if (erroCalculos) {
    console.error("[apuracoes.controller] Erro ao buscar cálculos de folha:", erroCalculos.message);
    return { erro: "Erro ao buscar dados de folha" };
  }

  // CPP effectively collected is not available in the current schema (DAS-6).
  // Annualize both bases by the same period, including the PA only on opening.
  const soma = (calculos || []).reduce((total, linha) => total + Number(linha.base_calculo) + Number(linha.fgts), 0);
  const divisor = mesesAtividade === 0 ? 1 : mesesAtividade;
  const folha12 = arredondar(divisor == null ? soma : (soma / divisor) * 12);
  return {
    folha12, semDadosFolha: false,
    folhaPeriodo: arredondar(soma),
    pendenteFolha: processamentoPorMes.size < meses.size,
    mesesConcluidos: [...processamentoPorMes.keys()],
  };
}

function avaliarEstadoFolha(apuracao, folha, relatorio = null) {
  const anterior = apuracao.dados_folha;
  if (!relatorio && !anterior) {
    return { folha_status: resolverFolhaStatus("V", folha.pendenteFolha), dados_folha: null };
  }
  const dados = relatorio || anterior;
  const referencias = new Set((dados.mesesEncontrados || []).map((item) => chaveMes(item.ano, item.mes)));
  const anteriores = anterior?.mesesPendentes || [];
  const falhaInformada = Boolean(dados.falhaUpload);
  const falhaUpload = falhaInformada || Boolean(anterior?.falhaUpload && anteriores.some((ref) => !referencias.has(ref)));
  const mesesPendentes = [...new Set([...referencias, ...anteriores])].filter((ref) =>
    !folha.mesesConcluidos.includes(ref) || (falhaInformada && referencias.has(ref)) ||
    (anterior?.falhaUpload && !referencias.has(ref)));
  const processamentoPendente = folha.semDadosFolha || mesesPendentes.length > 0;
  const folhaStatus = falhaUpload || processamentoPendente ? FOLHA_STATUS.PENDENTE
    : referencias.size || anteriores.length ? FOLHA_STATUS.VERIFICADO : FOLHA_STATUS.SEM_DADOS;
  return {
    folha_status: folhaStatus,
    dados_folha: { ...dados, falhaUpload, processamentoPendente, mesesPendentes },
  };
}

async function prepararAtualizacaoFolha(apuracao, cliente, folha, estado) {
  if (folha.semDadosFolha || estado.dados_folha?.falhaUpload || estado.dados_folha?.processamentoPendente) {
    return { alteracoes: estado };
  }
  const janela = calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano);
  const { data: notas, error } = await coletarNotas(apuracao.cliente_id, janela.inicio,
    ultimoDiaDoMes(apuracao.periodo_ano, apuracao.periodo_mes));
  if (error) return { erro: "Erro ao buscar lançamentos fiscais", status: 500 };
  const bases = montarBasesCalculo({ notas, historicoReceita: cliente.historico_receita,
    dataInicioAtividade: cliente.data_inicio_atividade, mes: apuracao.periodo_mes, ano: apuracao.periodo_ano });
  if (bases.erro) return { erro: bases.erro, status: 422 };
  const resultado = calcularSimplesNacional({ rbt12: bases.rbt12, receita_mes: bases.receitaMes,
    anexo: "V", folha12: folha.folha12,
    baseFatorR: { folha: folha.folhaPeriodo, receita: bases.receitaPeriodo } });
  if (resultado.erro) return { erro: resultado.erro, status: 422 };
  const calculo = {
    rbt12_usado: resultado.rbt12_usado, receita_mes: resultado.receita_mes,
    anexo: resultado.anexo_efetivo, fator_r: resultado.fator_r, folha12: folha.folha12,
    aliquota_efetiva: resultado.aliquota_efetiva, valor_calculado: resultado.valor_das,
  };
  const mudou = Object.entries(calculo).some(([campo, valor]) =>
    campo === "anexo" ? apuracao[campo] !== valor : apuracao[campo] == null || Number(apuracao[campo]) !== valor);
  const alteracoes = { ...estado, ...calculo };
  if (mudou) {
    // A ação explícita Recalcular descarta o override (#609). A chegada
    // automática da folha preserva a decisão manual e audita a nova base.
    alteracoes.historico_edicoes = [...(apuracao.historico_edicoes || []), {
      tipo: "recalculo", origem: "folha",
      valor_anterior: apuracao.valor_editado ?? apuracao.valor_calculado,
      valor_novo: apuracao.valor_editado ?? resultado.valor_das,
      valor_calculado_anterior: apuracao.valor_calculado, valor_calculado_novo: resultado.valor_das,
      motivo: apuracao.valor_editado != null
        ? "Folha processada: cálculo atualizado e edição manual preservada"
        : "Recálculo automático após processamento da folha",
      editado_por: "sistema (folha)", editado_em: new Date().toISOString(),
    }];
  }
  return { alteracoes };
}

// Fechamento do fluxo assíncrono DAS-3: vale também quando o processamento
// termina depois do relatório do agente. Nunca modifica apuração aprovada.
export async function atualizarApuracoesAposFolha(clienteId, mesReferencia) {
  const { data: apuracoes, error } = await coletarPaginas(() => supabase.from("apuracoes")
    .select("*").eq("cliente_id", clienteId).eq("status", "rascunho")
    .not("fator_r", "is", null).order("id"));
  if (error) throw new Error(error.message);
  if (!apuracoes.length) return;
  const { data: cliente, error: erroCliente } = await supabase.from("clientes")
    .select("nome, historico_receita, data_inicio_atividade").eq("id", clienteId).maybeSingle();
  if (erroCliente || !cliente) throw new Error(erroCliente?.message || "Cliente não encontrado");
  for (const inicial of apuracoes) {
    if (!mesesFolhaEsperados(inicial.periodo_mes, inicial.periodo_ano, cliente.data_inicio_atividade)
      .has(mesReferencia.slice(0, 7))) continue;
    let apuracao = inicial;
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      if (!apuracao || apuracao.status !== "rascunho") break;
      const meses = mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, cliente.data_inicio_atividade);
      const mesesAtividade = meses.has(chaveMes(apuracao.periodo_ano, apuracao.periodo_mes)) ? 0 : meses.size < 12 ? meses.size : null;
      const folha = await coletarFolha12(clienteId,
        calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano),
        mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
      if (folha.erro) throw new Error(folha.erro);
      const preparado = await prepararAtualizacaoFolha(apuracao, cliente, folha, avaliarEstadoFolha(apuracao, folha));
      if (preparado.erro) throw new Error(preparado.erro);
      // Outros meses podem concluir juntos. Se outra chamada já aplicou o
      // mesmo cálculo/estado, não grava de novo nem disputa seu histórico.
      if (Object.entries(preparado.alteracoes).every(([campo, valor]) =>
        isDeepStrictEqual(apuracao[campo] ?? null, valor ?? null))) break;
      const { data, error: erroAtualizacao } = await supabase.from("apuracoes").update(preparado.alteracoes)
        .eq("id", apuracao.id).eq("cliente_id", clienteId).eq("status", "rascunho").eq("atualizado_em", apuracao.atualizado_em).select().maybeSingle();
      if (erroAtualizacao) throw new Error(erroAtualizacao.message);
      if (data) break;
      if (tentativa === 4) throw new Error("Apuração alterada durante atualização automática da folha");
      const atualizado = await supabase.from("apuracoes").select("*").eq("id", apuracao.id).eq("cliente_id", clienteId).maybeSingle();
      if (atualizado.error) throw new Error(atualizado.error.message);
      apuracao = atualizado.data;
    }
  }
}

export async function dispararApuracao(req, res) {
  const clienteId = resolverClienteIdBody(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  // BUG-APUR-13 / #613 — clienteId não-UUID vira 22P02 no Postgres e o
  // handler genérico respondia 500. Mesmo helper de lancamentos-fiscais /
  // conciliações (uuid.util.js).
  if (!ehUuid(clienteId)) {
    return res.status(400).json({ erro: "clienteId inválido" });
  }

  const { mes, ano, regime } = req.body;
  // Distinguir ausente (undefined/null/"") de fora de faixa (ex.: mes=0) —
  // `!mes` tratava 0 como ausente e devolvia mensagem enganosa (QA-F §F7 / #502).
  if (mes == null || mes === "" || ano == null || ano === "" || regime == null || regime === "") {
    return res.status(400).json({ erro: "mes, ano e regime são obrigatórios" });
  }

  if (!REGIMES_SUPORTADOS.has(regime)) {
    return res.status(422).json({ erro: "REGIME_NAO_SUPORTADO" });
  }

  const mesNum = inteiroEstrito(mes);
  const anoNum = inteiroEstrito(ano);

  // Mesmos limites da CHECK constraint em database/migrations/71.sql — falhar aqui
  // com 400 em vez de deixar o Postgres rejeitar o insert com um 500 genérico.
  if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12 || !Number.isInteger(anoNum) || anoNum < 2020 || anoNum > ANO_MAXIMO) {
    return res.status(400).json({ erro: "mes deve ser um inteiro entre 1 e 12, e ano deve ser entre 2020 e 2147483647" });
  }

  // Teto contra a data atual (#497). Sem isso, competência futura ou o mês
  // corrente ainda aberto entravam normalmente: a receita do mês e a janela de
  // RBT12 somam meses incompletos ou inexistentes, a alíquota efetiva sai
  // subestimada e o DAS resultante fica abaixo do devido — bastava errar o ano
  // no seletor. 422 (e não 400) porque mes/ano são estruturalmente válidos;
  // é a regra de negócio que recusa, como em REGIME_NAO_SUPORTADO.
  if (!competenciaEstaFechada(anoNum, mesNum)) {
    const ultima = ultimaCompetenciaFechada();
    return res.status(422).json({
      erro: "COMPETENCIA_NAO_FECHADA",
      competencia_maxima: chaveMes(ultima.ano, ultima.mes),
    });
  }

  const [{ data: existente, error: erroExistente }, { data: cliente, error: erroCliente }] = await Promise.all([
    supabase
      .from("apuracoes")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("periodo_mes", mesNum)
      .eq("periodo_ano", anoNum)
      .eq("regime", regime)
      .maybeSingle(),
    supabase
      .from("clientes")
      .select("nome, anexo_simples, regime_tributario, historico_receita, data_inicio_atividade")
      .eq("id", clienteId)
      .maybeSingle(),
  ]);

  if (erroExistente) {
    console.error("[apuracoes.controller] Erro ao verificar apuração existente:", erroExistente.message);
    return res.status(500).json({ erro: "Erro ao verificar apuração existente" });
  }

  if (existente) {
    return res.status(409).json({ erro: "Já existe uma apuração para este cliente, período e regime" });
  }

  if (erroCliente) {
    console.error("[apuracoes.controller] Erro ao buscar cliente:", erroCliente.message);
    return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
  }

  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  if (cliente.regime_tributario !== "simples_nacional") {
    return res.status(422).json({ erro: "REGIME_NAO_SUPORTADO" });
  }

  const janelaRbt12 = calcularJanela12MesesAnteriores(mesNum, anoNum);
  const fimMesAtual = ultimoDiaDoMes(anoNum, mesNum);

  const { data: notas, error: erroNotas } = await coletarNotas(clienteId, janelaRbt12.inicio, fimMesAtual);

  if (erroNotas) {
    console.error("[apuracoes.controller] Erro ao buscar lançamentos fiscais:", erroNotas.message);
    return res.status(500).json({ erro: "Erro ao buscar lançamentos fiscais" });
  }

  const bases = montarBasesCalculo({
    notas,
    historicoReceita: cliente.historico_receita,
    dataInicioAtividade: cliente.data_inicio_atividade,
    mes: mesNum,
    ano: anoNum,
  });

  if (bases.erro) {
    return res.status(422).json({ erro: bases.erro });
  }

  let folha12 = null;
  let semDadosFolha = false;
  let pendenteFolha = false;
  let folhaPeriodo = null;

  if (cliente.anexo_simples === "V") {
    const insumosFolha = await coletarFolha12(clienteId, janelaRbt12, bases.mesesAtividade, mesNum, anoNum);
    if (insumosFolha.erro) {
      return res.status(500).json({ erro: insumosFolha.erro });
    }
    ({ folha12, semDadosFolha, pendenteFolha, folhaPeriodo } = insumosFolha);
  }

  // Mês sem processamento vale zero (#726), mantendo a busca de arquivos
  // locais. Só um processamento existente ainda não concluído é provisório.
  const resultado = calcularSimplesNacional({
    rbt12: bases.rbt12,
    receita_mes: bases.receitaMes,
    anexo: cliente.anexo_simples,
    folha12,
    semDadosFolha,
    provisorioSemFolha: cliente.anexo_simples === "V" && semDadosFolha,
    baseFatorR: { folha: folhaPeriodo, receita: bases.receitaPeriodo },
  });

  if (resultado.erro) {
    return res.status(422).json({ erro: resultado.erro });
  }

  const { data, error } = await supabase
    .from("apuracoes")
    .insert({
      cliente_id: clienteId,
      periodo_mes: mesNum,
      periodo_ano: anoNum,
      regime,
      rbt12_usado: resultado.rbt12_usado,
      receita_mes: resultado.receita_mes,
      anexo: resultado.anexo_efetivo,
      fator_r: resultado.fator_r,
      folha12,
      // Mantém o polling dos meses ainda não verificados localmente. A folha
      // zero continua aprovável; falha conhecida exige reprocessamento.
      // Anexos I–IV: null explícito (BUG-APUR-11 / #611).
      folha_status: resolverFolhaStatus(cliente.anexo_simples, pendenteFolha),
      aliquota_efetiva: resultado.aliquota_efetiva,
      valor_calculado: resultado.valor_das,
      status: "rascunho",
    })
    .select()
    .single();

  if (error) {
    // unique_violation — corrida entre duas chamadas concorrentes pro mesmo período.
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Já existe uma apuração para este cliente, período e regime" });
    }
    console.error("[apuracoes.controller] Erro ao registrar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar apuração" });
  }

  return res.status(201).json(enriquecerApuracao(data, resultado, bases, cliente.nome));
}

export async function listarApuracoes(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  // BUG-APUR-13 / #613 — ver dispararApuracao.
  if (!ehUuid(clienteId)) {
    return res.status(400).json({ erro: "clienteId inválido" });
  }

  const { mes, ano } = req.query;
  const mesNum = mes === undefined ? null : inteiroEstrito(mes);
  const anoNum = ano === undefined ? null : inteiroEstrito(ano);

  if ((mes !== undefined && (mesNum === null || mesNum < 1 || mesNum > 12)) ||
      (ano !== undefined && (anoNum === null || anoNum < 2020 || anoNum > ANO_MAXIMO))) {
    return res.status(400).json({ erro: "mes deve ser um inteiro entre 1 e 12, e ano deve ser entre 2020 e 2147483647" });
  }

  let query = supabase
    .from("apuracoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("periodo_ano", { ascending: false })
    .order("periodo_mes", { ascending: false });

  if (mesNum !== null) query = query.eq("periodo_mes", mesNum);
  if (anoNum !== null) query = query.eq("periodo_ano", anoNum);

  const { data, error } = await query;

  if (error) {
    console.error("[apuracoes.controller] Erro ao listar apurações:", error.message);
    return res.status(500).json({ erro: "Erro ao listar apurações" });
  }

  return res.status(200).json((data || []).map((apuracao) => {
    const resultado = reconstruirCalculo(apuracao);
    return resultado.erro ? apuracao : { ...apuracao, aliquota_efetiva: resultado.aliquota_efetiva };
  }));
}

export async function detalharApuracao(req, res) {
  const { id } = req.params;

  // BUG-APUR-13 / #613 — id malformado responde igual a inexistente (404),
  // sem vazar existência nem cair no 500 do Postgres (22P02).
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { data, error } = await supabase.from("apuracoes").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  // Nunca revelar que o registro existe quando pertence a outro cliente — 404, não 403.
  if (!data || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && data.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const janelaRbt12 = calcularJanela12MesesAnteriores(data.periodo_mes, data.periodo_ano);
  const fimMesAtual = ultimoDiaDoMes(data.periodo_ano, data.periodo_mes);
  const [{ data: cliente, error: erroCliente }, { data: notas, error: erroNotas }] = await Promise.all([
    supabase
      .from("clientes")
      .select("nome, anexo_simples, historico_receita, data_inicio_atividade")
      .eq("id", data.cliente_id)
      .maybeSingle(),
    coletarNotas(data.cliente_id, janelaRbt12.inicio, fimMesAtual),
  ]);

  if (erroCliente || erroNotas) {
    console.error(
      "[apuracoes.controller] Erro ao reconstruir detalhamento:",
      erroCliente?.message || erroNotas?.message,
    );
    return res.status(500).json({ erro: "Erro ao buscar detalhamento da apuração" });
  }

  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  const bases = montarBasesCalculo({
    notas,
    historicoReceita: cliente.historico_receita,
    dataInicioAtividade: cliente.data_inicio_atividade,
    mes: data.periodo_mes,
    ano: data.periodo_ano,
  });

  if (bases.erro) {
    return res.status(422).json({ erro: bases.erro });
  }

  // O anexo persistido é o efetivo. Fator R preenchido identifica que o
  // cadastro original era Anexo V, inclusive quando ele permaneceu no V.
  const resultado = reconstruirCalculo(data);

  if (resultado.erro) {
    console.error("[apuracoes.controller] Apuração persistida com dados inválidos:", resultado.erro);
    return res.status(500).json({ erro: "Erro ao reconstruir cálculo da apuração" });
  }

  return res.status(200).json(enriquecerApuracao(data, resultado, bases, cliente.nome));
}

export async function editarApuracao(req, res) {
  const { id } = req.params;

  // BUG-APUR-13 / #613 — ver detalharApuracao.
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { valor_editado: valorEditado, motivo } = req.body;
  const motivoNormalizado = typeof motivo === "string" ? motivo.trim() : "";
  const valorNumerico = numeroNaoNegativo(valorEditado);

  if (!motivoNormalizado) {
    return res.status(400).json({ erro: "motivo é obrigatório" });
  }

  if (valorNumerico === null) {
    return res.status(400).json({ erro: "valor_editado deve ser um número não negativo" });
  }

  if (valorNumerico > VALOR_MAXIMO || valorNumerico !== Number(valorNumerico.toFixed(2))) {
    return res.status(400).json({ erro: "valor_editado deve ter até duas casas decimais e ser <= 9999999999999.99" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status, valor_editado, valor_calculado, historico_edicoes, atualizado_em, dados_folha")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser editada" });
  }

  const valorAnterior = apuracao.valor_editado ?? apuracao.valor_calculado;
  const historicoAtualizado = [
    ...(Array.isArray(apuracao.historico_edicoes) ? apuracao.historico_edicoes : []),
    {
      valor_anterior: valorAnterior,
      valor_novo: valorNumerico,
      motivo: motivoNormalizado,
      editado_por: req.usuario?.email || req.usuario?.id,
      editado_em: new Date().toISOString(),
    },
  ];

  const { data, error } = await supabase
    .from("apuracoes")
    .update({ valor_editado: valorNumerico, historico_edicoes: historicoAtualizado })
    .eq("id", id)
    .eq("status", "rascunho")
    .eq("atualizado_em", apuracao.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao editar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao editar apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração alterada por outra solicitação; atualize e tente novamente" });
  }

  return res.status(200).json(data);
}

export async function aprovarApuracao(req, res) {
  const { id } = req.params;

  // BUG-APUR-13 / #613 — ver detalharApuracao.
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status, periodo_mes, periodo_ano, folha_status, fator_r, folha12, atualizado_em, dados_folha")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já está aprovada" });
  }

  // Provisório legado ou arquivo com falha não pode ser aprovado. Ausência
  // legítima já calculada como folha zero é aprovável (#726).
  if (ehProvisorioSemFolha(apuracao) || apuracao.dados_folha?.falhaUpload || apuracao.dados_folha?.processamentoPendente) {
    return res.status(409).json({ erro: "FOLHA_PENDENTE" });
  }

  // Aprovar é o que transforma o rascunho em número oficial do cliente, então
  // a mesma regra da criação vale aqui (#497) — sem isso, os registros de
  // competência futura que já existem no banco (11/2026 no dev) continuariam
  // aprováveis, que é exatamente o sintoma relatado na issue.
  if (!competenciaEstaFechada(apuracao.periodo_ano, apuracao.periodo_mes)) {
    const ultima = ultimaCompetenciaFechada();
    return res.status(422).json({
      erro: "COMPETENCIA_NAO_FECHADA",
      competencia_maxima: chaveMes(ultima.ano, ultima.mes),
    });
  }

  if (apuracao.fator_r != null) {
    const { data: cliente, error: erroCliente } = await supabase.from("clientes")
      .select("data_inicio_atividade").eq("id", apuracao.cliente_id).maybeSingle();
    if (erroCliente) return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
    if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
    const meses = mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, cliente.data_inicio_atividade);
    const mesesAtividade = meses.has(chaveMes(apuracao.periodo_ano, apuracao.periodo_mes)) ? 0 : meses.size < 12 ? meses.size : null;
    const folha = await coletarFolha12(apuracao.cliente_id,
      calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano),
      mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
    if (folha.erro) return res.status(500).json({ erro: folha.erro });
    if (folha.semDadosFolha || folha.folha12 !== Number(apuracao.folha12)) {
      return res.status(409).json({ erro: "FOLHA_PENDENTE", motivo: "A folha mudou ou está em processamento; aguarde a atualização do cálculo" });
    }
  }

  const { data, error } = await supabase
    .from("apuracoes")
    .update({
      status: "aprovado",
      aprovado_por: req.usuario?.email || req.usuario?.id,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "rascunho")
    .eq("atualizado_em", apuracao.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao aprovar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao aprovar apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração alterada por outra solicitação; atualize e tente novamente" });
  }

  return res.status(200).json(data);
}

// Desfazer um rascunho (#500): sem isso, um cálculo errado só saía do banco
// sendo aprovado ou por SQL manual. Aprovada continua imutável — mesma trava
// de editarApuracao/aprovarApuracao.
export async function excluirApuracao(req, res) {
  const { id } = req.params;

  // BUG-APUR-13 / #613 — ver detalharApuracao.
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status, atualizado_em")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser excluída" });
  }

  // O .eq("status", "rascunho") fecha a corrida com uma aprovação concorrente
  // entre a leitura e o delete — mesmo padrão do update em aprovarApuracao.
  const { data, error } = await supabase
    .from("apuracoes")
    .delete()
    .eq("id", id)
    .eq("status", "rascunho")
    .eq("atualizado_em", apuracao.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao excluir apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao excluir apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração alterada por outra solicitação; atualize e tente novamente" });
  }

  return res.status(204).send();
}

// Refaz o cálculo com os dados atuais de lancamentos_fiscais/processamentos_folha
// — fecha o loop do #365: o agente só confirma que a folha existe localmente
// (resultado-folha), quem efetivamente traz os números pro banco é o upload em
// POST /folha/upload/agente; recalcular é o que lê esses números atualizados e
// substitui fator_r/aliquota_efetiva/valor_calculado.
export async function recalcularApuracao(req, res) {
  const { id } = req.params;

  // BUG-APUR-13 / #613 — ver detalharApuracao.
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("id, cliente_id, periodo_mes, periodo_ano, status, anexo, fator_r, valor_editado, valor_calculado, historico_edicoes, atualizado_em, dados_folha")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  if (!apuracao || (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE && apuracao.cliente_id !== req.usuario?.cliente_id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser recalculada" });
  }

  if (apuracao.dados_folha?.falhaUpload) {
    return res.status(409).json({ erro: "FOLHA_PENDENTE" });
  }

  // Mesma regra da criação (#497): registros de competência futura criados
  // antes desta validação (o Supabase de dev tem 11/2026 aprovado) não podem
  // ser recalculados sobre uma janela que ainda não fechou.
  if (!competenciaEstaFechada(apuracao.periodo_ano, apuracao.periodo_mes)) {
    const ultima = ultimaCompetenciaFechada();
    return res.status(422).json({
      erro: "COMPETENCIA_NAO_FECHADA",
      competencia_maxima: chaveMes(ultima.ano, ultima.mes),
    });
  }

  const { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .select("nome, historico_receita, data_inicio_atividade")
    .eq("id", apuracao.cliente_id)
    .maybeSingle();

  if (erroCliente) {
    console.error("[apuracoes.controller] Erro ao buscar cliente:", erroCliente.message);
    return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
  }

  if (!cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  // O anexo persistido é o efetivo — mesma reconstrução de detalharApuracao():
  // fator_r preenchido identifica que o cadastro original era Anexo V, mesmo
  // quando permaneceu no V.
  const anexoOriginal = apuracao.fator_r == null ? apuracao.anexo : "V";

  const janelaRbt12 = calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano);
  const fimMesAtual = ultimoDiaDoMes(apuracao.periodo_ano, apuracao.periodo_mes);

  const { data: notas, error: erroNotas } = await coletarNotas(apuracao.cliente_id, janelaRbt12.inicio, fimMesAtual);

  if (erroNotas) {
    console.error("[apuracoes.controller] Erro ao buscar lançamentos fiscais:", erroNotas.message);
    return res.status(500).json({ erro: "Erro ao buscar lançamentos fiscais" });
  }

  const bases = montarBasesCalculo({
    notas,
    historicoReceita: cliente.historico_receita,
    dataInicioAtividade: cliente.data_inicio_atividade,
    mes: apuracao.periodo_mes,
    ano: apuracao.periodo_ano,
  });

  if (bases.erro) {
    return res.status(422).json({ erro: bases.erro });
  }

  let folha12 = null;
  let semDadosFolha = false;
  let pendenteFolha = false;
  let folhaPeriodo = null;

  if (anexoOriginal === "V") {
    const insumosFolha = await coletarFolha12(apuracao.cliente_id, janelaRbt12, bases.mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
    if (insumosFolha.erro) {
      return res.status(500).json({ erro: insumosFolha.erro });
    }
    ({ folha12, semDadosFolha, pendenteFolha, folhaPeriodo } = insumosFolha);
    // A previously reported file is not an absent month. Recalculation must
    // wait for its successful processing, even with an older agent payload.
    const referenciasInformadas = [
      ...(apuracao.dados_folha?.mesesEncontrados || []).map((item) => chaveMes(item.ano, item.mes)),
      ...(apuracao.dados_folha?.mesesPendentes || []),
    ];
    if (referenciasInformadas.some((ref) => !insumosFolha.mesesConcluidos.includes(ref))) {
      return res.status(409).json({ erro: "FOLHA_PENDENTE" });
    }
  }

  const resultado = calcularSimplesNacional({
    rbt12: bases.rbt12,
    receita_mes: bases.receitaMes,
    anexo: anexoOriginal,
    folha12,
    semDadosFolha,
    baseFatorR: { folha: folhaPeriodo, receita: bases.receitaPeriodo },
  });

  if (resultado.erro) {
    return res.status(422).json({ erro: resultado.erro });
  }

  // Sempre registra o recálculo no histórico (BUG-APUR-09 / #609): o override
  // manual continua sendo descartado de propósito, mas a auditoria precisa
  // explicar a mudança de valor.
  const edicaoDescartada = apuracao.valor_editado != null;
  const historicoAnterior = Array.isArray(apuracao.historico_edicoes) ? apuracao.historico_edicoes : [];
  const historicoAtualizado = [
    ...historicoAnterior,
    {
      tipo: "recalculo",
      valor_anterior: apuracao.valor_editado ?? apuracao.valor_calculado,
      valor_novo: resultado.valor_das,
      motivo: edicaoDescartada
        ? "Recálculo descartou edição manual anterior"
        : "Recálculo automático",
      editado_por: req.usuario?.email || req.usuario?.id,
      editado_em: new Date().toISOString(),
    },
  ];

  // .eq("status", "rascunho") de novo: trava otimista contra uma aprovação que
  // aconteça entre o SELECT de cima e este UPDATE.
  const { data, error } = await supabase
    .from("apuracoes")
    .update({
      rbt12_usado: resultado.rbt12_usado,
      receita_mes: resultado.receita_mes,
      anexo: resultado.anexo_efetivo,
      fator_r: resultado.fator_r,
      folha12,
      // Mesma fila da criação: meses ainda não encontrados continuam no
      // polling; demais anexos não usam folha.
      folha_status: resolverFolhaStatus(anexoOriginal, pendenteFolha),
      aliquota_efetiva: resultado.aliquota_efetiva,
      valor_calculado: resultado.valor_das,
      // Um override manual anterior foi feito em cima do cálculo antigo — com
      // números novos de folha, ele deixa de fazer sentido sem revisão.
      valor_editado: null,
      historico_edicoes: historicoAtualizado,
      dados_folha: apuracao.dados_folha ? { ...apuracao.dados_folha, processamentoPendente: false, mesesPendentes: [] } : null,
    })
    .eq("id", id)
    .eq("status", "rascunho")
    .eq("atualizado_em", apuracao.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao recalcular apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao recalcular apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração alterada por outra solicitação; atualize e tente novamente" });
  }

  return res.status(200).json({
    ...enriquecerApuracao(data, resultado, bases, cliente.nome),
    edicao_descartada: edicaoDescartada,
  });
}

// Rota do agente — autenticada via x-licenca-token (polling), mesmo padrão de
// processos.controller.js (#273). Só apurações originadas de cliente Anexo V
// (fator_r preenchido — mesma inferência de detalharApuracao/recalcularApuracao)
// usam Fator R e precisam da folha dos últimos 12 meses.
// nomeEmpresa vai junto porque o agente localiza a pasta pelo nome da empresa,
// nunca pelo UUID de clienteId (mesmo padrão de estrutura_pastas.py).
export async function listarFolhaPendente(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { data, error } = await supabase
    .from("apuracoes")
    .select("id, cliente_id, periodo_mes, periodo_ano")
    .eq("cliente_id", licenca.cliente_id)
    .not("fator_r", "is", null)
    .eq("status", "rascunho")
    .eq("folha_status", FOLHA_STATUS.PENDENTE)
    .limit(LIMITE_APURACOES_POR_POLLING);

  if (error) {
    console.error("[apuracoes.controller] Erro ao listar apurações com folha pendente:", error.message);
    return res.status(500).json({ erro: "Erro ao listar apurações com folha pendente" });
  }

  let nomeEmpresa = null;
  let dataInicioAtividade = null;
  if ((data || []).length > 0) {
    const { data: cliente, error: erroCliente } = await supabase
      .from("clientes")
      .select("nome, data_inicio_atividade")
      .eq("id", licenca.cliente_id)
      .maybeSingle();

    if (erroCliente) {
      console.error("[apuracoes.controller] Erro ao buscar nome do cliente:", erroCliente.message);
      return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
    }

    nomeEmpresa = cliente?.nome ?? null;
    dataInicioAtividade = cliente?.data_inicio_atividade ?? null;
  }

  const apuracoes = (data || []).map((apuracao) => ({
    id: apuracao.id,
    clienteId: apuracao.cliente_id,
    nomeEmpresa,
    mes: apuracao.periodo_mes,
    ano: apuracao.periodo_ano,
    mesesFolha: [...mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, dataInicioAtividade)]
      .map((ref) => { const [ano, mes] = ref.split("-").map(Number); return { ano, mes }; }),
  }));

  return res.status(200).json(apuracoes);
}

// Rota do agente — reporta o que encontrou ao verificar as pastas locais de
// folha. Reconcilia o DAS quando os arquivos já foram efetivamente processados.
export async function registrarResultadoFolha(req, res) {
  return registrarResultadoFolhaTentativa(req, res, 0);
}

async function registrarResultadoFolhaTentativa(req, res, tentativa) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { id } = req.params;

  // BUG-APUR-13 / #613 — ver detalharApuracao.
  if (!ehUuid(id)) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  const { temDozeMeses, mesesEncontrados, totalMesesEncontrados, falhaUpload = false } = req.body || {};

  if (typeof temDozeMeses !== "boolean") {
    return res.status(400).json({ erro: "temDozeMeses deve ser booleano" });
  }

  if (!Array.isArray(mesesEncontrados)) {
    return res.status(400).json({ erro: "mesesEncontrados deve ser uma lista" });
  }

  if (!Number.isInteger(totalMesesEncontrados)) {
    return res.status(400).json({ erro: "totalMesesEncontrados deve ser um inteiro" });
  }

  if (totalMesesEncontrados !== mesesEncontrados.length) {
    return res.status(400).json({ erro: "totalMesesEncontrados não corresponde ao tamanho de mesesEncontrados" });
  }

  const referencias = new Set();
  for (const item of mesesEncontrados) {
    if (!item || !Number.isInteger(item.ano) || item.ano < 1 || item.ano > 9999 ||
        !Number.isInteger(item.mes) || item.mes < 1 || item.mes > 12) {
      return res.status(400).json({ erro: "mesesEncontrados deve conter ano e mês válidos" });
    }
    referencias.add(chaveMes(item.ano, item.mes));
  }
  if (referencias.size !== totalMesesEncontrados || totalMesesEncontrados > 12 ||
      temDozeMeses !== (totalMesesEncontrados === 12) || typeof falhaUpload !== "boolean") {
    return res.status(400).json({ erro: "Relatório de folha contraditório ou com meses repetidos" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[apuracoes.controller] Erro ao buscar apuração:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar apuração" });
  }

  // Nunca revelar que o registro existe quando pertence a outra licença — 404, não 403.
  if (!apuracao || apuracao.cliente_id !== licenca.cliente_id) {
    return res.status(404).json({ erro: "Apuração não encontrada" });
  }

  // fator_r preenchido = apuração originada de cliente Anexo V (mesma
  // inferência de detalharApuracao/recalcularApuracao) — coerente com o
  // filtro de listarFolhaPendente.
  if (apuracao.fator_r === null) {
    return res.status(400).json({ erro: "Apuração não é do Anexo V" });
  }

  // Mesma trava de editarApuracao/aprovarApuracao — DAS já aprovado não pode
  // ser reescrito por um relatório de folha atrasado do agente.
  if (apuracao.status === "aprovado") {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser alterada" });
  }

  const { data: cliente, error: erroCliente } = await supabase.from("clientes")
    .select("nome, historico_receita, data_inicio_atividade").eq("id", apuracao.cliente_id).maybeSingle();
  if (erroCliente) return res.status(500).json({ erro: "Erro ao buscar dados do cliente" });
  if (!cliente) return res.status(404).json({ erro: "Cliente não encontrado" });
  const esperados = mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, cliente?.data_inicio_atividade);
  if ([...referencias].some((ref) => !esperados.has(ref))) {
    return res.status(400).json({ erro: "mesesEncontrados fora da janela da apuração" });
  }
  const mesesAtividade = esperados.has(chaveMes(apuracao.periodo_ano, apuracao.periodo_mes))
    ? 0 : esperados.size < 12 ? esperados.size : null;
  const folha = await coletarFolha12(apuracao.cliente_id,
    calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano),
    mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
  if (folha.erro) return res.status(500).json({ erro: folha.erro });
  const estado = avaliarEstadoFolha(apuracao, folha, { temDozeMeses, mesesEncontrados, totalMesesEncontrados, falhaUpload });
  const preparado = await prepararAtualizacaoFolha(apuracao, cliente, folha, estado);
  if (preparado.erro) return res.status(preparado.status).json({ erro: preparado.erro });

  const { data, error } = await supabase
    .from("apuracoes")
    .update(preparado.alteracoes)
    .eq("id", id)
    .eq("status", "rascunho")
    .eq("atualizado_em", apuracao.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao registrar resultado de folha:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar resultado de folha" });
  }

  if (!data) {
    // O pipeline pode concluir durante o report. Relê o estado para preservar
    // seus dados/auditoria; uma aprovação concorrente continua retornando 409.
    if (tentativa < 4) return registrarResultadoFolhaTentativa(req, res, tentativa + 1);
    return res.status(409).json({ erro: "Apuração alterada por outra solicitação; atualize e tente novamente" });
  }

  return res.status(200).json(data);
}
