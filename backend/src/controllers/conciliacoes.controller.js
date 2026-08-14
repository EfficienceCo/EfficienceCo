import supabase from "../config/database.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";
import { parseOfx, decodificarOfx, inferirMesAno } from "../utils/ofx-parser.util.js";

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
  if (Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(ano)) {
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
