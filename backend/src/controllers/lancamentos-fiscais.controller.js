import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { PERFIS } from "../config/perfis.js";
import { aplicarFiltroPeriodo, dataLocalISO, erroPeriodoConsulta } from "../utils/periodo.util.js";
import { ehUuid } from "../utils/uuid.util.js";
import { dataIsoValida } from "../utils/data.util.js";
import {
  apresentarLancamentoFiscal,
  camposRejeicaoBanco,
  recomputarInconsistencias,
  validarLancamentoFiscal,
} from "../utils/lancamento-fiscal.util.js";
import { arredondar, camposFaltando, chaveNfeDvValido, soDigitos } from "../utils/comum.util.js";

const TIPOS_VALIDOS = new Set(["entrada", "saida"]);
const CHAVE_NFE_REGEX = /^\d{44}$/;

const CAMPOS_OBRIGATORIOS = [
  "chave_nfe",
  "tipo",
  "cnpj_emitente",
  "cnpj_destinatario",
  "valor_total",
  "data_emissao",
  "cliente_id",
  "tp_nf",
  "itens",
];

function cnpjEsperadoParaTipo(tipo, cnpj_emitente, cnpj_destinatario) {
  if (tipo === "entrada") return soDigitos(cnpj_destinatario);
  if (tipo === "saida") return soDigitos(cnpj_emitente);
  return "";
}

