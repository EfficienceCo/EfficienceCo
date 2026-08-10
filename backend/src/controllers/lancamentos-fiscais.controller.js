import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { PERFIS } from "../config/perfis.js";
import { aplicarFiltroPeriodo } from "../utils/periodo.util.js";

const TIPOS_VALIDOS = new Set(["entrada", "saida"]);

const CAMPOS_OBRIGATORIOS = [
  "chave_nfe",
  "tipo",
  "cnpj_emitente",
  "cnpj_destinatario",
  "valor_total",
  "data_emissao",
  "cliente_id",
];

function camposFaltando(body) {
  return CAMPOS_OBRIGATORIOS.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

// GET /lancamentos-fiscais e /lancamentos-fiscais/resumo usam clienteId (camelCase) —
// payload do POST (enviado pelo agente) espelha as colunas da tabela em snake_case,
// já a query string dos endpoints consumidos pelo dashboard segue o padrão do frontend.
function resolverClienteIdQuery(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.query.clienteId;
  }
  return req.usuario?.cliente_id;
}

// Agente local envia o payload do XML da NFe já parseado, autenticado via
// x-licenca-token (mesmo padrão de uploadFolhaAgente em folha.controller.js).
export async function criarLancamentoFiscal(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const faltando = camposFaltando(req.body);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  const {
    chave_nfe,
    tipo,
    cnpj_emitente,
    cnpj_destinatario,
    valor_total,
    icms,
    pis,
    cofins,
    ipi,
    data_emissao,
    cliente_id,
    arquivo_xml,
  } = req.body;

  if (!TIPOS_VALIDOS.has(tipo)) {
    return res.status(400).json({ erro: "tipo deve ser 'entrada' ou 'saida'" });
  }

  if (cliente_id !== licenca.cliente_id) {
    return res.status(403).json({ erro: "cliente_id não corresponde ao token de licença" });
  }

  const { data: existente, error: erroExistente } = await supabase
    .from("lancamentos_fiscais")
    .select("id")
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

  const { data, error } = await supabase
    .from("lancamentos_fiscais")
    .insert({
      cliente_id,
      chave_nfe,
      tipo,
      cnpj_emitente,
      cnpj_destinatario,
      valor_total,
      icms: icms ?? 0,
      pis: pis ?? 0,
      cofins: cofins ?? 0,
      ipi: ipi ?? 0,
      data_emissao,
      arquivo_xml: arquivo_xml ?? null,
    })
    .select()
    .single();

  if (error) {
    // unique_violation — corrida entre duas chamadas concorrentes pra mesma chave_nfe
    // depois da checagem acima já ter passado.
    if (error.code === "23505") {
      return res.status(409).json({ erro: "Já existe um lançamento fiscal para esta chave de NFe" });
    }
    console.error("[lancamentos-fiscais.controller] Erro ao registrar lançamento fiscal:", error.message);
    return res.status(500).json({ erro: "Erro ao registrar lançamento fiscal" });
  }

  return res.status(201).json(data);
}

export async function listarLancamentosFiscais(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;

  let query = supabase
    .from("lancamentos_fiscais")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("data_emissao", { ascending: false });

  query = aplicarFiltroPeriodo(query, "data_emissao", mes, ano);

  const { data, error } = await query;

  if (error) {
    console.error("[lancamentos-fiscais.controller] Erro ao listar lançamentos:", error.message);
    return res.status(500).json({ erro: "Erro ao listar lançamentos fiscais" });
  }

  return res.status(200).json(data);
}

export async function resumoLancamentosFiscais(req, res) {
  const clienteId = resolverClienteIdQuery(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { mes, ano } = req.query;

  let query = supabase
    .from("lancamentos_fiscais")
    .select("tipo, valor_total, icms, pis, cofins, ipi")
    .eq("cliente_id", clienteId);

  query = aplicarFiltroPeriodo(query, "data_emissao", mes, ano);

  const { data, error } = await query;

  if (error) {
    console.error("[lancamentos-fiscais.controller] Erro ao calcular resumo:", error.message);
    return res.status(500).json({ erro: "Erro ao calcular resumo dos lançamentos fiscais" });
  }

  const linhas = data || [];

  const totais = linhas.reduce(
    (acc, lancamento) => ({
      valor_total: arredondar(acc.valor_total + Number(lancamento.valor_total)),
      icms: arredondar(acc.icms + Number(lancamento.icms)),
      pis: arredondar(acc.pis + Number(lancamento.pis)),
      cofins: arredondar(acc.cofins + Number(lancamento.cofins)),
      ipi: arredondar(acc.ipi + Number(lancamento.ipi)),
      entradas: acc.entradas + (lancamento.tipo === "entrada" ? 1 : 0),
      saidas: acc.saidas + (lancamento.tipo === "saida" ? 1 : 0),
    }),
    { valor_total: 0, icms: 0, pis: 0, cofins: 0, ipi: 0, entradas: 0, saidas: 0 },
  );

  return res.status(200).json({ total_nfe: linhas.length, ...totais });
}
