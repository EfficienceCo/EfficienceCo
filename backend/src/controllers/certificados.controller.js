import supabase from "../config/database.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";
import { dataIsoValida } from "../utils/data.util.js";
import {
  calcularDiasRestantes,
  calcularFaixa,
} from "../utils/certificado-prazo.util.js";

const TIPOS_VALIDOS = new Set(["A1", "A3"]);
const CAMPOS_OBRIGATORIOS_POST = ["tipo", "validade"];
const CAMPOS_EDITAVEIS_PATCH = ["validade", "serial", "caminho_local"];
const CAMPOS_CONTEXTO_CLIENTE = ["clienteId", "cliente_id"];

function camposFaltando(body, campos) {
  return campos.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

function comFaixa(certificado) {
  const diasRestantes = calcularDiasRestantes(certificado.validade);
  return {
    ...certificado,
    dias_restantes: diasRestantes,
    faixa: calcularFaixa(diasRestantes),
  };
}

function certificadoPertenceAoCliente(req, certificado) {
  const clienteId = resolverClienteId(req);
  return Boolean(clienteId) && certificado.cliente_id === clienteId;
}

function aplicarIsolamentoCliente(query, req) {
  return query.eq("cliente_id", resolverClienteId(req));
}

function montarChecklistRenovacao(tipo) {
  const itens = [
    { id: "confirmar_dados", descricao: "Confirmar dados do titular", concluido: false },
    { id: "gerar_novo", descricao: "Gerar novo certificado", concluido: false },
  ];

  if (tipo === "A3") {
    itens.push({
      id: "agendar_comparecimento",
      descricao: "Agendar comparecimento presencial",
      concluido: false,
      data: null,
    });
  }

  return { tipo, itens, validade_nova: null };
}

async function buscarCertificadoComIsolamento(req, id, campos = "*") {
  let query = supabase.from("certificados_digitais").select(campos).eq("id", id);
  query = aplicarIsolamentoCliente(query, req);
  return query.maybeSingle();
}

/**
 * POST /certificados
 * Cadastra um certificado digital (A1/A3) para o cliente. Só admin.
 */
export async function criarCertificado(req, res) {
  const body = req.body ?? {};
  const { tipo, serial, titular, validade, caminho_local } = body;

  const faltando = camposFaltando(body, CAMPOS_OBRIGATORIOS_POST);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  if (!TIPOS_VALIDOS.has(tipo)) {
    return res.status(400).json({ erro: "tipo deve ser 'A1' ou 'A3'" });
  }

  if (!dataIsoValida(validade)) {
    return res.status(400).json({ erro: "validade deve estar no formato AAAA-MM-DD" });
  }

  for (const campo of ["serial", "titular", "caminho_local"]) {
    if (body[campo] != null && typeof body[campo] !== "string") {
      return res.status(400).json({ erro: `${campo} deve ser um texto` });
    }
  }

  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res
      .status(req.usuario ? 400 : 401)
      .json({ erro: req.usuario ? "clienteId é obrigatório" : "Usuário não autenticado" });
  }

  const { data, error } = await supabase
    .from("certificados_digitais")
    .insert({
      cliente_id: clienteId,
      tipo,
      serial: typeof serial === "string" && serial.trim() ? serial.trim() : null,
      titular: typeof titular === "string" && titular.trim() ? titular.trim() : null,
      validade,
      caminho_local:
        typeof caminho_local === "string" && caminho_local.trim() ? caminho_local.trim() : null,
    })
    .select()
    .maybeSingle();

  if (error || !data) {
    console.error("[certificados.controller] Erro ao criar certificado:", error?.message || "Registro não retornado");
    return res.status(500).json({ erro: "Erro ao criar certificado" });
  }

  return res.status(201).json(comFaixa(data));
}

/**
 * GET /certificados
 * Lista os certificados do cliente autenticado, com dias_restantes e faixa.
 */