// GET /lancamentos-fiscais e /lancamentos-fiscais/resumo aceitam tanto clienteId
// (camelCase, usado pelo fiscal.service.js do frontend) quanto cliente_id
// (snake_case, convenção do resto da API — obrigacoes/folha/permissao.middleware)
// pra não quebrar silenciosamente um caller que seguir o padrão predominante.
function resolverClienteIdQuery(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.query.clienteId || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

// 400 antes do Postgres: id não-UUID vira 22P02 (500 genérico) e período
// inválido era ignorado, devolvendo o ano ou o histórico inteiro.
function erroConsultaLancamentos(clienteId, mes, ano) {
  if (!ehUuid(clienteId)) {
    return "clienteId deve ser um UUID";
  }
  return erroPeriodoConsulta(mes, ano);
}

// Preserva a resposta em lista completa, buscando todas as páginas do PostgREST.
// A contagem também cobre ambientes cujo limite por resposta é menor que 1.000.
async function consultarLancamentosFiscais(clienteId, mes, ano, campos, apenasAtivas = false) {
  const linhas = [];
  const tamanhoPagina = 1000;
  while (true) {
    let query = supabase.from("lancamentos_fiscais")
      .select(campos, { count: "exact" })
      .eq("cliente_id", clienteId)
      .order("data_emissao", { ascending: false })
      .order("id", { ascending: false });
    if (apenasAtivas) query = query.eq("status", "ativa");
    query = aplicarFiltroPeriodo(query, "data_emissao", mes, ano);
    const { data, error, count } = await query.range(linhas.length, linhas.length + tamanhoPagina - 1);
    if (error) return { data: null, error };
    const pagina = data || [];
    linhas.push(...pagina);
    if (pagina.length === 0 || (count != null ? linhas.length >= count : pagina.length < tamanhoPagina)) {
      return { data: linhas, error: null };
    }
  }
}

// Agente local envia o payload do XML da NFe já parseado, autenticado via
// x-licenca-token (mesmo padrão de uploadFolhaAgente em folha.controller.js).
// Authz: cliente_id do payload DEVE ser o da licença. Checagem CNPJ↔tipo é
// integridade do lançamento (não substitui isolamento multi-tenant).
export async function criarLancamentoFiscal(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const faltando = camposFaltando(req.body, CAMPOS_OBRIGATORIOS);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  // A API é a fronteira de confiança: o agente valida antes, mas um payload
  // inválido não pode virar 500 genérico nem linha no ledger (#568).
  // Data futura continua recusada aqui (BUG-APUR-08) — contaminaria RBT12.
  const validacao = validarLancamentoFiscal(req.body, dataLocalISO());
  if (!validacao.valido) {
    return res.status(422).json({
      erro: "Dados do lançamento fiscal inválidos",
      campos: validacao.erros,
    });
  }

  const { tipo, cliente_id } = req.body;
  const {
    chave_nfe,
    cnpj_emitente,
    cnpj_destinatario,
    valor_total,
    icms,
    pis,
    cofins,
    ipi,
    data_emissao,
    arquivo_xml,
    tp_nf,
    itens,
  } = validacao.dados;

  if (!TIPOS_VALIDOS.has(tipo)) {
    return res.status(400).json({ erro: "tipo deve ser 'entrada' ou 'saida'" });
  }

  if (cliente_id !== licenca.cliente_id) {
    return res.status(403).json({ erro: "cliente_id não corresponde ao token de licença" });
  }

  const { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .select("id, cnpj")
    .eq("id", cliente_id)
    .maybeSingle();

  if (erroCliente) {
    console.error(
      "[lancamentos-fiscais.controller] Erro ao validar cliente_id:",
      erroCliente.message,
    );
    return res.status(500).json({ erro: "Erro ao validar cliente do lançamento" });
  }

  if (!cliente) {
    return res.status(403).json({ erro: "cliente_id não encontrado" });
  }

  const cnpjCliente = soDigitos(cliente.cnpj);
  const cnpjEsperado = cnpjEsperadoParaTipo(tipo, cnpj_emitente, cnpj_destinatario);
  if (!cnpjCliente || cnpjCliente !== cnpjEsperado) {
    return res.status(403).json({
      erro: "CNPJ do cliente_id não corresponde ao emitente/destinatário do tipo informado",
    });
  }

  const { data: existente, error: erroExistente } = await supabase
    .from("lancamentos_fiscais")
    .select("id")
    .eq("cliente_id", cliente_id)
    .eq("chave_nfe", chave_nfe)
    .maybeSingle();

  if (erroExistente) {
    console.error(
      "[lancamentos-fiscais.controller] Erro ao verificar chave_nfe existente:",
      erroExistente.message,
    );
    return res.status(500).json({ erro: "Erro ao verificar lançamento fiscal" });
  }

  if (existente) {
    return res.status(409).json({ erro: "Já existe um lançamento fiscal para esta chave de NFe" });
  }

  const inconsistencias = recomputarInconsistencias(tp_nf, itens);

  const { data, error } = await supabase
    .from("lancamentos_fiscais")
    .insert({
      cliente_id,
      chave_nfe,
      tipo,
      // CNPJ (14) ou CPF (11) em emitente e destinatário. VARCHAR(14) cabe os
      // 11 dígitos sem padar. Dest = venda a PF (#566); emit = produtor rural
      // PF (#659). Já passaram por cpfValido/cnpjValido em
      // validarLancamentoFiscal.
      cnpj_emitente,
      cnpj_destinatario,
      valor_total,
      icms,
      pis,
      cofins,
      ipi,
      data_emissao,
      arquivo_xml,
      tp_nf,
      inconsistencias,
    })
    .select()
    .single();

  if (error) {
    // unique_violation — corrida entre duas chamadas concorrentes pra mesmo
    // (cliente_id, chave_nfe) depois da checagem acima já ter passado.
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Já existe um lançamento fiscal para esta chave de NFe" });
    }
    const campos = camposRejeicaoBanco(error);
    if (campos) {
      console.error("[lancamentos-fiscais.controller] Lançamento fiscal recusado pelo banco:", error.message);
      return res.status(422).json({
        erro: "Dados do lançamento fiscal inválidos",
        campos,
      });
    }
    console.error("[lancamentos-fiscais.controller] Erro ao registrar lançamento fiscal:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar lançamento fiscal" });
  }

  // O PostgREST não grava a tabela filha no mesmo insert: os itens entram logo
  // depois e, se falharem, a nota é removida para o agente poder reenviar (sem
  // isso a chave ficaria ocupada e o reenvio daria 409).
  const { error: erroItens } = await supabase.from("lancamentos_fiscais_itens").insert(
    itens.map((item) => ({
      lancamento_id: data.id,
      cliente_id,
      n_item: item.n_item,
      cfop: item.cfop,
      ncm: item.ncm,
    })),
  );
  if (erroItens) {
    console.error("[lancamentos-fiscais.controller] Erro ao registrar itens do lançamento fiscal:", erroItens.message);
    const { error: erroRemocao } = await supabase.from("lancamentos_fiscais").delete().eq("id", data.id);
    if (erroRemocao) {
      console.error("[lancamentos-fiscais.controller] Nota ficou sem itens:", data.id, erroRemocao.message);
    }
    return res.status(500).json({ erro: "Erro ao registrar lançamento fiscal" });
  }

  return res.status(201).json(apresentarLancamentoFiscal({ ...data, itens }));
}

