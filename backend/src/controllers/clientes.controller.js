import supabase from "../config/database.js";
import { validarTokenLicenca } from "../services/licenca.service.js";
import {
  ANEXOS_SIMPLES,
  REGIMES_TRIBUTARIOS,
  validarHistoricoReceita,
} from "../utils/regime-tributario.util.js";

function normalizarCnpj(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function vazio(valor) {
  return valor === null || (typeof valor === "string" && valor.trim() === "");
}

/**
 * Traduz os campos tributários do body em colunas de `clientes` (#496).
 *
 * São os três campos que `dispararApuracao` lê para montar a apuração do
 * Simples e que, até esta issue, só existiam no banco: sem tela nem endpoint
 * que os gravasse, nenhuma apuração podia ser criada por um usuário real.
 *
 * Campo ausente no body é campo não tocado; `null` ou string vazia limpam a
 * coluna. `atual` é o estado já persistido, necessário para validar a coerência
 * entre regime e anexo quando o PATCH só manda um dos dois.
 *
 * @returns {{ updates: object } | { erro: string }}
 */
function montarCamposTributarios(body, atual = {}) {
  const { regime_tributario, anexo_simples, historico_receita } = body;
  const updates = {};

  if (regime_tributario !== undefined) {
    if (vazio(regime_tributario)) {
      updates.regime_tributario = null;
    } else if (!REGIMES_TRIBUTARIOS.includes(regime_tributario)) {
      return { erro: `Regime tributário inválido. Use: ${REGIMES_TRIBUTARIOS.join(", ")}` };
    } else {
      updates.regime_tributario = regime_tributario;
    }

    // Sair do Simples sem dizer nada sobre o anexo deixaria a coluna pendurada
    // num regime que não a usa — é o estado inverso do que o QA-F achou no dev
    // (anexo preenchido, regime nulo). A tela já limpa; a API garante.
    if (updates.regime_tributario !== "simples_nacional" && anexo_simples === undefined) {
      updates.anexo_simples = null;
    }
  }

  if (anexo_simples !== undefined) {
    if (vazio(anexo_simples)) {
      updates.anexo_simples = null;
    } else {
      // A coluna tem CHECK no banco; normalizar e validar aqui troca um 500 de
      // constraint violation por um 400 com a lista de valores aceitos.
      const normalizado = String(anexo_simples).trim().toUpperCase();
      if (!ANEXOS_SIMPLES.includes(normalizado)) {
        return { erro: `Anexo do Simples inválido. Use: ${ANEXOS_SIMPLES.join(", ")}` };
      }
      updates.anexo_simples = normalizado;
    }
  }

  if (historico_receita !== undefined) {
    const validado = validarHistoricoReceita(historico_receita);
    if (validado.erro) {
      return {
        erro: "Histórico de receita inválido. Envie uma lista de { mes: 1-12, ano: >= 2020, receita: >= 0 }, sem competências repetidas",
      };
    }
    updates.historico_receita = validado.entradas;
  }

  // Simples Nacional sem anexo é exatamente o estado que trava a apuração
  // (`dispararApuracao` não acha a tabela do anexo). Só barra quando a própria
  // requisição mexe em regime ou anexo — um PATCH de status não deve falhar
  // por causa de um cadastro incoerente que já estava no banco.
  const tocouRegimeOuAnexo = "regime_tributario" in updates || "anexo_simples" in updates;
  if (tocouRegimeOuAnexo) {
    const regimeFinal =
      "regime_tributario" in updates ? updates.regime_tributario : (atual.regime_tributario ?? null);
    const anexoFinal =
      "anexo_simples" in updates ? updates.anexo_simples : (atual.anexo_simples ?? null);

    if (regimeFinal === "simples_nacional" && anexoFinal === null) {
      return { erro: `Cliente no Simples Nacional exige o anexo. Use: ${ANEXOS_SIMPLES.join(", ")}` };
    }
  }

  return { updates };
}

// Lista todos os clientes ordenados do mais recente para o mais antigo.
// Exclusivo para admin_efficience — painel interno da Efficience.
export async function listarClientes(req, res) {
  console.log("[clientes.controller] Listando todos os clientes");

  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("criado_em", { ascending: false });

  if (error) {
    console.error(
      "[clientes.controller] Erro ao listar clientes:",
      error.message,
    );
    return res.status(500).json({ erro: "Erro ao listar clientes" });
  }

  console.log(`[clientes.controller] ${data.length} cliente(s) retornado(s)`);
  return res.status(200).json(data);
}

export async function buscarCliente(req, res) {
  const { id } = req.params;

  console.log(`[clientes.controller] Buscando cliente: ${id}`);

  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.log(`[clientes.controller] Cliente não encontrado: ${id}`);
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  console.log(`[clientes.controller] Cliente encontrado: ${data.nome}`);
  return res.status(200).json(data);
}

/** Agente: resolve nome da pasta da empresa a partir do CNPJ. */
export async function buscarClientePorCnpj(req, res) {
  const token = req.headers["x-licenca-token"];
  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res.status(401).json({ erro: "Token de licença inválido ou expirado" });
  }

  const digitos = normalizarCnpj(req.query.cnpj);
  if (digitos.length !== 14) {
    return res.status(400).json({ erro: "CNPJ inválido" });
  }

  // Não registra CNPJ nem identificador do cliente: ambos são desnecessários
  // para operação e tornariam os logs uma nova superfície de dados sensíveis.
  console.log("[clientes.controller] Consulta de cliente por CNPJ autenticada");

  // Escopo por licença: o token só resolve o CNPJ do próprio cliente vinculado.
  // CNPJ de outro cliente cai no mesmo 404 de "não cadastrado" — não vaza
  // existência nem razão social fora do escopo do licenciado (LGPD, #449).
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("cnpj", digitos)
    .eq("id", licenca.cliente_id)
    .maybeSingle();

  if (error) {
    console.error(
      "[clientes.controller] Erro ao buscar por CNPJ:",
      error.message,
    );
    return res.status(500).json({ erro: "Erro ao buscar cliente" });
  }

  if (!data) {
    return res.status(404).json({ erro: "não encontrado" });
  }

  return res.status(200).json({ id: data.id, nome: data.nome });
}