export async function listarCertificados(req, res) {
  const clienteId = resolverClienteId(req);

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { data, error } = await supabase
    .from("certificados_digitais")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("validade", { ascending: true });

  if (error) {
    console.error("[certificados.controller] Erro ao listar certificados:", error.message);
    return res.status(500).json({ erro: "Erro ao listar certificados" });
  }

  return res.status(200).json((data || []).map(comFaixa));
}

/**
 * GET /certificados/:id
 * Detalhe do certificado (+ renovacao_checklist). 404 cross-tenant.
 */
export async function obterCertificado(req, res) {
  const { id } = req.params;

  if (!resolverClienteId(req)) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { data: certificado, error } = await buscarCertificadoComIsolamento(req, id);

  if (error) {
    console.error("[certificados.controller] Erro ao buscar certificado:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar certificado" });
  }

  if (!certificado || !certificadoPertenceAoCliente(req, certificado)) {
    return res.status(404).json({ erro: "Certificado não encontrado" });
  }

  return res.status(200).json(comFaixa(certificado));
}

/**
 * PATCH /certificados/:id
 * Edita validade / serial / caminho_local. Só admin.
 */
export async function editarCertificado(req, res) {
  const { id } = req.params;
  const body = req.body ?? {};
  const atualizacoes = {};

  if (!resolverClienteId(req)) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  for (const campo of CAMPOS_EDITAVEIS_PATCH) {
    if (body[campo] === undefined) continue;

    const valor = body[campo];

    if (campo === "validade") {
      if (!dataIsoValida(valor)) {
        return res.status(400).json({ erro: "validade deve estar no formato AAAA-MM-DD" });
      }
      atualizacoes.validade = valor;
      // CD-3: validade nova reinicia a cadeia de marcos 60/30/7.
      atualizacoes.ultimo_marco_alertado = null;
      continue;
    }

    if (typeof valor !== "string") {
      return res.status(400).json({ erro: `${campo} deve ser um texto` });
    }

    atualizacoes[campo] = valor.trim() || null;
  }

  const camposNaoEditaveis = Object.keys(body).filter(
    (campo) =>
      !CAMPOS_EDITAVEIS_PATCH.includes(campo) && !CAMPOS_CONTEXTO_CLIENTE.includes(campo),
  );
  if (camposNaoEditaveis.length > 0) {
    return res.status(400).json({
      erro: "Campos não editáveis",
      camposNaoEditaveis,
      editaveisApenas: CAMPOS_EDITAVEIS_PATCH,
    });
  }

  if (Object.keys(atualizacoes).length === 0) {
    return res.status(400).json({
      erro: "Nenhum campo válido para editar",
      editaveisApenas: CAMPOS_EDITAVEIS_PATCH,
    });
  }

  const { data: certificado, error: erroBusca } = await buscarCertificadoComIsolamento(
    req,
    id,
    "cliente_id, status, atualizado_em",
  );

  if (erroBusca) {
    console.error("[certificados.controller] Erro ao buscar certificado:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar certificado" });
  }

  if (!certificado || !certificadoPertenceAoCliente(req, certificado)) {
    return res.status(404).json({ erro: "Certificado não encontrado" });
  }

  if (certificado.status === "substituido") {
    return res.status(409).json({ erro: "Certificado substituído não pode ser editado" });
  }

  const { data, error } = await supabase
    .from("certificados_digitais")
    .update(atualizacoes)
    .eq("id", id)
    .eq("cliente_id", certificado.cliente_id)
    .eq("status", certificado.status)
    .eq("atualizado_em", certificado.atualizado_em)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[certificados.controller] Erro ao editar certificado:", error.message);
    return res.status(500).json({ erro: "Erro ao editar certificado" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Certificado alterado por outra solicitação. Recarregue e tente novamente." });
  }

  return res.status(200).json(comFaixa(data));
}

/**
 * POST /certificados/:id/iniciar-renovacao
 * status='renovacao_iniciada' + materializa renovacao_checklist conforme tipo. Só admin.
 */
