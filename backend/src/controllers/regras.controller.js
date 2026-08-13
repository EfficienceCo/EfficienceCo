import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import { PERFIS, resolverClienteId } from "../middlewares/permissao.middleware.js";

const ACOES_VALIDAS = new Set([
  "mover",
  "renomear",
  "organizar_arquivo",
  "upload_folha",
  "abertura_empresa",
]);

/** pasta_destino obrigatória conforme a ação (alinhar ao FE SCHEMA_ACAO). */
const ACOES_EXIGEM_DESTINO = new Set([
  "mover",
  "organizar_arquivo",
  "abertura_empresa",
]);

const ACOES_EXIGEM_ORIGEM = new Set([
  "mover",
  "renomear",
  "organizar_arquivo",
  "upload_folha",
]);

/** Próxima versão de regras do cliente (MAX(versao) atual + 1), usada pelo agente pra detectar mudança sem baixar tudo. */
async function proximaVersaoRegras(clienteId) {
  const { data, error } = await supabase
    .from("regras")
    .select("versao")
    .eq("cliente_id", clienteId)
    .order("versao", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[regras.controller] Erro ao buscar versão atual de regras:", error.message);
  }

  return (data?.versao ?? 0) + 1;
}

function parseCondicao(condicao) {
  if (condicao === undefined || condicao === null || typeof condicao === "object") {
    return { valor: condicao };
  }

  try {
    return { valor: JSON.parse(condicao) };
  } catch {
    return { erro: "condicao inválida: deve ser um objeto JSON ou uma string JSON válida" };
  }
}

function campoPreenchido(valor) {
  return valor !== undefined && valor !== null && String(valor).trim() !== "";
}

/**
 * Valida campos por ação. Em PATCH parcial (sem acao no body), só valida o que veio.
 */
function validarCamposPorAcao({ acao, pasta_origem, pasta_destino, condicao }, { parcial = false } = {}) {
  if (acao !== undefined && acao !== null && acao !== "") {
    if (!ACOES_VALIDAS.has(acao)) {
      return { erro: `acao inválida: use uma de ${[...ACOES_VALIDAS].join(", ")}` };
    }
  } else if (!parcial) {
    return { erro: "acao é obrigatória" };
  }

  const acaoEfetiva = acao || null;

  if (acaoEfetiva && ACOES_EXIGEM_ORIGEM.has(acaoEfetiva)) {
    if (!parcial || pasta_origem !== undefined) {
      if (!campoPreenchido(pasta_origem)) {
        return { erro: "pasta_origem é obrigatória para esta ação" };
      }
    }
  }

  if (acaoEfetiva && ACOES_EXIGEM_DESTINO.has(acaoEfetiva)) {
    if (!parcial || pasta_destino !== undefined) {
      if (!campoPreenchido(pasta_destino)) {
        return { erro: "pasta_destino é obrigatória para esta ação" };
      }
    }
  }

  if (acaoEfetiva === "abertura_empresa") {
    if (!parcial || condicao !== undefined) {
      const nome =
        condicao && typeof condicao === "object" ? condicao.nome_empresa : null;
      const legado =
        typeof condicao === "string" && condicao.startsWith("nome_empresa=")
          ? condicao.split("=", 2)[1]
          : null;
      if (!campoPreenchido(nome) && !campoPreenchido(legado)) {
        return { erro: "condicao.nome_empresa é obrigatória para abertura_empresa" };
      }
    }
  }

  return {};
}

export async function listarRegras(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  console.log("[regras.controller] Listando regras para cliente:", clienteId);

  const { data, error } = await supabase
    .from("regras")
    .select("*")
    .eq("cliente_id", clienteId);

  if (error) {
    console.error("[regras.controller] Erro ao listar regras:", error.message);
    return res.status(500).json({ erro: "Erro ao listar regras" });
  }

  return res.status(200).json(data);
}

export async function criarRegra(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { pasta_origem, pasta_destino, condicao, acao, ativa } = req.body;

  const { valor: condicaoParseada, erro: erroCondicao } = parseCondicao(condicao);
  if (erroCondicao) {
    return res.status(400).json({ erro: erroCondicao });
  }

  const { erro: erroCampos } = validarCamposPorAcao({
    acao,
    pasta_origem,
    pasta_destino,
    condicao: condicaoParseada,
  });
  if (erroCampos) {
    return res.status(400).json({ erro: erroCampos });
  }

  const destinoNormalizado =
    pasta_destino === undefined || pasta_destino === null ? "" : pasta_destino;

  console.log("[regras.controller] Criando regra para cliente:", clienteId);

  const versao = await proximaVersaoRegras(clienteId);

  const { data, error } = await supabase
    .from("regras")
    .insert({
      cliente_id: clienteId,
      pasta_origem,
      pasta_destino: destinoNormalizado,
      condicao: condicaoParseada,
      acao,
      ativa,
      versao,
    })
    .select()
    .single();

  if (error) {
    console.error("[regras.controller] Erro ao criar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao criar regra" });
  }

  return res.status(201).json(data);
}

