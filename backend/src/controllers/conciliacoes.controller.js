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

export async function listarConciliacoes(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  let query = supabase
    .from("conciliacoes")
    .select("id, mes, ano, status, total_transacoes, total_conciliadas, total_pendentes, criado_em, extrato_id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });

  const mes = Number(req.query.mes);
  const ano = Number(req.query.ano);
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12) query = query.eq("mes", mes);
  if (Number.isInteger(ano) && ano > 0) query = query.eq("ano", ano);

  const { data: conciliacoes, error } = await query;

  if (error) {
    console.error("[conciliacoes.controller] Erro ao listar conciliações:", error.message);
    return res.status(500).json({ erro: "Erro ao listar conciliações" });
  }

  const sessoes = conciliacoes ?? [];
  const extratoIds = [...new Set(sessoes.map((sessao) => sessao.extrato_id).filter(Boolean))];

  let extratosPorId = {};
  if (extratoIds.length > 0) {
    const { data: extratos, error: erroExtratos } = await supabase
      .from("extratos_bancarios")
      .select("id, banco, conta")
      .in("id", extratoIds);

    if (erroExtratos) {
      console.error(
        "[conciliacoes.controller] Erro ao buscar extratos das conciliações:",
        erroExtratos.message,
      );
      return res.status(500).json({ erro: "Erro ao listar conciliações" });
    }

    extratosPorId = Object.fromEntries((extratos ?? []).map((extrato) => [extrato.id, extrato]));
  }

  return res.status(200).json(
    sessoes.map(({ extrato_id: extratoId, ...sessao }) => ({
      ...sessao,
      extrato: extratosPorId[extratoId]
        ? { banco: extratosPorId[extratoId].banco, conta: extratosPorId[extratoId].conta }
        : null,
    })),
  );
}

