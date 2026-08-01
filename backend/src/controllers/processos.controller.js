import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { PERFIS } from "../config/perfis.js";
import { criarProcessoComEtapas } from "../services/processos.service.js";

const ETAPAS_PADRAO = {
  folha_pagamento: true,
  abertura_empresa: {
    nova: [
      "Verificar viabilidade do nome empresarial",
      "Registrar na Junta Comercial (contrato social)",
      "Obter CNPJ na Receita Federal",
      "Cadastro interno da empresa",
      "Registrar no município (Alvará)",
      "Registrar no estado (Inscrição Estadual, se aplicável)",
      "Abrir conta bancária pessoa jurídica",
      "Configurar emissão de NFS-e",
    ],
    cliente_existente: [
      "Verificar viabilidade do nome empresarial",
      "Cadastro interno da empresa",
      "Registrar no município (Alvará)",
      "Registrar no estado (Inscrição Estadual, se aplicável)",
      "Abrir conta bancária pessoa jurídica",
      "Configurar emissão de NFS-e",
    ],
  },
};

const ACOES_AUTOMATIZADAS = ["gerar_contrato_social", "criar_pastas"];

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

function sanitizarPastaBase(nome) {
  return nome.trim().replace(/\s+/g, "_");
}

export async function criarProcesso(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { tipo, nome_empresa, pasta_base } = req.body;

  if (!tipo) {
    return res.status(400).json({ erro: "tipo é obrigatório" });
  }

  if (!ETAPAS_PADRAO[tipo]) {
    return res.status(400).json({ erro: `tipo inválido: ${tipo}` });
  }

  if (tipo === "abertura_empresa") {
    return _criarAberturaEmpresa(req, res, clienteId);
  }

  const resultado = await criarProcessoComEtapas(clienteId, tipo, { nome_empresa, pasta_base });

  if (resultado.erro) {
    console.error("[processos.controller] Erro ao criar processo:", resultado.erro);
    return res.status(500).json({ erro: "Erro ao criar processo" });
  }

  return res.status(201).json({ ...resultado.processo, etapas: resultado.etapas });
}

