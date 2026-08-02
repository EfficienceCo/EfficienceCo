import { randomUUID } from "node:crypto";
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
const STATUS_ETAPA = {
  PENDENTE: "pendente",
  PRONTA: "pronta_para_execucao",
  PROCESSANDO: "processando",
  CONCLUIDA: "concluida",
};
const LEASE_EXECUCAO_MS = 15 * 60 * 1000;
const LIMITE_ETAPAS_POR_POLLING = 20;

function corpoObjeto(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function validarPayloadExecucao(acao, payload) {
  if (acao === "criar_pastas") {
    return Object.keys(payload).length === 0
      ? null
      : "criar_pastas não aceita dados adicionais";
  }

  if (acao !== "gerar_contrato_social") {
    return `acao desconhecida: ${acao}`;
  }

  const { socios, capital_social, objeto_social, endereco } = payload;
  if (!Array.isArray(socios) || socios.length === 0) {
    return "Informe ao menos um sócio";
  }

  const socioInvalido = socios.some(
    (socio) =>
      !socio ||
      typeof socio.nome !== "string" ||
      !socio.nome.trim() ||
      typeof socio.cpf !== "string" ||
      !socio.cpf.trim() ||
      !Number.isFinite(Number(socio.participacao)) ||
      Number(socio.participacao) <= 0 ||
      Number(socio.participacao) > 100,
  );
  if (socioInvalido) {
    return "Preencha nome, CPF e participação válida para todos os sócios";
  }

  const participacaoTotal = socios.reduce(
    (total, socio) => total + Number(socio.participacao),
    0,
  );
  if (Math.abs(participacaoTotal - 100) > 0.01) {
    return "A soma das participações dos sócios deve ser 100%";
  }

  if (!Number.isFinite(Number(capital_social)) || Number(capital_social) <= 0) {
    return "capital_social deve ser maior que zero";
  }

  if (typeof objeto_social !== "string" || !objeto_social.trim()) {
    return "objeto_social é obrigatório";
  }

  if (typeof endereco !== "string" || !endereco.trim()) {
    return "endereco é obrigatório";
  }

  return null;
}

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

  if (processo.status !== "em_andamento") {
    return { status: 400, body: { erro: "Processo não está em andamento" } };
  }

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select("id, processo_id, tipo, status, concluida")
    .eq("id", etapaId)
    .eq("processo_id", processoId)
    .single();

  if (erroEtapa || !etapa) {
    return { status: 404, body: { erro: "Etapa não encontrada" } };
  }

  if (etapa.tipo !== "manual") {
    return {
      status: 400,
      body: { erro: "Etapa automatizada deve ser executada pelo fluxo de automação" },
    };
  }

  if (etapa.concluida) {
    return { status: 400, body: { erro: "Etapa já está concluída" } };
  }

  const { data: etapaAtualizada, error: erroUpdate } = await supabase
    .from("etapas")
    .update({
      status: STATUS_ETAPA.CONCLUIDA,
      concluida: true,
      concluida_em: new Date().toISOString(),
    })
    .eq("id", etapaId)
    .eq("processo_id", processoId)
    .eq("tipo", "manual")
    .eq("concluida", false)
    .select()
    .maybeSingle();

  if (erroUpdate) {
    console.error("[processos.controller] Erro ao atualizar etapa:", erroUpdate.message);
    return { status: 500, body: { erro: "Erro ao atualizar etapa" } };
  }

  if (!etapaAtualizada) {
    return { status: 409, body: { erro: "Etapa foi alterada por outra solicitação" } };
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

  if (processo.status !== "em_andamento") {
    return { status: 400, body: { erro: "Processo não está em andamento" } };
  }

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select("id, processo_id, tipo, acao, status, concluida, erro_execucao")
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

  const primeiraExecucao = etapa.status === STATUS_ETAPA.PENDENTE;
  const novaTentativa =
    etapa.status === STATUS_ETAPA.PRONTA &&
    typeof etapa.erro_execucao === "string" &&
    etapa.erro_execucao.trim();

  if (!primeiraExecucao && !novaTentativa) {
    return {
      status: 409,
      body: { erro: "Etapa já está aguardando ou executando a automação" },
    };
  }

  const erroPayload = validarPayloadExecucao(etapa.acao, payload);
  if (erroPayload) {
    return { status: 400, body: { erro: erroPayload } };
  }

  let queryUpdate = supabase
    .from("etapas")
    .update({
      status: STATUS_ETAPA.PRONTA,
      payload_execucao: payload,
      erro_execucao: null,
      execucao_token: null,
      execucao_iniciada_em: null,
    })
    .eq("id", etapaId)
    .eq("processo_id", processoId)
    .eq("tipo", "automatizada")
    .eq("status", etapa.status)
    .eq("concluida", false);

  queryUpdate = novaTentativa
    ? queryUpdate.eq("erro_execucao", etapa.erro_execucao)
    : queryUpdate.is("erro_execucao", null);

  const { data: etapaAtualizada, error: erroUpdate } = await queryUpdate
    .select()
    .maybeSingle();

  if (erroUpdate) {
    console.error("[processos.controller] Erro ao preparar execução da etapa:", erroUpdate.message);
    return { status: 500, body: { erro: "Erro ao registrar execução da etapa" } };
  }

  if (!etapaAtualizada) {
    return { status: 409, body: { erro: "Etapa foi alterada por outra solicitação" } };
  }

  return { status: 200, body: etapaAtualizada };
}

export async function executarAcaoEtapaJwt(req, res) {
  const { id: processoId, etapaId } = req.params;
  const body = corpoObjeto(req);

  const clienteId =
    req.usuario.perfil === PERFIS.ADMIN_EFFICIENCE
      ? body.cliente_id || req.query.cliente_id
      : req.usuario.cliente_id;

  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { cliente_id, ...payload } = body;
  const resultado = await _executarAcaoEtapa(processoId, etapaId, clienteId, payload);
  return res.status(resultado.status).json(resultado.body);
}

function processoRelacionado(etapa) {
  return Array.isArray(etapa.processos) ? etapa.processos[0] : etapa.processos;
}

async function reivindicarEtapaAgente(etapa, limiteLease, iniciadoEm) {
  const execucaoToken = randomUUID();
  let query = supabase
    .from("etapas")
    .update({
      status: STATUS_ETAPA.PROCESSANDO,
      execucao_token: execucaoToken,
      execucao_iniciada_em: iniciadoEm,
    })
    .eq("id", etapa.id)
    .eq("processo_id", etapa.processo_id)
    .eq("tipo", "automatizada")
    .eq("concluida", false)
    .eq("status", etapa.status)
    .is("erro_execucao", null);

  if (etapa.status === STATUS_ETAPA.PROCESSANDO) {
    query = query.lt("execucao_iniciada_em", limiteLease);
  }

  const { data, error } = await query
    .select("id, processo_id, acao, payload_execucao, execucao_token")
    .maybeSingle();

  return { data, error };
}

// O polling também reivindica as etapas de forma condicional. Assim, consultas
// concorrentes não recebem o mesmo trabalho. Claims abandonados expiram após o lease.
export async function listarEtapasProntasAgente(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);

  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const agora = new Date();
  const iniciadoEm = agora.toISOString();
  const limiteLease = new Date(agora.getTime() - LEASE_EXECUCAO_MS).toISOString();

  const { data: candidatas, error } = await supabase
    .from("etapas")
    .select(
      "id, processo_id, status, acao, payload_execucao, execucao_iniciada_em, processos!inner(cliente_id, status, nome_empresa, pasta_base)",
    )
    .eq("tipo", "automatizada")
    .eq("concluida", false)
    .is("erro_execucao", null)
    .eq("processos.cliente_id", licenca.cliente_id)
    .eq("processos.status", "em_andamento")
    .or(
      `status.eq.${STATUS_ETAPA.PRONTA},and(status.eq.${STATUS_ETAPA.PROCESSANDO},execucao_iniciada_em.lt.${limiteLease})`,
    )
    .order("execucao_iniciada_em", { ascending: true, nullsFirst: true })
    .limit(LIMITE_ETAPAS_POR_POLLING);

  if (error) {
    console.error("[processos.controller] Erro ao listar etapas prontas (agente):", error.message);
    return res.status(500).json({ erro: "Erro ao listar etapas" });
  }

  const claims = await Promise.all(
    (candidatas || []).map(async (etapa) => {
      const processo = processoRelacionado(etapa);
      const resultado = await reivindicarEtapaAgente(etapa, limiteLease, iniciadoEm);
      return { ...resultado, processo };
    }),
  );

  const errosClaim = claims.filter((claim) => claim.error);
  if (errosClaim.length > 0) {
    console.error(
      "[processos.controller] Erro ao reivindicar etapas:",
      errosClaim.map((claim) => claim.error.message).join("; "),
    );
  }

  const etapas = claims
    .filter((claim) => claim.data)
    .map(({ data: etapa, processo }) => ({
      id: etapa.id,
      processo_id: etapa.processo_id,
      acao: etapa.acao,
      payload: etapa.payload_execucao,
      execucao_token: etapa.execucao_token,
      nome_empresa: processo?.nome_empresa,
      pasta_base: processo?.pasta_base,
    }));

  if (errosClaim.length > 0 && etapas.length === 0 && (candidatas || []).length > 0) {
    return res.status(500).json({ erro: "Erro ao reivindicar etapas" });
  }

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
  const { sucesso, arquivo_gerado, erro, execucao_token: execucaoToken } = corpoObjeto(req);

  if (typeof sucesso !== "boolean") {
    return res.status(400).json({ erro: "sucesso deve ser booleano" });
  }

  if (
    typeof execucaoToken !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      execucaoToken,
    )
  ) {
    return res.status(400).json({ erro: "execucao_token inválido" });
  }

  if (sucesso && arquivo_gerado != null && typeof arquivo_gerado !== "string") {
    return res.status(400).json({ erro: "arquivo_gerado deve ser texto" });
  }

  const { data: etapa, error: erroEtapa } = await supabase
    .from("etapas")
    .select(
      "id, processo_id, tipo, status, execucao_token, processos!inner(cliente_id, status)",
    )
    .eq("id", etapaId)
    .maybeSingle();

  if (erroEtapa || !etapa) {
    return res.status(404).json({ erro: "Etapa não encontrada" });
  }

  const processo = processoRelacionado(etapa);
  if (processo?.cliente_id !== licenca.cliente_id) {
    return res.status(403).json({ erro: "Sem permissão para esta etapa" });
  }

  if (processo.status !== "em_andamento") {
    return res.status(409).json({ erro: "Processo não está em andamento" });
  }

  if (
    etapa.tipo !== "automatizada" ||
    etapa.status !== STATUS_ETAPA.PROCESSANDO ||
    etapa.execucao_token !== execucaoToken
  ) {
    return res.status(409).json({ erro: "Claim de execução não é mais válido" });
  }

  if (sucesso) {
    const { data: etapaAtualizada, error: erroUpdate } = await supabase
      .from("etapas")
      .update({
        status: STATUS_ETAPA.CONCLUIDA,
        concluida: true,
        concluida_em: new Date().toISOString(),
        arquivo_gerado: arquivo_gerado?.trim() || null,
        erro_execucao: null,
        execucao_token: null,
        execucao_iniciada_em: null,
      })
      .eq("id", etapaId)
      .eq("processo_id", etapa.processo_id)
      .eq("tipo", "automatizada")
      .eq("status", STATUS_ETAPA.PROCESSANDO)
      .eq("execucao_token", execucaoToken)
      .select()
      .maybeSingle();

    if (erroUpdate) {
      console.error("[processos.controller] Erro ao concluir execução da etapa:", erroUpdate.message);
      return res.status(500).json({ erro: "Erro ao concluir etapa" });
    }

    if (!etapaAtualizada) {
      return res.status(409).json({ erro: "Claim de execução não é mais válido" });
    }

    const { data: todasEtapas, error: erroTodasEtapas } = await supabase
      .from("etapas")
      .select("concluida")
      .eq("processo_id", etapa.processo_id);

    if (erroTodasEtapas) {
      console.error(
        "[processos.controller] Erro ao verificar conclusão do processo:",
        erroTodasEtapas.message,
      );
    } else if (todasEtapas.length > 0 && todasEtapas.every((e) => e.concluida)) {
      const { error: erroProcesso } = await supabase
        .from("processos")
        .update({ status: "concluido" })
        .eq("id", etapa.processo_id)
        .eq("status", "em_andamento");

      if (erroProcesso) {
        console.error(
          "[processos.controller] Erro ao concluir processo:",
          erroProcesso.message,
        );
      }
    }

    return res.status(200).json(etapaAtualizada);
  }

  const mensagemErro =
    typeof erro === "string" && erro.trim()
      ? erro.trim()
      : "Erro desconhecido na execução";

  const { data: etapaComErro, error: erroUpdateFalha } = await supabase
    .from("etapas")
    .update({
      status: STATUS_ETAPA.PRONTA,
      erro_execucao: mensagemErro,
      execucao_token: null,
      execucao_iniciada_em: null,
    })
    .eq("id", etapaId)
    .eq("processo_id", etapa.processo_id)
    .eq("tipo", "automatizada")
    .eq("status", STATUS_ETAPA.PROCESSANDO)
    .eq("execucao_token", execucaoToken)
    .select()
    .maybeSingle();

  if (erroUpdateFalha) {
    console.error("[processos.controller] Erro ao registrar falha da etapa:", erroUpdateFalha.message);
    return res.status(500).json({ erro: "Erro ao registrar falha da etapa" });
  }

  if (!etapaComErro) {
    return res.status(409).json({ erro: "Claim de execução não é mais válido" });
  }

  return res.status(200).json(etapaComErro);
}
