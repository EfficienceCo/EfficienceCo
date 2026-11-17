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

// `folha`: a folha viva da apuração (Anexo V em rascunho), ou null.
function enriquecerApuracao(apuracao, resultado, bases, clienteNome, folha = null) {
  return {
    ...comFolhaStatusCoerente(apuracao, folha),
    // Mesmo corpo do 409 FOLHA_PENDENTE que a aprovação devolveria agora (DAS-3).
    bloqueio_folha: folha ? bloqueioFolha(apuracao, folha) : null,
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

function mesesDaJanela(janelaRbt12, mesesAtividade, mes, ano) {
  return mesesAtividade === 0
    ? new Set([chaveMes(ano, mes)])
    : new Set([...janelaRbt12.meses].slice(-(mesesAtividade || 12)));
}

// Carga de folha (DAS-3): processamento mais recente de cada mês de `meses`
// (`processamentos` em criado_em decrescente) e, por processamento, a soma de
// base + FGTS das `linhas` de cálculo em centavos inteiros. A soma inteira não
// depende da ordem das linhas, então a carga de uma janela e a de várias
// janelas juntas (lista) dão a mesma FS12.
export function montarCargaFolha(meses, processamentos, linhas = []) {
  const porMes = new Map();
  for (const processamento of processamentos || []) {
    const referencia = processamento.mes_referencia?.slice(0, 7);
    if (meses.has(referencia) && !porMes.has(referencia)) porMes.set(referencia, processamento);
  }
  const centavosPorId = new Map();
  for (const linha of linhas || []) {
    const centavos = Math.round(Number(linha.base_calculo) * 100) + Math.round(Number(linha.fgts) * 100);
    centavosPorId.set(linha.processamento_id, (centavosPorId.get(linha.processamento_id) || 0) + centavos);
  }
  return { porMes, centavosPorId };
}

// Busca a carga de folha das `janelas` (lista de conjuntos de meses). Uma carga
// serve a todas as apurações do mesmo cliente (DAS-3: a lista avalia a folha
// viva sem uma consulta por linha). As linhas de folha_calculos só são lidas
// para as janelas com todos os processamentos concluídos: com um mês pendente,
// em processamento ou com erro, folhaDaJanela não calcula a FS12. Por isso
// `comCalculos: false` (fila do agente) basta para semDadosFolha/pendenteFolha
// e para a situação de cada mês, não para a FS12, que sai zerada.
async function carregarFolha(clienteId, janelas, { comCalculos = true } = {}) {
  const meses = new Set(janelas.flatMap((janela) => [...janela]));
  const referencias = [...meses].sort();
  const [anoFim, mesFim] = referencias.at(-1).split("-").map(Number);
  const { data: processamentos, error: erroProcessamentos } = await coletarPaginas(() => supabase
    .from("processamentos_folha")
    .select("id, mes_referencia, criado_em, status")
    .eq("cliente_id", clienteId)
    .gte("mes_referencia", `${referencias[0]}-01`)
    .lte("mes_referencia", ultimoDiaDoMes(anoFim, mesFim))
    .order("criado_em", { ascending: false })
    .order("id"));

  if (erroProcessamentos) {
    console.error("[apuracoes.controller] Erro ao buscar processamentos de folha:", erroProcessamentos.message);
    return { erro: "Erro ao buscar dados de folha" };
  }

  const carga = montarCargaFolha(meses, processamentos);
  const ids = !comCalculos ? [] : [...new Set(janelas.flatMap((janela) => {
    const daJanela = [...janela].map((ref) => carga.porMes.get(ref)).filter(Boolean);
    return daJanela.every((p) => (p.status ?? "concluido") === "concluido") ? daJanela.map((p) => p.id) : [];
  }))];
  if (!ids.length) return carga;
  const { data: linhas, error: erroCalculos } = await coletarPaginas(() => supabase.from("folha_calculos")
    .select("processamento_id, base_calculo, fgts").in("processamento_id", ids).order("id"));

  if (erroCalculos) {
    console.error("[apuracoes.controller] Erro ao buscar cálculos de folha:", erroCalculos.message);
    return { erro: "Erro ao buscar dados de folha" };
  }

  return montarCargaFolha(meses, processamentos, linhas);
}

// Months without a processing count as zero (#726). An existing failed or
// unfinished processing is different: it must remain retryable and provisional.
export function folhaDaJanela(meses, mesesAtividade, carga) {
  // Processamento mais recente de cada mês da janela (DAS-3): o criado_em
  // dele decide se uma falha de envio já foi substituída (falhasVigentes).
  const processamentoPorMes = new Map([...carga.porMes].filter(([ref]) => meses.has(ref)));
  // Situação do processamento mais recente de cada mês da janela (DAS-3): é
  // dela que sai o motivo do bloqueio. Mês ausente não aparece.
  const situacaoMeses = new Map([...processamentoPorMes].map(([ref, p]) => [ref, p.status ?? "concluido"]));
  if ([...situacaoMeses.values()].some((status) => status !== "concluido")) {
    const mesesConcluidos = [...situacaoMeses].filter(([, status]) => status === "concluido").map(([ref]) => ref);
    return { folha12: null, semDadosFolha: true, pendenteFolha: true, mesesConcluidos, mesesJanela: meses, situacaoMeses,
      ultimoProcessamento: processamentoPorMes };
  }

  // CPP effectively collected is not available in the current schema (DAS-6).
  // Annualize both bases by the same period, including the PA only on opening.
  const centavos = [...processamentoPorMes.values()].reduce((total, p) => total + (carga.centavosPorId.get(p.id) || 0), 0);
  const soma = centavos / 100;
  const divisor = mesesAtividade === 0 ? 1 : mesesAtividade;
  const folha12 = arredondar(divisor == null ? soma : (soma / divisor) * 12);
  return {
    folha12, semDadosFolha: false,
    folhaPeriodo: arredondar(soma),
    // Mês sem processamento é zero e não bloqueia a apuração (#726/#737).
    pendenteFolha: false,
    mesesConcluidos: [...processamentoPorMes.keys()],
    mesesJanela: meses,
    ultimoProcessamento: processamentoPorMes,
  };
}

async function coletarFolha12(clienteId, janelaRbt12, mesesAtividade = null, mes, ano) {
  const meses = mesesDaJanela(janelaRbt12, mesesAtividade, mes, ano);
  const carga = await carregarFolha(clienteId, [meses]);
  return carga.erro ? carga : folhaDaJanela(meses, mesesAtividade, carga);
}

// Janela de folha de uma apuração já gravada, com o cadastro atual.
function janelaDaApuracao(apuracao, cliente) {
  const esperados = mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, cliente.data_inicio_atividade);
  const mesesAtividade = esperados.has(chaveMes(apuracao.periodo_ano, apuracao.periodo_mes)) ? 0 : esperados.size < 12 ? esperados.size : null;
  const meses = mesesDaJanela(calcularJanela12MesesAnteriores(apuracao.periodo_mes, apuracao.periodo_ano),
    mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
  return { meses, mesesAtividade };
}

// Folha viva de uma apuração já gravada, com a janela do cadastro atual.
async function coletarFolhaDaApuracao(apuracao, cliente) {
  const { meses, mesesAtividade } = janelaDaApuracao(apuracao, cliente);
  const carga = await carregarFolha(apuracao.cliente_id, [meses]);
  return carga.erro ? carga : folhaDaJanela(meses, mesesAtividade, carga);
}

// Mesma folha viva, buscando o cadastro do cliente (aprovar, recalcular e PATCH).
async function folhaVivaDaApuracao(apuracao) {
  const { data: cliente, error } = await supabase.from("clientes")
    .select("data_inicio_atividade").eq("id", apuracao.cliente_id).maybeSingle();
  if (error) return { status: 500, erro: "Erro ao buscar dados do cliente" };
  if (!cliente) return { status: 404, erro: "Cliente não encontrado" };
  const folha = await coletarFolhaDaApuracao(apuracao, cliente);
  return folha.erro ? { status: 500, erro: folha.erro } : { folha };
}

// Folha viva de todas as apurações de uma lista do mesmo cliente, com uma carga
// só de processamentos e cálculos (DAS-3). Devolve Map(id da apuração → folha).
// `cadastro` (com data_inicio_atividade) evita reler o cliente quando a rota
// já o buscou; `opcoes` vai para carregarFolha.
async function folhasVivasDoCliente(clienteId, apuracoes, cadastro = null, opcoes = {}) {
  const alvo = apuracoes.filter((a) => a.fator_r != null && a.status === "rascunho");
  if (!alvo.length) return { folhas: new Map() };
  const { data: cliente, error } = cadastro ? { data: cadastro, error: null } : await supabase.from("clientes")
    .select("data_inicio_atividade").eq("id", clienteId).maybeSingle();
  if (error) return { erro: "Erro ao buscar dados do cliente" };
  const janelas = alvo.map((a) => [a, janelaDaApuracao(a, cliente)]);
  const carga = await carregarFolha(clienteId, janelas.map(([, j]) => j.meses), opcoes);
  if (carga.erro) return carga;
  return { folhas: new Map(janelas.map(([a, j]) => [a.id, folhaDaJanela(j.meses, j.mesesAtividade, carga)])) };
}

const refsDosMeses = (itens) => (itens || []).map((item) => chaveMes(item.ano, item.mes));
const mesesDasRefs = (refs) => [...refs].sort().map((ref) => {
  const [ano, mes] = ref.split("-").map(Number);
  return { ano, mes };
});

// Meses da janela com falha de envio ainda vigente (DAS-3). É a fonte única do
// estado gravado, da fila do agente, do 409 e do bloqueio_folha. Desde a DAS-3
// o relatório traz `mesesComFalha`, e o estado gravado guarda o conjunto
// acumulado no mesmo campo. Linha do agente antigo (sem o campo): todo mês
// relatado conta como falho, porque não se sabe qual arquivo falhou (custa um
// reenvio; aceitar a folha antiga do mês custaria um DAS errado).
//
// O mês sai da falha num relatório que o traga sem falha (avaliarEstadoFolha)
// ou quando o processamento mais recente dele foi criado depois da falha: a
// planilha nova, venha do agente, do watcher ou da tela, substitui a que
// falhou, e o mês passa a valer pela situação dela (concluída, com erro ou em
// processamento). `marcosFalha[mês]` é o criado_em do processamento mais
// recente do mês na leitura do relatório que registrou a falha (null: não
// havia nenhum), então a folha antiga do mês (cenário A) e a planilha boa do
// mesmo ciclo (cenário B), criadas antes do relatório, não tiram o mês da
// falha. Linha gravada antes do marco: vale o atualizado_em da apuração, que
// nunca é anterior ao relatório que gravou a falha (toda gravação o avança).
//
// `semMes`: falha gravada sem nenhum mês da janela (linha do agente antigo que
// só relatou o próprio PA). Não há mês a substituir; só um relatório a resolve.
function falhasVigentes(apuracao, folha) {
  const dados = apuracao.dados_folha;
  if (!dados?.falhaUpload) return { marcos: {}, semMes: false };
  const registradas = refsDosMeses(dados.mesesComFalha ?? dados.mesesEncontrados).filter((ref) => folha.mesesJanela.has(ref));
  const marcos = {};
  for (const ref of registradas) {
    const marco = dados.marcosFalha && ref in dados.marcosFalha ? dados.marcosFalha[ref] : apuracao.atualizado_em;
    const ultimo = folha.ultimoProcessamento.get(ref);
    // Date.parse corta os microssegundos do banco: um processamento no mesmo
    // milissegundo do marco não conta como posterior (o lado conservador), e
    // um valor ilegível dá NaN, que nunca é posterior.
    if (ultimo && (marco === null || Date.parse(ultimo.criado_em) > Date.parse(marco))) continue;
    marcos[ref] = marco;
  }
  return { marcos, semMes: registradas.length === 0 };
}

function avaliarEstadoFolha(apuracao, folha, relatorio = null) {
  const anterior = apuracao.dados_folha;
  if (!relatorio && !anterior?.mesesEncontrados) {
    // Sem relatório do agente, o estado vem só da folha viva: folha já
    // recebida e ainda em processamento (ou com erro) deixa a apuração
    // pendente. dados_folha é o relatório do agente e fica null; a fila
    // (listarFolhaPendente), o 409 e a aprovação leem a situação de cada mês
    // em processamentos_folha (DAS-3).
    return { folha_status: resolverFolhaStatus("V", folha.pendenteFolha), dados_folha: null };
  }
  // Relatório antigo pode trazer mês fora da janela (o agente varria o próprio
  // PA). Esse mês nunca terá folha na janela e não pode bloquear para sempre.
  const naJanela = (ref) => folha.mesesJanela.has(ref);
  const vigentes = falhasVigentes(apuracao, folha);
  let dados = anterior;
  let { marcos, semMes } = vigentes;
  // `marcosFalha` gravado guarda as falhas do último relatório, mesmo as que
  // uma planilha nova já substituiu (só um relatório o reescreve).
  let registro = { ...anterior?.marcosFalha, ...marcos };
  if (relatorio) {
    const relatados = refsDosMeses(relatorio.mesesEncontrados);
    // Falha de envio: os meses que o agente diz que falharam; sem o campo
    // (agente antigo), todos os relatados. O marco de cada uma sai da folha
    // lida agora, do relógio do banco.
    const falhasDoRelatorio = relatorio.falhaUpload ? refsDosMeses(relatorio.mesesComFalha ?? relatorio.mesesEncontrados) : [];
    marcos = Object.fromEntries([
      ...falhasDoRelatorio.map((ref) => [ref, folha.ultimoProcessamento.get(ref)?.criado_em ?? null]),
      ...Object.entries(vigentes.marcos).filter(([ref]) => !relatados.includes(ref)),
    ]);
    semMes = false;
    registro = marcos;
    // Depois de uma falha, a fila só pediu os meses com falha. O relatório
    // dessa nova tentativa soma-se aos meses já relatados, em vez de reduzir
    // a janela relatada ao que foi pedido. Vale também quando a planilha que
    // o agente acabou de reenviar já substituiu a falha antes deste relatório.
    const emTentativa = anterior?.falhaUpload || Object.keys(anterior?.marcosFalha ?? {}).length > 0;
    const encontrados = emTentativa
      ? new Set([...refsDosMeses(anterior.mesesEncontrados).filter(naJanela), ...relatados])
      : null;
    dados = encontrados
      ? { ...relatorio, temDozeMeses: encontrados.size === 12, mesesEncontrados: mesesDasRefs(encontrados), totalMesesEncontrados: encontrados.size }
      : relatorio;
  }
  // Todo mês com falha é um mês relatado (a rota exige), então já está em
  // `referencias` abaixo.
  const emFalha = new Set(Object.keys(marcos));
  const referencias = new Set(refsDosMeses(dados.mesesEncontrados).filter(naJanela));
  const anteriores = (anterior?.mesesPendentes || []).filter(naJanela);
  const falhaUpload = emFalha.size > 0 || semMes;
  const mesesPendentes = [...new Set([...referencias, ...anteriores])].filter((ref) =>
    !folha.mesesConcluidos.includes(ref) || emFalha.has(ref)).sort();
  const processamentoPendente = folha.semDadosFolha || mesesPendentes.length > 0;
  const folhaStatus = falhaUpload || processamentoPendente ? FOLHA_STATUS.PENDENTE
    : referencias.size || anteriores.length ? FOLHA_STATUS.VERIFICADO : FOLHA_STATUS.SEM_DADOS;
  return {
    folha_status: folhaStatus,
    dados_folha: {
      ...dados, falhaUpload, processamentoPendente, mesesPendentes, mesesComFalha: mesesDasRefs(emFalha),
      ...(Object.keys(registro).length ? { marcosFalha: registro } : {}),
    },
  };
}

// Motivos do 409 FOLHA_PENDENTE (#738 e DAS-3), um para cada situação da folha.
const MOTIVO_EM_PROCESSAMENTO = "A folha ainda aguarda confirmação ou processamento.";
const MOTIVO_ERRO_PROCESSAMENTO = "Folha com erro no processamento; corrija a planilha e envie de novo pela tela de Folha.";
const MOTIVO_NAO_RECEBIDA = "Folha encontrada pelo agente que não chegou ao sistema; envie a planilha pela tela de Folha.";
const MOTIVO_RECALCULAR = "Este DAS foi calculado com outra folha; use Recalcular para refazê-lo (mês sem folha conta como zero).";

// Falha de envio sai da pendência num relatório do agente que traga o mês sem
// falha ou com uma planilha nova do mês, criada depois da falha (falhasVigentes):
// o texto oferece os dois caminhos. Linha antiga com falha sem mês da janela:
// não há mês a substituir pela tela, só o agente a resolve; texto sem pasta.
function motivoFalhaEnvio(meses) {
  if (!meses.length) {
    return "O agente não conseguiu enviar arquivos de folha. Corrija ou recoloque os arquivos na pasta Folha do computador do escritório para o agente reenviá-los na próxima verificação.";
  }
  const pastas = meses.map((ref) => `Folha/${ref}`).join(", ");
  return `O agente não conseguiu enviar a planilha destes meses. Corrija ou recoloque o arquivo ${meses.length > 1 ? "nas pastas" : "na pasta"} ${pastas} do computador do escritório, ou envie a planilha certa pela tela de Folha.`;
}

// 409 FOLHA_PENDENTE a partir do estado vivo da folha (`folha`, de
// coletarFolha12): os meses da janela que barram a aprovação e o que fazer em
// cada um. Cada situação entra com o seu texto e os seus meses, nesta ordem:
// falha de envio, erro de processamento, processamento em andamento e
// planilha relatada que não chegou. Sem nenhum mês, o DAS foi calculado com
// outra folha e o caminho é recalcular.
function respostaPendenciasFolha(apuracao, folha) {
  const dados = apuracao.dados_folha || {};
  // Meses que o agente relatou e ainda faltam, e os que estão com falha de
  // envio, pela mesma regra que grava o estado e monta a fila
  // (avaliarEstadoFolha), com a folha de agora.
  const avaliado = dados.mesesEncontrados ? avaliarEstadoFolha(apuracao, folha).dados_folha : null;
  const comFalha = new Set(refsDosMeses(avaliado?.mesesComFalha));
  const situacao = folha.situacaoMeses ?? new Map();
  const grupos = { falha: [], erro: [], processamento: [], naoRecebida: [] };
  // Só há situação quando algum mês não concluiu (folhaDaJanela). Mês com
  // falha de envio vigente fica no grupo da falha, mesmo com um processamento
  // anterior à falha ainda em andamento: é uma planilha nova que o resolve.
  for (const [ref, status] of situacao) {
    if (status === "concluido" || comFalha.has(ref)) continue;
    grupos[status === "erro" ? "erro" : "processamento"].push(ref);
  }
  for (const ref of avaliado?.mesesPendentes ?? []) {
    if (comFalha.has(ref)) grupos.falha.push(ref);
    else if (!situacao.has(ref)) grupos.naoRecebida.push(ref);
  }
  const segmentos = [];
  if (avaliado?.falhaUpload) segmentos.push([motivoFalhaEnvio(grupos.falha), grupos.falha]);
  if (grupos.erro.length) segmentos.push([MOTIVO_ERRO_PROCESSAMENTO, grupos.erro]);
  if (grupos.processamento.length) segmentos.push([MOTIVO_EM_PROCESSAMENTO, grupos.processamento]);
  if (grupos.naoRecebida.length) segmentos.push([MOTIVO_NAO_RECEBIDA, grupos.naoRecebida]);
  if (!segmentos.length) segmentos.push([MOTIVO_RECALCULAR, []]);
  return {
    erro: "FOLHA_PENDENTE",
    motivo: segmentos.map(([texto, meses]) => (meses.length ? `${texto} Meses pendentes: ${[...meses].sort().join(", ")}.` : texto)).join(" "),
    mesesPendentes: [...new Set(segmentos.flatMap(([, meses]) => meses))].sort(),
  };
}

// Regra única da aprovação (DAS-3): a mesma condição barra o PATCH /aprovar,
// explica o 409 e impede que a API diga "verificado". Vale o estado da folha
// de agora, pela mesma regra que o grava (avaliarEstadoFolha), e não o gravado,
// que fica para trás quando um gancho da folha falha ou quando uma planilha
// nova substitui uma falha de envio. Vale também a folha viva (`folha`)
// diferente da do cálculo: mês em processamento ou com erro dá folha12 null;
// folha concluída que mudou dá outra FS12.
function folhaBarraAprovacao(apuracao, folha) {
  if (apuracao.fator_r == null || apuracao.status === "aprovado") return false;
  const vivo = avaliarEstadoFolha(apuracao, folha).dados_folha || {};
  return Boolean(ehProvisorioSemFolha(apuracao) || vivo.falhaUpload || vivo.processamentoPendente ||
    folha.folha12 !== Number(apuracao.folha12));
}

function bloqueioFolha(apuracao, folha) {
  return folhaBarraAprovacao(apuracao, folha) ? respostaPendenciasFolha(apuracao, folha) : null;
}

// folha_status que a API devolve (DAS-3). Rascunho do Anexo V (`folha`, a folha
// viva): o da folha de agora, pela regra que o grava, e nunca "verificado" com
// a aprovação barrada. Sem relatório do agente, o gravado pode ser um "pendente"
// que ficou para trás (o gancho do fim do pipeline falhou). "aprovado" nunca
// sai como "pendente" (aprovação anterior ao status final).
function comFolhaStatusCoerente(apuracao, folha) {
  if (apuracao.status === "aprovado") {
    return apuracao.fator_r != null && apuracao.folha_status === FOLHA_STATUS.PENDENTE
      ? { ...apuracao, folha_status: FOLHA_STATUS.SEM_DADOS } : apuracao;
  }
  if (!folha || apuracao.fator_r == null) return apuracao;
  const vivo = avaliarEstadoFolha(apuracao, folha).folha_status;
  const folhaStatus = vivo === FOLHA_STATUS.VERIFICADO && folhaBarraAprovacao(apuracao, folha) ? FOLHA_STATUS.PENDENTE : vivo;
  return folhaStatus === apuracao.folha_status ? apuracao : { ...apuracao, folha_status: folhaStatus };
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
    await reconciliarApuracao(inicial, cliente);
  }
}

// Aplica à apuração o estado e o cálculo da folha de agora, sem relatório
// novo (gancho da folha e fim do relatório do agente). Devolve a linha final.
async function reconciliarApuracao(inicial, cliente) {
  let apuracao = inicial;
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    if (!apuracao || apuracao.status !== "rascunho") break;
    const folha = await coletarFolhaDaApuracao(apuracao, cliente);
    if (folha.erro) throw new Error(folha.erro);
    const preparado = await prepararAtualizacaoFolha(apuracao, cliente, folha, avaliarEstadoFolha(apuracao, folha));
    if (preparado.erro) throw new Error(preparado.erro);
    // Outros meses podem concluir juntos. Se outra chamada já aplicou o
    // mesmo cálculo/estado, não grava de novo nem disputa seu histórico.
    if (Object.entries(preparado.alteracoes).every(([campo, valor]) =>
      isDeepStrictEqual(apuracao[campo] ?? null, valor ?? null))) break;
    const { data, error: erroAtualizacao } = await supabase.from("apuracoes").update(preparado.alteracoes)
      .eq("id", apuracao.id).eq("cliente_id", apuracao.cliente_id).eq("status", "rascunho").eq("atualizado_em", apuracao.atualizado_em).select().maybeSingle();
    if (erroAtualizacao) throw new Error(erroAtualizacao.message);
    if (data) return data;
    if (tentativa === 4) throw new Error("Apuração alterada durante atualização automática da folha");
    const atualizado = await supabase.from("apuracoes").select("*").eq("id", apuracao.id).eq("cliente_id", apuracao.cliente_id).maybeSingle();
    if (atualizado.error) throw new Error(atualizado.error.message);
    apuracao = atualizado.data;
  }
  return apuracao;
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
  // Folha viva da criação: também dá o bloqueio_folha do 201 (DAS-3).
  let insumosFolha = null;

  if (cliente.anexo_simples === "V") {
    insumosFolha = await coletarFolha12(clienteId, janelaRbt12, bases.mesesAtividade, mesNum, anoNum);
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

  return res.status(201).json(enriquecerApuracao(data, resultado, bases, cliente.nome, insumosFolha));
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

  // A lista diz o mesmo que a aprovação acharia agora (DAS-3): folha viva das
  // apurações em rascunho, numa carga só para o cliente.
  const vivas = await folhasVivasDoCliente(clienteId, data || []);
  if (vivas.erro) return res.status(500).json({ erro: vivas.erro });

  return res.status(200).json((data || []).map((linha) => {
    const folha = vivas.folhas.get(linha.id);
    const apuracao = comFolhaStatusCoerente(linha, folha);
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

  // O detalhe mostra o mesmo bloqueio e o mesmo folha_status que a aprovação
  // acharia agora (DAS-3).
  let folha = null;
  if (data.fator_r != null && data.status === "rascunho") {
    folha = await coletarFolhaDaApuracao(data, cliente);
    if (folha.erro) return res.status(500).json({ erro: folha.erro });
  }

  return res.status(200).json(enriquecerApuracao(data, resultado, bases, cliente.nome, folha));
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
    .select("cliente_id, status, periodo_mes, periodo_ano, fator_r, folha12, valor_editado, valor_calculado, historico_edicoes, atualizado_em, dados_folha")
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

  // A folha viva é lida antes de gravar (DAS-3): uma falha aqui responde 500
  // sem a edição salva, e a nova tentativa não duplica o historico_edicoes. A
  // edição não muda a folha nem a FS12, então o que foi lido vale na resposta.
  let folha = null;
  if (apuracao.fator_r != null) {
    const viva = await folhaVivaDaApuracao(apuracao);
    if (viva.erro) return res.status(viva.status).json({ erro: viva.erro });
    folha = viva.folha;
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

  return res.status(200).json(comFolhaStatusCoerente(data, folha));
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

  // Provisório, arquivo com falha, folha em processamento ou mudada depois do
  // cálculo não pode ser aprovado; o 409 diz qual folha e de quais meses
  // (DAS-3). Ausência legítima já calculada como folha zero é aprovável (#726).
  let folhaStatus = apuracao.folha_status;
  if (apuracao.fator_r != null) {
    const viva = await folhaVivaDaApuracao(apuracao);
    if (viva.erro) return res.status(viva.status).json({ erro: viva.erro });
    const bloqueio = bloqueioFolha(apuracao, viva.folha);
    if (bloqueio) return res.status(409).json(bloqueio);
    // A aprovação grava o folha_status da folha de agora (DAS-3), que nunca é
    // "pendente" sem bloqueio. O gravado pode ter ficado "pendente" quando o
    // gancho do fim do pipeline falhou, ou numa linha anterior ao #737 (mês sem
    // folha deixava a apuração na fila do agente, hoje folha zero aprovável).
    folhaStatus = comFolhaStatusCoerente(apuracao, viva.folha).folha_status;
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

  const { data, error } = await supabase
    .from("apuracoes")
    .update({
      status: "aprovado",
      aprovado_por: req.usuario?.email || req.usuario?.id,
      aprovado_em: new Date().toISOString(),
      ...(folhaStatus !== apuracao.folha_status ? { folha_status: folhaStatus } : {}),
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
    // Mesmo corpo da aprovação, com a folha viva (DAS-3). Falha que uma
    // planilha nova já substituiu não espera mais (falhasVigentes).
    const viva = await folhaVivaDaApuracao(apuracao);
    if (viva.erro) return res.status(viva.status).json({ erro: viva.erro });
    if (avaliarEstadoFolha(apuracao, viva.folha).dados_folha.falhaUpload) {
      return res.status(409).json(respostaPendenciasFolha(apuracao, viva.folha));
    }
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
  let dadosFolha = apuracao.dados_folha;

  if (anexoOriginal === "V") {
    const insumosFolha = await coletarFolha12(apuracao.cliente_id, janelaRbt12, bases.mesesAtividade, apuracao.periodo_mes, apuracao.periodo_ano);
    if (insumosFolha.erro) {
      return res.status(500).json({ erro: insumosFolha.erro });
    }
    ({ folha12, semDadosFolha, pendenteFolha, folhaPeriodo } = insumosFolha);
    // A previously reported file is not an absent month. Recalculation must
    // wait for its successful processing, even with an older agent payload.
    // Mês fora da janela (relatório antigo) nunca chega e não pode travar.
    const referenciasInformadas = [
      ...(apuracao.dados_folha?.mesesEncontrados || []).map((item) => chaveMes(item.ano, item.mes)),
      ...(apuracao.dados_folha?.mesesPendentes || []),
    ].filter((ref) => insumosFolha.mesesJanela.has(ref));
    // Folha conhecida e não concluída também espera, com o mesmo corpo da
    // aprovação, em vez do 422 FATOR_R_SEM_FOLHA sem explicação (DAS-3).
    if (semDadosFolha || referenciasInformadas.some((ref) => !insumosFolha.mesesConcluidos.includes(ref))) {
      return res.status(409).json(respostaPendenciasFolha(apuracao, insumosFolha));
    }
    // O relatório gravado com o estado da folha de agora: sai a falha que uma
    // planilha nova já substituiu (DAS-3).
    if (dadosFolha?.mesesEncontrados) dadosFolha = avaliarEstadoFolha(apuracao, insumosFolha).dados_folha;
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
      dados_folha: dadosFolha ? { ...dadosFolha, processamentoPendente: false, mesesPendentes: [] } : null,
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

  // DAS-3 (causa 4): fica fora da fila a folha que o backend já recebeu e
  // ainda processa (ou deu erro). O agente não move as planilhas e as
  // reenviaria a cada poll. Falha de envio continua na fila para nova
  // tentativa. O folha_status gravado só faz a pré-seleção: quem decide é a
  // folha viva, pela regra que grava o estado (avaliarEstadoFolha). Como
  // linhas saem depois da consulta, o limite vale para a fila, não para ela.
  const { data: candidatas, error } = await coletarPaginas(() => supabase
    .from("apuracoes")
    .select("id, cliente_id, periodo_mes, periodo_ano, status, fator_r, dados_folha, atualizado_em")
    .eq("cliente_id", licenca.cliente_id)
    .not("fator_r", "is", null)
    .eq("status", "rascunho")
    .eq("folha_status", FOLHA_STATUS.PENDENTE)
    .or("dados_folha->>processamentoPendente.is.null,dados_folha->>processamentoPendente.eq.false,dados_folha->>falhaUpload.eq.true")
    .order("id"));

  if (error) {
    console.error("[apuracoes.controller] Erro ao listar apurações com folha pendente:", error.message);
    return res.status(500).json({ erro: "Erro ao listar apurações com folha pendente" });
  }

  // Sem relatório do agente, a folha viva só deixa a apuração "pendente" com
  // uma planilha que o backend já recebeu e que não concluiu; fora isso ela é
  // "verificado" (mês sem folha vale zero, #737). Nos dois casos não há o que
  // pedir ao agente, nem quando o gravado ficou "pendente" porque o gancho do
  // fim do pipeline falhou (ou é anterior ao #737). Por isso essas linhas não
  // entram, e a folha delas nem é lida.
  let data = (candidatas || []).filter((apuracao) => apuracao.dados_folha?.mesesEncontrados);
  let nomeEmpresa = null;
  let dataInicioAtividade = null;
  const vigentes = new Map();
  if (data.length > 0) {
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

    // Falha de envio: a folha viva diz se uma planilha nova já a substituiu
    // (falhasVigentes). Basta o criado_em e a situação dos processamentos: as
    // linhas de folha_calculos não são lidas a cada poll.
    const comFalha = data.filter((apuracao) => apuracao.dados_folha.falhaUpload);
    const vivas = await folhasVivasDoCliente(licenca.cliente_id, comFalha,
      { data_inicio_atividade: dataInicioAtividade }, { comCalculos: false });
    if (vivas.erro) {
      console.error("[apuracoes.controller] Erro ao conferir a folha das apurações pendentes:", vivas.erro);
      return res.status(500).json({ erro: "Erro ao listar apurações com folha pendente" });
    }
    for (const apuracao of comFalha) {
      const vivo = avaliarEstadoFolha(apuracao, vivas.folhas.get(apuracao.id)).dados_folha;
      if (vivo.falhaUpload) vigentes.set(apuracao.id, refsDosMeses(vivo.mesesComFalha));
    }
    // Linha com relatório sem falha gravada: só a de antes do #738 (o
    // relatório só trocava o status) passa pela consulta; segue pedindo a janela.
    data = data.filter((apuracao) => !apuracao.dados_folha.falhaUpload || vigentes.has(apuracao.id))
      .slice(0, LIMITE_APURACOES_POR_POLLING);
  }

  const apuracoes = data.map((apuracao) => {
    const esperados = mesesFolhaEsperados(apuracao.periodo_mes, apuracao.periodo_ano, dataInicioAtividade);
    // DAS-3 (causa 4): depois de uma falha de envio, a nova tentativa só
    // procura os meses com falha vigente, a mesma lista do estado gravado e
    // do 409 (falhasVigentes). Os meses enviados com sucesso não voltam a cada
    // poll; o que falhou segue pedido, mesmo com folha antiga no sistema, até
    // um relatório trazê-lo sem falha ou chegar uma planilha nova do mês. Falha
    // gravada sem mês da janela (linha do agente antigo que só relatou o
    // próprio PA) pede a janela inteira, para nunca mandar o agente procurar nada.
    const comFalha = vigentes.get(apuracao.id) ?? [];
    return {
      id: apuracao.id,
      clienteId: apuracao.cliente_id,
      nomeEmpresa,
      mes: apuracao.periodo_mes,
      ano: apuracao.periodo_ano,
      mesesFolha: mesesDasRefs(comFalha.length ? comFalha : esperados),
    };
  });

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

  const { temDozeMeses, mesesEncontrados, totalMesesEncontrados, falhaUpload = false, mesesComFalha } = req.body || {};

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

  // DAS-3: `mesesComFalha` é opcional (o agente antigo não manda). Quando vem,
  // são os meses com algum arquivo não enviado: cada um precisa ser um mês
  // relatado (logo, da janela, conferida abaixo), sem repetição, e a lista só
  // fica vazia sem falha de envio. Fora disso, 400, como o resto do relatório.
  if (mesesComFalha !== undefined) {
    if (!Array.isArray(mesesComFalha)) {
      return res.status(400).json({ erro: "mesesComFalha deve ser uma lista" });
    }
    const comFalha = new Set();
    for (const item of mesesComFalha) {
      if (!item || !Number.isInteger(item.ano) || !Number.isInteger(item.mes) || !referencias.has(chaveMes(item.ano, item.mes))) {
        return res.status(400).json({ erro: "mesesComFalha deve conter meses de mesesEncontrados" });
      }
      comFalha.add(chaveMes(item.ano, item.mes));
    }
    if (comFalha.size !== mesesComFalha.length || falhaUpload !== comFalha.size > 0) {
      return res.status(400).json({ erro: "Relatório de folha contraditório ou com meses repetidos" });
    }
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
  const estado = avaliarEstadoFolha(apuracao, folha, {
    temDozeMeses, mesesEncontrados, totalMesesEncontrados, falhaUpload,
    ...(mesesComFalha !== undefined ? { mesesComFalha } : {}),
  });
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

  // A folha acima foi lida antes desta gravação. Se ainda havia mês em
  // processamento, ele pode ter concluído no meio, com o gancho do pipeline
  // lendo a apuração anterior a este relatório: reconcilia com a folha de
  // agora (DAS-3). Falha aqui não desfaz o relatório já gravado.
  if (data.dados_folha?.processamentoPendente) {
    try {
      return res.status(200).json(await reconciliarApuracao(data, cliente));
    } catch (err) {
      console.error("[apuracoes.controller] Erro ao reconciliar apuração após relatório de folha:", err.message);
    }
  }
  return res.status(200).json(data);
}