export async function atualizarRegra(req, res) {
  const { id } = req.params;

  const { data: regra, error: erroBusca } = await supabase
    .from("regras")
    .select("cliente_id, acao, pasta_origem, pasta_destino, condicao")
    .eq("id", id)
    .single();

  if (erroBusca || !regra) {
    return res.status(404).json({ erro: "Regra não encontrada" });
  }

  if (
    req.usuario.perfil !== PERFIS.ADMIN_EFFICIENCE &&
    regra.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para alterar esta regra" });
  }

  const { pasta_origem, pasta_destino, condicao, acao, ativa } = req.body;
  const updates = {};
  if (pasta_origem !== undefined) updates.pasta_origem = pasta_origem;
  if (pasta_destino !== undefined) updates.pasta_destino = pasta_destino ?? "";
  if (condicao !== undefined) {
    const { valor: condicaoParseada, erro: erroCondicao } = parseCondicao(condicao);
    if (erroCondicao) {
      return res.status(400).json({ erro: erroCondicao });
    }
    updates.condicao = condicaoParseada;
  }
  if (acao !== undefined) updates.acao = acao;
  if (ativa !== undefined) updates.ativa = ativa;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  const acaoEfetiva = updates.acao ?? regra.acao;
  const { erro: erroCampos } = validarCamposPorAcao(
    {
      acao: acaoEfetiva,
      pasta_origem: updates.pasta_origem ?? regra.pasta_origem,
      pasta_destino: updates.pasta_destino ?? regra.pasta_destino,
      condicao: updates.condicao ?? regra.condicao,
    },
    { parcial: true },
  );
  if (erroCampos) {
    return res.status(400).json({ erro: erroCampos });
  }

  updates.versao = await proximaVersaoRegras(regra.cliente_id);

  console.log("[regras.controller] Atualizando regra:", id);

  const { data, error } = await supabase
    .from("regras")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[regras.controller] Erro ao atualizar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar regra" });
  }

  return res.status(200).json(data);
}

export async function deletarRegra(req, res) {
  const { id } = req.params;

  const { data: regra, error: erroBusca } = await supabase
    .from("regras")
    .select("cliente_id")
    .eq("id", id)
    .single();

  if (erroBusca || !regra) {
    return res.status(404).json({ erro: "Regra não encontrada" });
  }

  if (
    req.usuario.perfil !== PERFIS.ADMIN_EFFICIENCE &&
    regra.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para remover esta regra" });
  }

  console.log("[regras.controller] Deletando regra:", id);

  const { error } = await supabase.from("regras").delete().eq("id", id);

  if (error) {
    console.error("[regras.controller] Erro ao deletar regra:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar regra" });
  }

  return res.status(204).send();
}

export async function buscarVersaoRegras(req, res) {
  const { clienteId } = req.params;
  const token = req.headers["x-licenca-token"];

  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  if (licenca.cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Token não pertence a este cliente" });
  }

  const { data, error } = await supabase
    .from("regras")
    .select("versao")
    .eq("cliente_id", clienteId)
    .order("versao", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[regras.controller] Erro ao buscar versão:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar versão das regras" });
  }

  return res.status(200).json({ versao: data?.versao ?? null });
}

export async function buscarRegras(req, res) {
  const { clienteId } = req.params;
  const token = req.headers["x-licenca-token"];

  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res
      .status(401)
      .json({ erro: "Token de licença inválido ou expirado" });
  }

  if (licenca.cliente_id !== clienteId) {
    return res.status(403).json({ erro: "Token não pertence a este cliente" });
  }

  console.log("[regras.controller] Buscando regras para cliente:", clienteId);

  const { data, error } = await supabase
    .from("regras")
    .select("*")
    .eq("cliente_id", clienteId);

  if (error) {
    console.error("[regras.controller] Erro ao buscar regras:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar regras" });
  }

  return res.status(200).json(data);
}
