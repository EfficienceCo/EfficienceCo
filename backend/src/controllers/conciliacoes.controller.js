import supabase from "../config/database.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";
import { parseOfx, decodificarOfx, inferirMesAno } from "../utils/ofx-parser.util.js";
import { aplicarFiltroPeriodo } from "../utils/periodo.util.js";
import { executarMatching } from "../utils/conciliacao-matching.util.js";

const STATUS_EXTRATO = {
  AGUARDANDO: "aguardando",
  PROCESSADO: "processado",
  ERRO: "erro",
};

function periodoAtual() {
  const agora = new Date();
  return { mes: agora.getMonth() + 1, ano: agora.getFullYear() };
}

function periodoDoBody(body) {
  const mes = Number(body?.mes);
  const ano = Number(body?.ano);
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(ano) && ano > 0) {
    return { mes, ano };
  }
  return null;
}

export async function criarConciliacaoExtrato(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  if (!req.file) {
    return res.status(400).json({ erro: "Arquivo OFX é obrigatório (campo 'arquivo')" });
  }

  const periodoInformado = periodoDoBody(req.body);

  // Registro criado antes do parsing para que uma falha de parsing tenha
  // onde ser marcada (status='erro'). banco/mes/ano são placeholders aqui —
  // sobrescritos no update final quando o parsing tem sucesso.
  const { data: extrato, error: erroInsercao } = await supabase
    .from("extratos_bancarios")
    .insert({
      cliente_id: clienteId,
      banco: "pendente",
      conta: null,
      mes: periodoInformado?.mes ?? periodoAtual().mes,
      ano: periodoInformado?.ano ?? periodoAtual().ano,
      arquivo_nome: req.file.originalname,
      status: STATUS_EXTRATO.AGUARDANDO,
    })
    .select()
    .single();

  if (erroInsercao) {
    console.error("[conciliacoes.controller] Erro ao criar registro de extrato:", erroInsercao.message);
    return res.status(500).json({ erro: "Erro ao registrar extrato bancário" });
  }

  let parsed;
  try {
    parsed = parseOfx(decodificarOfx(req.file.buffer));
  } catch (erroParsing) {
    console.error("[conciliacoes.controller] Erro ao parsear OFX:", erroParsing.message);
    await supabase
      .from("extratos_bancarios")
      .update({ status: STATUS_EXTRATO.ERRO })
      .eq("id", extrato.id);
    return res.status(422).json({
      erro: "Arquivo OFX inválido ou malformado",
      detalhe: erroParsing.message,
    });
  }

  const { mes, ano } = periodoInformado ?? inferirMesAno(parsed.transacoes);

  const transacoesParaInserir = parsed.transacoes.map((transacao) => ({
    extrato_id: extrato.id,
    cliente_id: clienteId,
    ...transacao,
  }));

  const { error: erroTransacoes } = await supabase
    .from("transacoes_extrato")
    .insert(transacoesParaInserir);

  if (erroTransacoes) {
    console.error("[conciliacoes.controller] Erro ao inserir transações:", erroTransacoes.message);
    await supabase
      .from("extratos_bancarios")
      .update({ status: STATUS_EXTRATO.ERRO })
      .eq("id", extrato.id);
    return res.status(500).json({ erro: "Erro ao salvar transações do extrato" });
  }

  const { error: erroAtualizacao } = await supabase
    .from("extratos_bancarios")
    .update({
      status: STATUS_EXTRATO.PROCESSADO,
      processado_em: new Date().toISOString(),
      banco: parsed.banco,
      conta: parsed.conta,
      mes,
      ano,
    })
    .eq("id", extrato.id);

  if (erroAtualizacao) {
    console.error(
      "[conciliacoes.controller] Erro ao atualizar extrato como processado:",
      erroAtualizacao.message,
    );
    // As transações já foram persistidas — marca como erro em vez de deixar
    // o extrato preso em 'aguardando' com dados órfãos e sem sinalização.
    await supabase
      .from("extratos_bancarios")
      .update({ status: STATUS_EXTRATO.ERRO })
      .eq("id", extrato.id);
    return res.status(500).json({
      erro: "Erro ao finalizar processamento do extrato",
      detalhe: "As transações foram salvas, mas o status do extrato não pôde ser atualizado",
    });
  }

  return res.status(201).json({
    extrato_id: extrato.id,
    total_transacoes: transacoesParaInserir.length,
    banco: parsed.banco,
    conta: parsed.conta,
    mes,
    ano,
  });
}

export async function listarTransacoesExtrato(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { id } = req.params;

  const { data: extrato, error: erroBusca } = await supabase
    .from("extratos_bancarios")
    .select("id, cliente_id")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[conciliacoes.controller] Erro ao buscar extrato:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar extrato bancário" });
  }

  if (!extrato) {
    return res.status(404).json({ erro: "Extrato bancário não encontrado" });
  }

  if (extrato.cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Sem permissão para acessar este extrato" });
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const { data, error, count } = await supabase
    .from("transacoes_extrato")
    .select("*", { count: "exact" })
    .eq("extrato_id", id)
    .order("data_lancamento", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[conciliacoes.controller] Erro ao listar transações:", error.message);
    return res.status(500).json({ erro: "Erro ao listar transações do extrato" });
  }

  return res.status(200).json({ data, total: count, limit, offset });
}