export async function iniciarRenovacaoCertificado(req, res) {
  const { id } = req.params;

  if (!resolverClienteId(req)) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { data: certificado, error: erroBusca } = await buscarCertificadoComIsolamento(
    req,
    id,
    "cliente_id, tipo, status",
  );

  if (erroBusca) {
    console.error("[certificados.controller] Erro ao buscar certificado:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar certificado" });
  }

  if (!certificado || !certificadoPertenceAoCliente(req, certificado)) {
    return res.status(404).json({ erro: "Certificado não encontrado" });
  }

  if (certificado.status === "renovacao_iniciada") {
    return res.status(409).json({ erro: "Renovação já iniciada para este certificado" });
  }

  if (certificado.status === "substituido") {
    return res.status(409).json({ erro: "Certificado substituído não pode ser renovado" });
  }

  const { data, error } = await supabase
    .from("certificados_digitais")
    .update({
      status: "renovacao_iniciada",
      renovacao_checklist: montarChecklistRenovacao(certificado.tipo),
    })
    .eq("id", id)
    .eq("cliente_id", certificado.cliente_id)
    .eq("status", certificado.status)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[certificados.controller] Erro ao iniciar renovação:", error.message);
    return res.status(500).json({ erro: "Erro ao iniciar renovação" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Certificado alterado por outra solicitação. Recarregue e tente novamente." });
  }

  return res.status(200).json(comFaixa(data));
}

/**
 * PATCH /certificados/:id/renovacao
 * Marca item do checklist como concluído. Quando todos concluídos + validade
 * nova → cria novo registro ativo e marca o antigo substituido. Só admin.
 */
