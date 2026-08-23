import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { calcularSimplesNacional } from "../utils/simples-nacional.util.js";
import { ultimoDiaDoMes } from "../utils/periodo.util.js";

const REGIMES_SUPORTADOS = new Set(["simples_nacional"]);

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

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function inteiroEstrito(valor) {
  if (typeof valor === "string" && !/^\d+$/.test(valor.trim())) return null;
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : null;
}

function numeroNaoNegativo(valor) {
  if (typeof valor === "string") {
    const normalizado = valor.trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizado)) return null;
    valor = normalizado;
  } else if (typeof valor !== "number") {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function chaveMes(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
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

function somarHistoricoReceita(historico, mesesEsperados, mesesComNotas) {
  if (historico == null) return { total: 0, receitasUsadas: new Map() };
  if (!Array.isArray(historico)) return { erro: "HISTORICO_RECEITA_INVALIDO" };

  const receitasPorMes = new Map();

  for (const entrada of historico) {
    const mes = inteiroEstrito(entrada?.mes);
    const ano = inteiroEstrito(entrada?.ano);
    const receita = numeroNaoNegativo(entrada?.receita);

    if (mes === null || mes < 1 || mes > 12 || ano === null || ano < 2020 || receita === null) {
      return { erro: "HISTORICO_RECEITA_INVALIDO" };
    }

    const referencia = chaveMes(ano, mes);
    if (receitasPorMes.has(referencia)) return { erro: "HISTORICO_RECEITA_INVALIDO" };
    receitasPorMes.set(referencia, receita);
  }

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

function montarBasesCalculo({ notas, historicoReceita, mes, ano }) {
  const janelaRbt12 = calcularJanela12MesesAnteriores(mes, ano);
  const mesReferenciaAtual = chaveMes(ano, mes);
  const linhasNotas = Array.isArray(notas) ? notas : [];
  const notasSaida = linhasNotas.filter(ehNotaDeSaida);
  const notasRbt12 = notasSaida.filter((nota) => janelaRbt12.meses.has(referenciaDaNota(nota)));
  const notasReceitaMes = notasSaida.filter((nota) => referenciaDaNota(nota) === mesReferenciaAtual);
  const mesesComNotas = new Set(notasRbt12.map(referenciaDaNota));
  const historico = somarHistoricoReceita(historicoReceita, janelaRbt12.meses, mesesComNotas);

  if (historico.erro) return historico;

  const receitaNfesPorMes = new Map();
  for (const nota of notasRbt12) {
    const referencia = referenciaDaNota(nota);
    receitaNfesPorMes.set(
      referencia,
      arredondar((receitaNfesPorMes.get(referencia) || 0) + Number(nota.valor_total)),
    );
  }

  const rbt12Mensal = [...janelaRbt12.meses].map((referencia) => {
    const [anoReferencia, mesReferencia] = referencia.split("-").map(Number);
    const receitaNfes = receitaNfesPorMes.get(referencia) || 0;
    const receitaHistorico = historico.receitasUsadas.get(referencia) || 0;

    return {
      referencia,
      mes: mesReferencia,
      ano: anoReferencia,
      receita_nfes: receitaNfes,
      receita_historico: receitaHistorico,
      total: arredondar(receitaNfes + receitaHistorico),
    };
  });

  const rbt12 = arredondar(rbt12Mensal.reduce((soma, item) => soma + item.total, 0));
  const receitaMes = arredondar(
    notasReceitaMes.reduce((soma, nota) => soma + Number(nota.valor_total), 0),
  );

  const notasConsideradas = notasSaida.map((nota) => {
    const referencia = referenciaDaNota(nota);
    const compoeRbt12 = janelaRbt12.meses.has(referencia);
    const compoeReceitaMes = referencia === mesReferenciaAtual;
    const motivo = compoeRbt12
      ? "Nota fiscal de saída incluída na RBT12."
      : "Nota fiscal de saída incluída na receita da competência."

    return resumirNota(nota, {
      compoe_rbt12: compoeRbt12,
      compoe_receita_mes: compoeReceitaMes,
      motivo,
    });
  });

  const notasExcluidas = linhasNotas
    .filter((nota) => !ehNotaDeSaida(nota))
    .map((nota) => resumirNota(nota, {
      compoe_rbt12: false,
      compoe_receita_mes: false,
      motivo: "Nota fiscal de entrada não compõe a receita bruta.",
    }));

  return {
    janelaRbt12,
    rbt12,
    receitaMes,
    rbt12Mensal,
    notasFiscais: {
      consideradas: notasConsideradas,
      excluidas: notasExcluidas,
    },
  };
}

function enriquecerApuracao(apuracao, resultado, bases) {
  return {
    ...apuracao,
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
    rbt12_mensal: bases.rbt12Mensal,
    notas_fiscais: bases.notasFiscais,
  };
}

export async function dispararApuracao(req, res) {
  const clienteId = resolverClienteIdBody(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano, regime } = req.body;
  if (!mes || !ano || !regime) {
    return res.status(400).json({ erro: "mes, ano e regime são obrigatórios" });
  }

  if (!REGIMES_SUPORTADOS.has(regime)) {
    return res.status(422).json({ erro: "REGIME_NAO_SUPORTADO" });
  }

  const mesNum = inteiroEstrito(mes);
  const anoNum = inteiroEstrito(ano);

  // Mesmos limites da CHECK constraint em database/migrations/71.sql — falhar aqui
  // com 400 em vez de deixar o Postgres rejeitar o insert com um 500 genérico.
  if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12 || !Number.isInteger(anoNum) || anoNum < 2020) {
    return res.status(400).json({ erro: "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020" });
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
      .select("anexo_simples, regime_tributario, historico_receita")
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

  const { data: notas, error: erroNotas } = await supabase
    .from("lancamentos_fiscais")
    .select("id, chave_nfe, tipo, valor_total, data_emissao")
    .eq("cliente_id", clienteId)
    .gte("data_emissao", janelaRbt12.inicio)
    .lte("data_emissao", fimMesAtual);

  if (erroNotas) {
    console.error("[apuracoes.controller] Erro ao buscar lançamentos fiscais:", erroNotas.message);
    return res.status(500).json({ erro: "Erro ao buscar lançamentos fiscais" });
  }

  const bases = montarBasesCalculo({
    notas,
    historicoReceita: cliente.historico_receita,
    mes: mesNum,
    ano: anoNum,
  });

  if (bases.erro) {
    return res.status(422).json({ erro: bases.erro });
  }

  let folha12 = null;
  let semDadosFolha = false;

  if (cliente.anexo_simples === "V") {
    const { data: processamentos, error: erroProcessamentos } = await supabase
      .from("processamentos_folha")
      .select("id, mes_referencia, criado_em")
      .eq("cliente_id", clienteId)
      .eq("status", "concluido")
      .gte("mes_referencia", janelaRbt12.inicio)
      .lte("mes_referencia", janelaRbt12.fim)
      .order("criado_em", { ascending: false });

    if (erroProcessamentos) {
      console.error("[apuracoes.controller] Erro ao buscar processamentos de folha:", erroProcessamentos.message);
      return res.status(500).json({ erro: "Erro ao buscar dados de folha" });
    }

    // Pode haver reprocessamento do mesmo mês; usa apenas o mais recente para
    // não duplicar a folha. A consulta já vem em criado_em decrescente.
    const processamentoPorMes = new Map();
    for (const processamento of processamentos || []) {
      const referencia = processamento.mes_referencia?.slice(0, 7);
      if (janelaRbt12.meses.has(referencia) && !processamentoPorMes.has(referencia)) {
        processamentoPorMes.set(referencia, processamento.id);
      }
    }

    const idsProcessamentos = [...processamentoPorMes.values()];

    if (idsProcessamentos.length !== 12) {
      semDadosFolha = true;
    } else {
      const { data: calculos, error: erroCalculos } = await supabase
        .from("folha_calculos")
        .select("base_calculo, fgts")
        .in("processamento_id", idsProcessamentos);

      if (erroCalculos) {
        console.error("[apuracoes.controller] Erro ao buscar cálculos de folha:", erroCalculos.message);
        return res.status(500).json({ erro: "Erro ao buscar dados de folha" });
      }

      // FS12 inclui remunerações e FGTS. A contribuição patronal precisa ser
      // incorporada quando o pipeline de folha passar a persistir esse valor.
      folha12 = arredondar(
        (calculos || []).reduce(
          (soma, linha) => soma + Number(linha.base_calculo) + Number(linha.fgts),
          0,
        ),
      );
    }
  }

  const resultado = calcularSimplesNacional({
    rbt12: bases.rbt12,
    receita_mes: bases.receitaMes,
    anexo: cliente.anexo_simples,
    folha12,
    semDadosFolha,
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

  return res.status(201).json(enriquecerApuracao(data, resultado, bases));
}

export async function listarApuracoes(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;
  const mesNum = mes === undefined ? null : inteiroEstrito(mes);
  const anoNum = ano === undefined ? null : inteiroEstrito(ano);

  if ((mes !== undefined && (mesNum === null || mesNum < 1 || mesNum > 12)) ||
      (ano !== undefined && (anoNum === null || anoNum < 2020))) {
    return res.status(400).json({ erro: "mes deve ser um inteiro entre 1 e 12, e ano deve ser >= 2020" });
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

  return res.status(200).json(data);
}

export async function detalharApuracao(req, res) {
  const { id } = req.params;

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
      .select("anexo_simples, historico_receita")
      .eq("id", data.cliente_id)
      .maybeSingle(),
    supabase
      .from("lancamentos_fiscais")
      .select("id, chave_nfe, tipo, valor_total, data_emissao")
      .eq("cliente_id", data.cliente_id)
      .gte("data_emissao", janelaRbt12.inicio)
      .lte("data_emissao", fimMesAtual),
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
    mes: data.periodo_mes,
    ano: data.periodo_ano,
  });

  if (bases.erro) {
    return res.status(422).json({ erro: bases.erro });
  }

  // O anexo persistido é o efetivo. Fator R preenchido identifica que o
  // cadastro original era Anexo V, inclusive quando ele permaneceu no V.
  const anexoOriginal = data.fator_r == null ? data.anexo : "V";
  const resultado = calcularSimplesNacional({
    rbt12: Number(data.rbt12_usado),
    receita_mes: Number(data.receita_mes),
    anexo: anexoOriginal,
    folha12: data.folha12 == null ? null : Number(data.folha12),
  });

  if (resultado.erro) {
    console.error("[apuracoes.controller] Apuração persistida com dados inválidos:", resultado.erro);
    return res.status(500).json({ erro: "Erro ao reconstruir cálculo da apuração" });
  }

  return res.status(200).json(enriquecerApuracao(data, resultado, bases));
}

export async function editarApuracao(req, res) {
  const { id } = req.params;
  const { valor_editado: valorEditado, motivo } = req.body;
  const motivoNormalizado = typeof motivo === "string" ? motivo.trim() : "";
  const valorNumerico = numeroNaoNegativo(valorEditado);

  if (!motivoNormalizado) {
    return res.status(400).json({ erro: "motivo é obrigatório" });
  }

  if (valorNumerico === null) {
    return res.status(400).json({ erro: "valor_editado deve ser um número não negativo" });
  }

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status, valor_editado, valor_calculado, historico_edicoes")
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
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao editar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao editar apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração já aprovada não pode ser editada" });
  }

  return res.status(200).json(data);
}

export async function aprovarApuracao(req, res) {
  const { id } = req.params;

  const { data: apuracao, error: erroBusca } = await supabase
    .from("apuracoes")
    .select("cliente_id, status")
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

  const { data, error } = await supabase
    .from("apuracoes")
    .update({
      status: "aprovado",
      aprovado_por: req.usuario?.email || req.usuario?.id,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "rascunho")
    .select()
    .maybeSingle();

  if (error) {
    console.error("[apuracoes.controller] Erro ao aprovar apuração:", error.message);
    return res.status(500).json({ erro: "Erro ao aprovar apuração" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Apuração já está aprovada" });
  }

  return res.status(200).json(data);
}