function periodoObrigatorioDoBody(body) {
  const mes = Number(body?.mes);
  const ano = Number(body?.ano);
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(ano)) {
    return { mes, ano };
  }
  return null;
}

export async function criarConciliacao(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { extrato_id: extratoId } = req.body ?? {};
  if (!extratoId) {
    return res.status(400).json({ erro: "extrato_id é obrigatório" });
  }

  const periodo = periodoDoBody(req.body);
  if (!periodo) {
    return res.status(400).json({ erro: "mes e ano são obrigatórios e devem ser válidos" });
  }
  const { mes, ano } = periodo;

  const { data: extrato, error: erroExtrato } = await supabase
    .from("extratos_bancarios")
    .select("id, cliente_id, status, mes, ano")
    .eq("id", extratoId)
    .maybeSingle();

  if (erroExtrato) {
    console.error("[conciliacoes.controller] Erro ao buscar extrato:", erroExtrato.message);
    return res.status(500).json({ erro: "Erro ao buscar extrato bancário" });
  }

  if (!extrato) {
    return res.status(404).json({ erro: "Extrato bancário não encontrado" });
  }

  if (extrato.cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Sem permissão para acessar este extrato" });
  }

  if (extrato.status !== STATUS_EXTRATO.PROCESSADO) {
    return res.status(409).json({ erro: "Extrato bancário ainda não foi processado com sucesso" });
  }

  if (extrato.mes !== mes || extrato.ano !== ano) {
    return res.status(400).json({
      erro: "mes/ano informados não correspondem ao período do extrato",
    });
  }

  const { data: conciliacaoEmAndamento, error: erroConciliacaoEmAndamento } = await supabase
    .from("conciliacoes")
    .select("id")
    .eq("extrato_id", extratoId)
    .eq("status", "em_andamento")
    .maybeSingle();

  if (erroConciliacaoEmAndamento) {
    console.error(
      "[conciliacoes.controller] Erro ao verificar conciliação em andamento:",
      erroConciliacaoEmAndamento.message,
    );
    return res.status(500).json({ erro: "Erro ao verificar conciliações existentes" });
  }

  if (conciliacaoEmAndamento) {
    return res.status(409).json({ erro: "Já existe uma conciliação em andamento para este extrato" });
  }

  const { data: transacoes, error: erroTransacoes } = await supabase
    .from("transacoes_extrato")
    .select("*")
    .eq("extrato_id", extratoId);

  if (erroTransacoes) {
    console.error("[conciliacoes.controller] Erro ao buscar transações do extrato:", erroTransacoes.message);
    return res.status(500).json({ erro: "Erro ao buscar transações do extrato" });
  }

  const { data: lancamentos, error: erroLancamentos } = await aplicarFiltroPeriodo(
    supabase.from("lancamentos_contabeis").select("*").eq("cliente_id", clienteId),
    "data_lancamento",
    mes,
    ano,
  );

  if (erroLancamentos) {
    console.error("[conciliacoes.controller] Erro ao buscar lançamentos contábeis:", erroLancamentos.message);
    return res.status(500).json({ erro: "Erro ao buscar lançamentos contábeis" });
  }

  const transacoesEncontradas = transacoes ?? [];
  const lancamentosEncontrados = lancamentos ?? [];
  const pares = executarMatching(transacoesEncontradas, lancamentosEncontrados);

  const totalAutomaticos = pares.filter((p) => p.confianca === "automatico").length;
  const totalProvaveis = pares.filter((p) => p.confianca === "provavel").length;
  const totalSemPar = pares.filter((p) => p.confianca === "sem_par").length;

  const { data: conciliacao, error: erroConciliacao } = await supabase
    .from("conciliacoes")
    .insert({
      cliente_id: clienteId,
      extrato_id: extratoId,
      mes,
      ano,
      status: "em_andamento",
      total_transacoes: transacoesEncontradas.length,
      total_conciliadas: totalAutomaticos,
      total_pendentes: totalProvaveis + totalSemPar,
    })
    .select()
    .single();

  if (erroConciliacao) {
    console.error("[conciliacoes.controller] Erro ao criar conciliação:", erroConciliacao.message);
    return res.status(500).json({ erro: "Erro ao criar conciliação" });
  }

  if (pares.length > 0) {
    const { error: erroPares } = await supabase
      .from("pares_conciliacao")
      .insert(pares.map((par) => ({ conciliacao_id: conciliacao.id, ...par })));

    if (erroPares) {
      console.error("[conciliacoes.controller] Erro ao salvar pares de conciliação:", erroPares.message);
      // A conciliação foi criada mas ficaria sem nenhum par e com totais incoerentes —
      // remove o registro em vez de deixá-lo órfão (não há status 'erro' para conciliacoes).
      await supabase.from("conciliacoes").delete().eq("id", conciliacao.id);
      return res.status(500).json({ erro: "Erro ao salvar pares de conciliação" });
    }
  }

  return res.status(201).json({
    conciliacao_id: conciliacao.id,
    total_transacoes: transacoesEncontradas.length,
    automaticos: totalAutomaticos,
    provaveis: totalProvaveis,
    sem_par: totalSemPar,
  });
}