export async function atualizarRenovacaoCertificado(req, res) {
  const { id } = req.params;
  const {
    itemId,
    concluido,
    data: dataAgendamento,
    validade_nova,
    serial_novo,
    caminho_local_novo,
  } = req.body ?? {};

  if (!resolverClienteId(req)) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  if (typeof itemId !== "string" || !itemId.trim()) {
    return res.status(400).json({ erro: "itemId é obrigatório" });
  }

  if (concluido !== undefined && typeof concluido !== "boolean") {
    return res.status(400).json({ erro: "concluido deve ser um booleano" });
  }

  if (validade_nova !== undefined && !dataIsoValida(validade_nova)) {
    return res.status(400).json({ erro: "validade_nova deve estar no formato AAAA-MM-DD" });
  }

  if (serial_novo !== undefined && typeof serial_novo !== "string") {
    return res.status(400).json({ erro: "serial_novo deve ser um texto" });
  }

  if (caminho_local_novo !== undefined && typeof caminho_local_novo !== "string") {
    return res.status(400).json({ erro: "caminho_local_novo deve ser um texto" });
  }

  const { data: certificado, error: erroBusca } = await buscarCertificadoComIsolamento(req, id);

  if (erroBusca) {
    console.error("[certificados.controller] Erro ao buscar certificado:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar certificado" });
  }

  if (!certificado || !certificadoPertenceAoCliente(req, certificado)) {
    return res.status(404).json({ erro: "Certificado não encontrado" });
  }

  if (certificado.status !== "renovacao_iniciada" || !certificado.renovacao_checklist) {
    return res.status(409).json({ erro: "Renovação não foi iniciada para este certificado" });
  }

  if (validade_nova !== undefined && validade_nova <= certificado.validade.slice(0, 10)) {
    return res.status(400).json({ erro: "validade_nova deve ser posterior à validade atual" });
  }

  const checklist = certificado.renovacao_checklist;
  const indiceItem = checklist.itens.findIndex((item) => item.id === itemId);

  if (indiceItem === -1) {
    return res.status(404).json({ erro: "Item do checklist não encontrado" });
  }

  const itemAtualizado = {
    ...checklist.itens[indiceItem],
    concluido: concluido === undefined ? true : concluido,
  };

  if (itemAtualizado.id === "agendar_comparecimento") {
    if (dataAgendamento !== undefined) {
      if (dataAgendamento !== null && !dataIsoValida(dataAgendamento)) {
        return res.status(400).json({ erro: "data deve estar no formato AAAA-MM-DD" });
      }
      itemAtualizado.data = dataAgendamento;
    }

    if (itemAtualizado.concluido === true && !itemAtualizado.data) {
      return res.status(400).json({
        erro: "data do comparecimento presencial é obrigatória antes de concluir este item",
      });
    }
  }

  const itensAtualizados = [...checklist.itens];
  itensAtualizados[indiceItem] = itemAtualizado;

  const checklistAtualizado = {
    ...checklist,
    itens: itensAtualizados,
    validade_nova: validade_nova ?? checklist.validade_nova ?? null,
    serial_novo: serial_novo ?? checklist.serial_novo ?? null,
    caminho_local_novo: caminho_local_novo ?? checklist.caminho_local_novo ?? null,
  };

  const todosConcluidos = itensAtualizados.every((item) => item.concluido === true);

  if (todosConcluidos && checklistAtualizado.validade_nova) {
    // A validade pode ter sido guardada em uma etapa anterior e o cadastro
    // editado depois. Valide o conjunto que realmente será persistido.
    if (!dataIsoValida(checklistAtualizado.validade_nova) ||
        checklistAtualizado.validade_nova <= certificado.validade.slice(0, 10)) {
      return res.status(400).json({ erro: "validade_nova deve ser posterior à validade atual" });
    }

    const { data: novoCertificado, error: erroNovo } = await supabase
      .from("certificados_digitais")
      .insert({
        cliente_id: certificado.cliente_id,
        tipo: certificado.tipo,
        serial: checklistAtualizado.serial_novo,
        titular: certificado.titular,
        validade: checklistAtualizado.validade_nova,
        caminho_local: checklistAtualizado.caminho_local_novo ?? certificado.caminho_local,
        status: "ativo",
      })
      .select()
      .maybeSingle();

    if (erroNovo || !novoCertificado) {
      console.error("[certificados.controller] Erro ao criar novo certificado renovado:", erroNovo?.message || "Registro não retornado");
      return res.status(500).json({ erro: "Erro ao concluir renovação" });
    }

    const { data: certificadoSubstituido, error: erroSubstituir } = await supabase
      .from("certificados_digitais")
      .update({ status: "substituido", renovacao_checklist: checklistAtualizado })
      .eq("id", id)
      .eq("cliente_id", certificado.cliente_id)
      .eq("status", "renovacao_iniciada")
      .eq("renovacao_checklist", JSON.stringify(checklist))
      .eq("validade", certificado.validade)
      .select()
      .maybeSingle();

    if (erroSubstituir || !certificadoSubstituido) {
      if (erroSubstituir) {
        console.error("[certificados.controller] Erro ao marcar certificado como substituído:", erroSubstituir.message);
      }
      const { error: erroRollback } = await supabase
        .from("certificados_digitais")
        .delete()
        .eq("id", novoCertificado.id)
        .eq("cliente_id", certificado.cliente_id);
      if (erroRollback) {
        console.error(
          "[certificados.controller] Certificado renovado orphan (id=%s) — falha no rollback: %s",
          novoCertificado.id,
          erroRollback.message,
        );
        return res.status(500).json({ erro: "Erro ao concluir renovação. Contate o suporte." });
      }
      if (!erroSubstituir) {
        return res.status(409).json({ erro: "Renovação alterada por outra solicitação. Recarregue e tente novamente." });
      }
      return res.status(500).json({ erro: "Erro ao concluir renovação" });
    }

    return res.status(200).json({
      certificado: comFaixa(certificadoSubstituido),
      novo_certificado: comFaixa(novoCertificado),
    });
  }

  const { data, error } = await supabase
    .from("certificados_digitais")
    .update({ renovacao_checklist: checklistAtualizado })
    .eq("id", id)
    .eq("cliente_id", certificado.cliente_id)
    .eq("status", "renovacao_iniciada")
    .eq("renovacao_checklist", JSON.stringify(checklist))
    .select()
    .maybeSingle();

  if (error) {
    console.error("[certificados.controller] Erro ao atualizar checklist de renovação:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar checklist de renovação" });
  }

  if (!data) {
    return res.status(409).json({ erro: "Renovação alterada por outra solicitação. Recarregue e tente novamente." });
  }

  return res.status(200).json(comFaixa(data));
}