export async function buscarConciliacao(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { id } = req.params;

  const { conciliacao, erro: erroConciliacao } = await buscarConciliacaoDoCliente(id, clienteId);
  if (erroConciliacao) {
    return res.status(erroConciliacao.status).json(erroConciliacao.body);
  }

  const { data: pares, error: erroPares } = await supabase
    .from("pares_conciliacao")
    .select("id, transacao_id, lancamento_id, confianca, confirmado_por, confirmado_em")
    .eq("conciliacao_id", id);

  if (erroPares) {
    console.error("[conciliacoes.controller] Erro ao buscar pares da conciliação:", erroPares.message);
    return res.status(500).json({ erro: "Erro ao buscar pares da conciliação" });
  }

  const paresTodos = pares ?? [];
  const transacaoIds = [...new Set(paresTodos.map((par) => par.transacao_id).filter(Boolean))];
  const lancamentoIds = [...new Set(paresTodos.map((par) => par.lancamento_id).filter(Boolean))];

  const [transacoesResultado, lancamentosResultado] = await Promise.all([
    transacaoIds.length > 0
      ? supabase.from("transacoes_extrato").select("*").in("id", transacaoIds)
      : Promise.resolve({ data: [], error: null }),
    lancamentoIds.length > 0
      ? supabase.from("lancamentos_contabeis").select("*").in("id", lancamentoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (transacoesResultado.error) {
    console.error(
      "[conciliacoes.controller] Erro ao buscar transações dos pares:",
      transacoesResultado.error.message,
    );
    return res.status(500).json({ erro: "Erro ao buscar transações da conciliação" });
  }

  if (lancamentosResultado.error) {
    console.error(
      "[conciliacoes.controller] Erro ao buscar lançamentos dos pares:",
      lancamentosResultado.error.message,
    );
    return res.status(500).json({ erro: "Erro ao buscar lançamentos da conciliação" });
  }

  const transacoesPorId = Object.fromEntries((transacoesResultado.data ?? []).map((t) => [t.id, t]));
  const lancamentosPorId = Object.fromEntries((lancamentosResultado.data ?? []).map((l) => [l.id, l]));

  const paresAgrupados = { automatico: [], provavel: [], sem_par: [] };
  for (const par of paresTodos) {
    const base = {
      id: par.id,
      transacao: par.transacao_id ? transacoesPorId[par.transacao_id] ?? null : null,
      lancamento: par.lancamento_id ? lancamentosPorId[par.lancamento_id] ?? null : null,
    };
    paresAgrupados[par.confianca].push(
      par.confianca === "provavel" ? { ...base, confirmado_por: par.confirmado_por } : base,
    );
  }

  return res.status(200).json({
    id: conciliacao.id,
    status: conciliacao.status,
    total_transacoes: conciliacao.total_transacoes,
    total_conciliadas: conciliacao.total_conciliadas,
    total_pendentes: conciliacao.total_pendentes,
    pares: paresAgrupados,
  });
}

// Busca a conciliação por id e garante que pertence ao cliente autenticado.
// Retorna { conciliacao } em caso de sucesso, ou { erro: { status, body } }
// pronto para ser respondido diretamente pelo controller chamador.
async function buscarConciliacaoDoCliente(id, clienteId) {
  const { data: conciliacao, error } = await supabase
    .from("conciliacoes")
    .select("id, cliente_id, status, total_transacoes, total_conciliadas, total_pendentes")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[conciliacoes.controller] Erro ao buscar conciliação:", error.message);
    return { erro: { status: 500, body: { erro: "Erro ao buscar conciliação" } } };
  }

  // Não vaza a existência de conciliações de outros clientes: 404 tanto para
  // "não existe" quanto para "existe mas é de outro cliente".
  if (!conciliacao || conciliacao.cliente_id !== clienteId) {
    return { erro: { status: 404, body: { erro: "Conciliação não encontrada" } } };
  }

  return { conciliacao };
}

async function buscarParDaConciliacao(pareId, conciliacaoId) {
  const { data: par, error } = await supabase
    .from("pares_conciliacao")
    .select("id, conciliacao_id, transacao_id, lancamento_id, confianca, confirmado_em")
    .eq("id", pareId)
    .eq("conciliacao_id", conciliacaoId)
    .maybeSingle();

  if (error) {
    console.error("[conciliacoes.controller] Erro ao buscar par de conciliação:", error.message);
    return { erro: { status: 500, body: { erro: "Erro ao buscar par de conciliação" } } };
  }

  if (!par) {
    return { erro: { status: 404, body: { erro: "Par de conciliação não encontrado" } } };
  }

  return { par };
}

export async function confirmarPar(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { id, pareId } = req.params;

  const { conciliacao, erro: erroConciliacao } = await buscarConciliacaoDoCliente(id, clienteId);
  if (erroConciliacao) {
    return res.status(erroConciliacao.status).json(erroConciliacao.body);
  }

  const { par, erro: erroPar } = await buscarParDaConciliacao(pareId, id);
  if (erroPar) {
    return res.status(erroPar.status).json(erroPar.body);
  }

  if (par.confianca !== "provavel" || par.confirmado_em) {
    return res.status(409).json({ erro: "Par não está disponível para confirmação" });
  }

  const { error: erroUpdatePar } = await supabase
    .from("pares_conciliacao")
    .update({ confirmado_por: req.usuario.id, confirmado_em: new Date().toISOString() })
    .eq("id", pareId);

  if (erroUpdatePar) {
    console.error("[conciliacoes.controller] Erro ao confirmar par:", erroUpdatePar.message);
    return res.status(500).json({ erro: "Erro ao confirmar par de conciliação" });
  }

  // Re-busca os totais o mais perto possível do update para reduzir a janela
  // de corrida do incremento (não há suporte a update atômico/transação neste client).
  const { data: conciliacaoAtual, error: erroConciliacaoAtual } = await supabase
    .from("conciliacoes")
    .select("total_conciliadas, total_pendentes")
    .eq("id", id)
    .maybeSingle();

  const erroUpdateConciliacao =
    erroConciliacaoAtual ??
    (
      await supabase
        .from("conciliacoes")
        .update({
          total_conciliadas: conciliacaoAtual.total_conciliadas + 1,
          total_pendentes: conciliacaoAtual.total_pendentes - 1,
        })
        .eq("id", id)
    ).error;

  if (erroUpdateConciliacao) {
    console.error(
      "[conciliacoes.controller] Erro ao atualizar totais da conciliação:",
      erroUpdateConciliacao.message,
    );
    // Desfaz a confirmação do par para permitir uma nova tentativa consistente
    // (senão o par ficaria marcado como confirmado sem os totais refletirem isso).
    await supabase
      .from("pares_conciliacao")
      .update({ confirmado_por: null, confirmado_em: null })
      .eq("id", pareId);
    return res.status(500).json({ erro: "Erro ao atualizar totais da conciliação" });
  }

  return res.status(200).json({
    id: pareId,
    confianca: par.confianca,
    confirmado_por: req.usuario.id,
  });
}

export async function rejeitarPar(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { id, pareId } = req.params;

  const { erro: erroConciliacao } = await buscarConciliacaoDoCliente(id, clienteId);
  if (erroConciliacao) {
    return res.status(erroConciliacao.status).json(erroConciliacao.body);
  }

  const { par, erro: erroPar } = await buscarParDaConciliacao(pareId, id);
  if (erroPar) {
    return res.status(erroPar.status).json(erroPar.body);
  }

  if (par.confianca !== "provavel" || par.confirmado_em) {
    return res.status(409).json({ erro: "Par não está disponível para rejeição" });
  }

  const { error: erroUpdatePar } = await supabase
    .from("pares_conciliacao")
    .update({ lancamento_id: null, confianca: "sem_par" })
    .eq("id", pareId);

  if (erroUpdatePar) {
    console.error("[conciliacoes.controller] Erro ao rejeitar par:", erroUpdatePar.message);
    return res.status(500).json({ erro: "Erro ao rejeitar par de conciliação" });
  }

  return res.status(200).json({ id: pareId, confianca: "sem_par" });
}

export async function concluirConciliacao(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { id } = req.params;

  const { conciliacao, erro: erroConciliacao } = await buscarConciliacaoDoCliente(id, clienteId);
  if (erroConciliacao) {
    return res.status(erroConciliacao.status).json(erroConciliacao.body);
  }

  if (conciliacao.status !== "em_andamento") {
    return res.status(409).json({ erro: "Conciliação já foi concluída" });
  }

  const { data: pares, error: erroPares } = await supabase
    .from("pares_conciliacao")
    .select("transacao_id, lancamento_id, confianca, confirmado_em")
    .eq("conciliacao_id", id);

  if (erroPares) {
    console.error("[conciliacoes.controller] Erro ao buscar pares da conciliação:", erroPares.message);
    return res.status(500).json({ erro: "Erro ao buscar pares da conciliação" });
  }

  const paresTodos = pares ?? [];

  const paresPendentes = paresTodos.filter((par) => par.confianca === "provavel" && !par.confirmado_em);
  if (paresPendentes.length > 0) {
    return res.status(409).json({ erro: "Há pares prováveis pendentes de decisão" });
  }

  // "Conciliados" = automáticos ou prováveis já confirmados. Pares 'sem_par'
  // (rejeitados ou nunca casados) ficam de fora e não têm flag atualizada.
  const paresConciliados = paresTodos.filter(
    (par) => par.confianca === "automatico" || (par.confianca === "provavel" && par.confirmado_em),
  );
  const transacaoIds = paresConciliados.map((par) => par.transacao_id).filter(Boolean);
  const lancamentoIds = paresConciliados.map((par) => par.lancamento_id).filter(Boolean);

  // As flags de conciliado são marcadas antes do status da conciliação: se
  // alguma falhar, a conciliação permanece 'em_andamento' e o POST /concluir
  // pode ser chamado de novo com segurança (marcar conciliado=true de novo é idempotente).
  if (transacaoIds.length > 0) {
    const { error: erroTransacoes } = await supabase
      .from("transacoes_extrato")
      .update({ conciliado: true })
      .in("id", transacaoIds);

    if (erroTransacoes) {
      console.error(
        "[conciliacoes.controller] Erro ao marcar transações como conciliadas:",
        erroTransacoes.message,
      );
      return res.status(500).json({ erro: "Erro ao marcar transações como conciliadas" });
    }
  }

  if (lancamentoIds.length > 0) {
    const { error: erroLancamentos } = await supabase
      .from("lancamentos_contabeis")
      .update({ conciliado: true })
      .in("id", lancamentoIds);

    if (erroLancamentos) {
      console.error(
        "[conciliacoes.controller] Erro ao marcar lançamentos como conciliados:",
        erroLancamentos.message,
      );
      return res.status(500).json({ erro: "Erro ao marcar lançamentos como conciliados" });
    }
  }

  const { error: erroUpdateConciliacao } = await supabase
    .from("conciliacoes")
    .update({ status: "concluida", concluida_em: new Date().toISOString() })
    .eq("id", id);

  if (erroUpdateConciliacao) {
    console.error("[conciliacoes.controller] Erro ao concluir conciliação:", erroUpdateConciliacao.message);
    return res.status(500).json({ erro: "Erro ao concluir conciliação" });
  }

  return res.status(200).json({
    conciliacao_id: id,
    status: "concluida",
    total_conciliadas: paresConciliados.length,
  });
}