async function _criarAberturaEmpresa(req, res, clienteId) {
  const { nome_empresa, socios, capital_social, endereco, objeto_social, cenario } = req.body;

  if (!nome_empresa) {
    return res.status(400).json({ erro: "nome_empresa é obrigatório para abertura_empresa" });
  }
  if (!cenario || !["nova", "cliente_existente"].includes(cenario)) {
    return res.status(400).json({ erro: "cenario deve ser 'nova' ou 'cliente_existente'" });
  }

  const pasta_base = sanitizarPastaBase(nome_empresa);

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .insert({
      cliente_id: clienteId,
      tipo: "abertura_empresa",
      nome_empresa,
      pasta_base,
      cenario,
      socios: socios || null,
      capital_social: capital_social || null,
      endereco: endereco || null,
      objeto_social: objeto_social || null,
    })
    .select()
    .single();

  if (erroProcesso) {
    console.error("[processos.controller] Erro ao criar abertura_empresa:", erroProcesso.message);
    return res.status(500).json({ erro: "Erro ao criar processo de abertura de empresa" });
  }

  const descricoes = ETAPAS_PADRAO.abertura_empresa[cenario];
  const etapasParaInserir = descricoes.map((descricao, i) => ({
    processo_id: processo.id,
    descricao,
    ordem: i + 1,
  }));

  const { data: etapas, error: erroEtapas } = await supabase
    .from("etapas")
    .insert(etapasParaInserir)
    .select();

  if (erroEtapas) {
    console.error("[processos.controller] Erro ao criar etapas de abertura_empresa:", erroEtapas.message);
    return res.status(500).json({ erro: "Erro ao criar etapas do processo" });
  }

  return res.status(201).json({
    processo_id: processo.id,
    nome_empresa: processo.nome_empresa,
    pasta_base: processo.pasta_base,
    cenario: processo.cenario,
    etapas,
  });
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
    const { data: processoFinalizado } = await supabase
      .from("processos")
      .update({ status: "concluido" })
      .eq("id", processoId)
      .select("tipo, nome_empresa, pasta_base")
      .single();

    return {
      status: 200,
      body: {
        ...etapaAtualizada,
        processo_concluido: true,
        tipo: processoFinalizado?.tipo,
        nome_empresa: processoFinalizado?.nome_empresa,
        pasta_base: processoFinalizado?.pasta_base,
      },
    };
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

async function _executarAcaoEtapa(processoId, etapaId, clienteId, payload) {
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

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select("id, processo_id, tipo, acao, concluida")
    .eq("id", etapaId)
    .eq("processo_id", processoId)
    .single();

  if (erroEtapa || !etapa) {
    return { status: 404, body: { erro: "Etapa não encontrada" } };
  }

  if (etapa.tipo !== "automatizada") {
    return {
      status: 400,
      body: { erro: "Etapa não é automatizada — use PATCH /processos/:id/etapas/:etapaId" },
    };
  }

  if (!ACOES_AUTOMATIZADAS.includes(etapa.acao)) {
    return { status: 400, body: { erro: `acao desconhecida: ${etapa.acao}` } };
  }

  if (etapa.concluida) {
    return { status: 400, body: { erro: "Etapa já está concluída" } };
  }

  const { data: etapaAtualizada, error: erroUpdate } = await supabase
    .from("etapas")
    .update({
      status: "pronta_para_execucao",
      payload_execucao: payload ?? {},
      erro_execucao: null,
    })
    .eq("id", etapaId)
    .select()
    .single();

  if (erroUpdate) {
    console.error("[processos.controller] Erro ao preparar execução da etapa:", erroUpdate.message);
    return { status: 500, body: { erro: "Erro ao registrar execução da etapa" } };
  }

  return { status: 200, body: etapaAtualizada };
}

export async function executarAcaoEtapaJwt(req, res) {
  const { id: processoId, etapaId } = req.params;

  const clienteId =
    req.usuario.perfil === PERFIS.ADMIN_EFFICIENCE
      ? req.body.cliente_id || req.query.cliente_id
      : req.usuario.cliente_id;

  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { cliente_id, ...payload } = req.body || {};
  const resultado = await _executarAcaoEtapa(processoId, etapaId, clienteId, payload);
  return res.status(resultado.status).json(resultado.body);
}

// Rota de polling do agente — mesmo canal já usado por criar_estrutura_empresa.
// O agente busca, a cada ciclo, as etapas do cliente marcadas como "pronta_para_execucao".
export async function listarEtapasProntasAgente(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { data, error } = await supabase
    .from("etapas")
    .select("id, processo_id, acao, payload_execucao, processos!inner(cliente_id, nome_empresa, pasta_base)")
    .eq("status", "pronta_para_execucao")
    .eq("processos.cliente_id", licenca.cliente_id);

  if (error) {
    console.error("[processos.controller] Erro ao listar etapas prontas (agente):", error.message);
    return res.status(500).json({ erro: "Erro ao listar etapas" });
  }

  const etapas = (data || []).map((e) => ({
    id: e.id,
    processo_id: e.processo_id,
    acao: e.acao,
    payload: e.payload_execucao,
    nome_empresa: e.processos?.nome_empresa,
    pasta_base: e.processos?.pasta_base,
  }));

  return res.status(200).json({ data: etapas });
}

// Rota de conclusão do agente — reporta sucesso (com o path do arquivo gerado) ou erro
// ao terminar de executar a ação da etapa.
export async function concluirExecucaoEtapaAgente(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const { etapaId } = req.params;
  const { sucesso, arquivo_gerado, erro } = req.body;

  if (sucesso === undefined) {
    return res.status(400).json({ erro: "Campo obrigatório: sucesso" });
  }

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select("id, processo_id, status, processos!inner(cliente_id)")
    .eq("id", etapaId)
    .single();

  if (erroEtapa || !etapa) {
    return res.status(404).json({ erro: "Etapa não encontrada" });
  }

  if (etapa.processos?.cliente_id !== licenca.cliente_id) {
    return res.status(403).json({ erro: "Sem permissão para esta etapa" });
  }

  if (etapa.status !== "pronta_para_execucao") {
    return res.status(400).json({ erro: "Etapa não está aguardando execução" });
  }

  if (sucesso) {
    const { data: etapaAtualizada, error: erroUpdate } = await supabase
      .from("etapas")
      .update({
        status: "concluida",
        concluida: true,
        concluida_em: new Date().toISOString(),
        arquivo_gerado: arquivo_gerado || null,
        erro_execucao: null,
      })
      .eq("id", etapaId)
      .select()
      .single();

    if (erroUpdate) {
      console.error("[processos.controller] Erro ao concluir execução da etapa:", erroUpdate.message);
      return res.status(500).json({ erro: "Erro ao concluir etapa" });
    }

    const { data: todasEtapas, error: erroTodasEtapas } = await supabase
      .from("etapas")
      .select("concluida")
      .eq("processo_id", etapa.processo_id);

    if (!erroTodasEtapas && todasEtapas.every((e) => e.concluida)) {
      await supabase.from("processos").update({ status: "concluido" }).eq("id", etapa.processo_id);
    }

    return res.status(200).json(etapaAtualizada);
  }

  const { data: etapaComErro, error: erroUpdateFalha } = await supabase
    .from("etapas")
    .update({
      status: "pronta_para_execucao",
      erro_execucao: erro || "Erro desconhecido na execução",
    })
    .eq("id", etapaId)
    .select()
    .single();

  if (erroUpdateFalha) {
    console.error("[processos.controller] Erro ao registrar falha da etapa:", erroUpdateFalha.message);
    return res.status(500).json({ erro: "Erro ao registrar falha da etapa" });
  }

  return res.status(200).json(etapaComErro);
}