// POST /lancamentos-fiscais/cancelar — chamado pelo agente ao receber um
// procEventoNFe de cancelamento homologado. O registro é preservado para
// auditoria, mas deixa de produzir efeito nos resumos e apurações.
export async function cancelarLancamentoFiscal(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { chave_nfe, motivo, protocolo, data_evento } = req.body || {};
  if (!CHAVE_NFE_REGEX.test(String(chave_nfe || ""))) {
    return res.status(400).json({ erro: "chave_nfe deve conter 44 dígitos" });
  }
  if (!chaveNfeDvValido(chave_nfe)) {
    return res.status(400).json({ erro: "chave_nfe com dígito verificador inválido" });
  }

  if (motivo != null && typeof motivo !== "string") {
    return res.status(400).json({ erro: "motivo deve ser texto" });
  }
  const protocoloInformado = protocolo != null && protocolo !== "";
  if (protocoloInformado && (
    !["string", "number"].includes(typeof protocolo) || !/^\d{15}$/.test(String(protocolo))
  )) {
    return res.status(400).json({ erro: "protocolo deve conter 15 dígitos" });
  }

  const dataInformada = data_evento != null && data_evento !== "";
  const formatoDataEvento = /^\d{4}-\d{2}-\d{2}(?:[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;
  if (dataInformada && (typeof data_evento !== "string" ||
    !formatoDataEvento.test(data_evento) || !dataIsoValida(data_evento.slice(0, 10)))) {
    return res.status(400).json({ erro: "data_evento inválida" });
  }
  const dataCancelamento = dataInformada ? new Date(data_evento) : new Date();
  if (Number.isNaN(dataCancelamento.getTime()) || dataCancelamento.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ erro: "data_evento inválida" });
  }

  const consultarNota = () => supabase.from("lancamentos_fiscais").select()
    .eq("cliente_id", licenca.cliente_id).eq("chave_nfe", chave_nfe).maybeSingle();
  const { data: existente, error: erroConsulta } = await consultarNota();
  if (erroConsulta) {
    console.error("[lancamentos-fiscais.controller] Erro ao consultar cancelamento:", erroConsulta.message);
    return res.status(500).json({ erro: "Erro ao cancelar lançamento fiscal" });
  }
  if (!existente) {
    return res.status(404).json({ erro: "Lançamento fiscal não encontrado para esta licença" });
  }
  const diaEvento = dataInformada ? data_evento.slice(0, 10) : dataLocalISO();
  if (diaEvento < existente.data_emissao) {
    return res.status(400).json({ erro: "data_evento não pode ser anterior à emissão da NF-e" });
  }
  // O primeiro cancelamento é a trilha fiscal. Reenvios não o reescrevem.
  if (existente.status === "cancelada") {
    return res.status(200).json(existente);
  }

  const { data, error } = await supabase
    .from("lancamentos_fiscais")
    .update({
      status: "cancelada",
      cancelado_em: dataCancelamento.toISOString(),
      motivo_cancelamento: motivo || null,
      protocolo_cancelamento: protocoloInformado ? String(protocolo) : null,
    })
    .eq("cliente_id", licenca.cliente_id)
    .eq("chave_nfe", chave_nfe)
    .eq("status", "ativa")
    .select()
    .maybeSingle();

  if (error) {
    console.error("[lancamentos-fiscais.controller] Erro ao cancelar lançamento:", error.message);
    return res.status(500).json({ erro: "Erro ao cancelar lançamento fiscal" });
  }

  if (!data) {
    // Outra requisição pode ter cancelado entre a leitura e o UPDATE condicional.
    const { data: atual, error: erroAtual } = await consultarNota();
    if (erroAtual) {
      return res.status(500).json({ erro: "Erro ao cancelar lançamento fiscal" });
    }
    if (atual?.status === "cancelada") return res.status(200).json(atual);
    return res.status(404).json({ erro: "Lançamento fiscal não encontrado para esta licença" });
  }

  return res.status(200).json(data);
}

export async function listarLancamentosFiscais(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;
  const erroConsulta = erroConsultaLancamentos(clienteId, mes, ano);
  if (erroConsulta) {
    return res.status(400).json({ erro: erroConsulta });
  }

  const { data, error } = await consultarLancamentosFiscais(
    clienteId, mes, ano, "*, lancamentos_fiscais_itens(n_item, cfop, ncm)",
  );

  if (error) {
    console.error("[lancamentos-fiscais.controller] Erro ao listar lançamentos:", error.message);
    return res.status(500).json({ erro: "Erro ao listar lançamentos fiscais" });
  }

  return res.status(200).json((data || []).map(apresentarLancamentoFiscal));
}

export async function resumoLancamentosFiscais(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;
  const erroConsulta = erroConsultaLancamentos(clienteId, mes, ano);
  if (erroConsulta) {
    return res.status(400).json({ erro: erroConsulta });
  }

  const { data, error } = await consultarLancamentosFiscais(
    clienteId, mes, ano, "tipo, valor_total, icms, pis, cofins, ipi, status", true,
  );

  if (error) {
    console.error("[lancamentos-fiscais.controller] Erro ao calcular resumo:", error.message);
    return res.status(500).json({ erro: "Erro ao calcular resumo dos lançamentos fiscais" });
  }

  // O filtro local também protege integrações/mocks que retornem linhas além
  // do filtro solicitado ao banco.
  const linhas = (data || []).filter((lancamento) => lancamento.status !== "cancelada");

  // Entrada = crédito de imposto, saída = débito: nunca somar os dois juntos.
  const zerado = () => ({ quantidade: 0, valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0 });
  const totais = { entradas: zerado(), saidas: zerado() };

  for (const lancamento of linhas) {
    const grupo = lancamento.tipo === "entrada" ? totais.entradas : lancamento.tipo === "saida" ? totais.saidas : null;
    if (!grupo) continue;
    grupo.quantidade += 1;
    for (const campo of ["valor_total", "icms", "pis", "cofins", "ipi"]) {
      grupo[campo] = arredondar(grupo[campo] + Number(lancamento[campo]));
    }
  }

  return res.status(200).json({ total_nfe: linhas.length, ...totais });
}