export async function criarCliente(req, res) {
  const { nome, cnpj } = req.body;

  console.log(
    `[clientes.controller] Criando cliente — nome: ${nome} | cnpj: ${cnpj ?? "não informado"}`,
  );

  if (!nome) {
    console.log("[clientes.controller] Criação rejeitada — nome ausente");
    return res.status(400).json({ erro: "Campo obrigatório: nome" });
  }

  let cnpjNormalizado = null;
  if (cnpj !== undefined && cnpj !== null && String(cnpj).trim() !== "") {
    cnpjNormalizado = normalizarCnpj(cnpj);
    if (cnpjNormalizado.length !== 14) {
      return res.status(400).json({ erro: "CNPJ inválido" });
    }
  }

  const tributarios = montarCamposTributarios(req.body);
  if (tributarios.erro) {
    console.log(`[clientes.controller] Criação rejeitada — ${tributarios.erro}`);
    return res.status(400).json({ erro: tributarios.erro });
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({ nome, cnpj: cnpjNormalizado, ...tributarios.updates })
    .select()
    .single();

  if (error) {
    // Código 23505 = violação de unique constraint — CNPJ duplicado
    if (error.code === "23505") {
      console.log(`[clientes.controller] CNPJ já cadastrado: ${cnpjNormalizado}`);
      return res.status(409).json({ erro: "CNPJ já cadastrado" });
    }
    console.error(
      "[clientes.controller] Erro ao criar cliente:",
      error.message,
    );
    return res.status(500).json({ erro: "Erro ao criar cliente" });
  }

  console.log(`[clientes.controller] Cliente criado com sucesso: ${data.id}`);
  return res.status(201).json(data);
}

export async function atualizarCliente(req, res) {
  const { id } = req.params;

  console.log(`[clientes.controller] Atualizando cliente: ${id}`);

  const { data: cliente, error: erroBusca } = await supabase
    .from("clientes")
    .select("id, regime_tributario, anexo_simples")
    .eq("id", id)
    .single();

  if (erroBusca || !cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  const STATUSES_VALIDOS = ["ativo", "inativo", "suspenso"];
  const { nome, cnpj, status, esocial_configurado } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome;
  if (cnpj !== undefined) {
    if (cnpj === null || String(cnpj).trim() === "") {
      updates.cnpj = null;
    } else {
      const digitos = normalizarCnpj(cnpj);
      if (digitos.length !== 14) {
        return res.status(400).json({ erro: "CNPJ inválido" });
      }
      updates.cnpj = digitos;
    }
  }
  if (status !== undefined) {
    if (!STATUSES_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: "Status inválido. Use: ativo, inativo ou suspenso" });
    }
    updates.status = status;
  }
  // Libera o 1º evento eSocial do cliente (ver eventos-esocial.controller.js) —
  // rota já é admin_efficience-only (clientes.routes.js), então não precisa de
  // checagem de perfil adicional aqui.
  if (esocial_configurado !== undefined) {
    if (typeof esocial_configurado !== "boolean") {
      return res.status(400).json({ erro: "esocial_configurado deve ser boolean" });
    }
    updates.esocial_configurado = esocial_configurado;
  }

  // Regime, anexo e histórico de receita — os campos que a apuração do Simples
  // consome e que não tinham nenhuma via de escrita antes do #496.
  const tributarios = montarCamposTributarios(req.body, cliente);
  if (tributarios.erro) {
    console.log(`[clientes.controller] Atualização rejeitada — ${tributarios.erro}`);
    return res.status(400).json({ erro: tributarios.erro });
  }
  Object.assign(updates, tributarios.updates);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  const { data, error } = await supabase
    .from("clientes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ erro: "CNPJ já cadastrado" });
    }
    console.error("[clientes.controller] Erro ao atualizar cliente:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar cliente" });
  }

  console.log(`[clientes.controller] Cliente atualizado: ${id}`);
  return res.status(200).json(data);
}

export async function deletarCliente(req, res) {
  const { id } = req.params;

  console.log(`[clientes.controller] Deletando cliente: ${id}`);

  const { data: cliente, error: erroBusca } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", id)
    .single();

  if (erroBusca || !cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  const { error } = await supabase.from("clientes").delete().eq("id", id);

  if (error) {
    console.error("[clientes.controller] Erro ao deletar cliente:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar cliente" });
  }

  console.log(`[clientes.controller] Cliente deletado: ${id}`);
  return res.status(204).send();
}
