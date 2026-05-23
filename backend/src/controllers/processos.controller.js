import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { PERFIS } from "../config/perfis.js";

const ETAPAS_PADRAO = {
  folha_pagamento: [
    "Coletar holerites dos funcionários",
    "Calcular impostos (FGTS, INSS, IR)",
    "Gerar guias de pagamento",
    "Realizar pagamentos",
    "Arquivar documentos",
  ],
  abertura_empresa: [
    "Verificar viabilidade do nome empresarial",
    "Registrar na Junta Comercial",
    "Obter CNPJ na Receita Federal",
    "Registrar no município (Alvará)",
    "Registrar no estado (Inscrição Estadual, se aplicável)",
    "Abrir conta bancária pessoa jurídica",
    "Configurar emissão de NFS-e",
  ],
};

function resolverClienteId(req) {
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    return req.body.cliente_id || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

function calcularPercentual(etapas) {
  if (!etapas || etapas.length === 0) return 0;
  const concluidas = etapas.filter((e) => e.concluida).length;
  return Math.round((concluidas / etapas.length) * 100);
}

export async function listarProcessos(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { tipo, status } = req.query;

  let query = supabase
    .from("processos")
    .select("*, etapas(*)")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });

  if (tipo) query = query.eq("tipo", tipo);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    console.error("[processos.controller] Erro ao listar:", error.message);
    return res.status(500).json({ erro: "Erro ao listar processos" });
  }

  const resultado = data.map((p) => {
    const etapasOrdenadas = (p.etapas || []).sort((a, b) => a.ordem - b.ordem);
    return {
      ...p,
      etapas: etapasOrdenadas,
      percentual_conclusao: calcularPercentual(p.etapas),
    };
  });

  return res.status(200).json(resultado);
}

export async function criarProcesso(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { tipo } = req.body;

  if (!tipo) {
    return res.status(400).json({ erro: "tipo é obrigatório" });
  }

  const descricoesPadrao = ETAPAS_PADRAO[tipo];
  if (!descricoesPadrao) {
    return res.status(400).json({ erro: `tipo inválido: ${tipo}` });
  }

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .insert({ cliente_id: clienteId, tipo })
    .select()
    .single();

  if (erroProcesso) {
    console.error("[processos.controller] Erro ao criar processo:", erroProcesso.message);
    return res.status(500).json({ erro: "Erro ao criar processo" });
  }

  const etapasParaInserir = descricoesPadrao.map((descricao, i) => ({
    processo_id: processo.id,
    descricao,
    ordem: i + 1,
  }));

  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .insert(etapasParaInserir)
    .select();

  if (erroEtapas) {
    console.error("[processos.controller] Erro ao criar etapas:", erroEtapas.message);
    return res.status(500).json({ erro: "Erro ao criar etapas do processo" });
  }

  return res.status(201).json({ ...processo, etapas });
}

async function _concluirEtapa(processoId, etapaId, clienteId) {
  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .select("id, cliente_id, status")
    .eq("id", processoId)
    .single();

  if (erroProcesso || !processo) {
    return { status: 404, body: { erro: "Processo não encontrado" } };
  }

  if (processo.cliente_id !== clienteId) {
    return { status: 403, body: { erro: "Sem permissão para este processo" } };
  }

  if (processo.status === "concluido") {
    return { status: 400, body: { erro: "Processo já está concluído" } };
  }

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select("id, processo_id, concluida")
    .eq("id", etapaId)
    .eq("processo_id", processoId)
    .single();

  if (erroEtapa || !etapa) {
    return { status: 404, body: { erro: "Etapa não encontrada" } };
  }

  const { data: etapaAtualizada, error: erroUpdate } = await supabase
    .from("etapas")
    .update({ concluida: true, concluida_em: new Date().toISOString() })
    .eq("id", etapaId)
    .select()
    .single();

  if (erroUpdate) {
    console.error("[processos.controller] Erro ao atualizar etapa:", erroUpdate.message);
    return { status: 500, body: { erro: "Erro ao atualizar etapa" } };
  }

  const { data: todasEtapas, error: erroTodasEtapas } = await supabase
    .from("etapas")
    .select("concluida")
    .eq("processo_id", processoId);

  if (!erroTodasEtapas && todasEtapas.every((e) => e.concluida)) {
    await supabase
      .from("processos")
      .update({ status: "concluido" })
      .eq("id", processoId);

    return { status: 200, body: { ...etapaAtualizada, processo_concluido: true } };
  }

  return { status: 200, body: etapaAtualizada };
}

export async function concluirEtapaJwt(req, res) {
  const { id: processoId, etapaId } = req.params;

  const clienteId =
    req.usuario.perfil === PERFIS.ADMIN_EFFICIENCE
      ? req.body.cliente_id || req.query.cliente_id
      : req.usuario.cliente_id;

  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const resultado = await _concluirEtapa(processoId, etapaId, clienteId);
  return res.status(resultado.status).json(resultado.body);
}

export async function concluirEtapaLicenca(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { id: processoId, etapaId } = req.params;
  const resultado = await _concluirEtapa(processoId, etapaId, licenca.cliente_id);
  return res.status(resultado.status).json(resultado.body);
}
