import supabase from "../config/database.js";
import { criar as criarNotificacao } from "../services/notificacoes.service.js";

function resolverClienteId(req) {
  if (req.usuario?.perfil === "admin_efficience") {
    return req.body.cliente_id || req.query.cliente_id;
  }
  return req.usuario?.cliente_id;
}

export async function listarObrigacoes(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { status, mes, ano } = req.query;

  let query = supabase
    .from("obrigacoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("data_vencimento", { ascending: true });

  if (status) query = query.eq("status", status);

  if (mes && ano) {
    const mesFormatado = String(mes).padStart(2, "0");
    const inicioMes = `${ano}-${mesFormatado}-01`;
    const fimMes = new Date(parseInt(ano), parseInt(mes), 0)
      .toISOString()
      .slice(0, 10);
    query = query.gte("data_vencimento", inicioMes).lte("data_vencimento", fimMes);
  } else if (ano) {
    query = query
      .gte("data_vencimento", `${ano}-01-01`)
      .lte("data_vencimento", `${ano}-12-31`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[obrigacoes.controller] Erro ao listar:", error.message);
    return res.status(500).json({ erro: "Erro ao listar obrigações" });
  }

  return res.status(200).json(data);
}

function adicionarMeses(dataStr, meses) {
  const pura = dataStr.slice(0, 10);
  const [ano, mes, dia] = pura.split("-").map(Number);
  const totalMeses = mes - 1 + meses;
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoMes = totalMeses % 12;
  const ultimoDia = new Date(novoAno, novoMes + 1, 0).getDate();
  const novoDia = Math.min(dia, ultimoDia);
  return `${novoAno}-${String(novoMes + 1).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}

function gerarOcorrencias({ clienteId, nome, tipo, data_vencimento }) {
  const ocorrencias = [];
  const limites = { mensal: 12, anual: 4 };
  const incremento = tipo === "mensal" ? 1 : 12;
  const total = limites[tipo];

  if (!total) return ocorrencias;

  const limites = { mensal: 12, anual: 4 };
  const incremento = tipo === "mensal" ? 1 : 12;
  const total = limites[tipo];
  if (!total) return [];

  const ocorrencias = [];
  for (let i = 1; i <= total; i++) {
    ocorrencias.push({
      cliente_id: clienteId,
      nome,
      tipo,
      status: "pendente",
      data_vencimento: adicionarMeses(data_vencimento, i * incremento),
      recorrente: true,
    });
  }

  return ocorrencias;
}

export async function criarObrigacao(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const { nome, tipo, data_vencimento, recorrente } = req.body;

  if (!nome || !tipo || !data_vencimento) {
    return res.status(400).json({ erro: "nome, tipo e data_vencimento são obrigatórios" });
  }

  if (recorrente === true && tipo === "eventual") {
    return res.status(400).json({ erro: "Obrigações eventuais não podem ser recorrentes" });
  }

  const { data, error } = await supabase
    .from("obrigacoes")
    .insert({ cliente_id: clienteId, nome, tipo, data_vencimento, recorrente: recorrente === true })
    .select()
    .single();

  if (error) {
    console.error("[obrigacoes.controller] Erro ao criar:", error.message);
    return res.status(500).json({ erro: "Erro ao criar obrigação" });
  }

  if (recorrente === true) {
    const ocorrencias = gerarOcorrencias({ clienteId, nome, tipo, data_vencimento });
    if (ocorrencias.length > 0) {
      const { error: erroOcorrencias } = await supabase
        .from("obrigacoes")
        .insert(ocorrencias);

      if (erroOcorrencias) {
        console.error("[obrigacoes.controller] Erro ao gerar ocorrências:", erroOcorrencias.message);
        return res.status(500).json({ erro: "Obrigação criada, mas falha ao gerar ocorrências recorrentes" });
      }
    }
  }

  return res.status(201).json(data);
}

export async function atualizarObrigacao(req, res) {
  const { id } = req.params;

  const { data: obrigacao, error: erroBusca } = await supabase
    .from("obrigacoes")
    .select("cliente_id")
    .eq("id", id)
    .single();

  if (erroBusca || !obrigacao) {
    return res.status(404).json({ erro: "Obrigação não encontrada" });
  }

  if (
    req.usuario.perfil !== "admin_efficience" &&
    obrigacao.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para alterar esta obrigação" });
  }

  const { nome, tipo, data_vencimento, recorrente, status } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome;
  if (tipo !== undefined) updates.tipo = tipo;
  if (data_vencimento !== undefined) updates.data_vencimento = data_vencimento;
  if (recorrente !== undefined) updates.recorrente = recorrente;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo para atualizar" });
  }

  const { data, error } = await supabase
    .from("obrigacoes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[obrigacoes.controller] Erro ao atualizar:", error.message);
    return res.status(500).json({ erro: "Erro ao atualizar obrigação" });
  }

  return res.status(200).json(data);
}

export async function deletarObrigacao(req, res) {
  const { id } = req.params;

  const { data: obrigacao, error: erroBusca } = await supabase
    .from("obrigacoes")
    .select("cliente_id")
    .eq("id", id)
    .single();

  if (erroBusca || !obrigacao) {
    return res.status(404).json({ erro: "Obrigação não encontrada" });
  }

  if (
    req.usuario.perfil !== "admin_efficience" &&
    obrigacao.cliente_id !== req.usuario.cliente_id
  ) {
    return res.status(403).json({ erro: "Sem permissão para remover esta obrigação" });
  }

  const { error } = await supabase.from("obrigacoes").delete().eq("id", id);

  if (error) {
    console.error("[obrigacoes.controller] Erro ao deletar:", error.message);
    return res.status(500).json({ erro: "Erro ao deletar obrigação" });
  }

  return res.status(204).send();
}

export async function proximasObrigacoes(req, res) {
  const clienteId = resolverClienteId(req);
  if (!clienteId) {
    return res.status(400).json({ erro: "cliente_id é obrigatório" });
  }

  const dias = Math.max(1, parseInt(req.query.dias) || 7);
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);

  const hojeStr = hoje.toISOString().slice(0, 10);
  const limiteStr = limite.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("obrigacoes")
    .select("*")
    .eq("cliente_id", clienteId)
    .gte("data_vencimento", hojeStr)
    .lte("data_vencimento", limiteStr)
    .order("data_vencimento", { ascending: true });

  if (error) {
    console.error("[obrigacoes.controller] Erro ao buscar próximas:", error.message);
    return res.status(500).json({ erro: "Erro ao buscar próximas obrigações" });
  }

  // Gera notificações para vencimentos em ≤ 3 dias, sem duplicar por dia
  const limite3Dias = new Date(hoje);
  limite3Dias.setDate(limite3Dias.getDate() + 3);
  const limite3Str = limite3Dias.toISOString().slice(0, 10);

  const iminentes = data.filter((o) => o.data_vencimento <= limite3Str);

  const hojeInicio = new Date(hoje);
  hojeInicio.setHours(0, 0, 0, 0);

  for (const obrigacao of iminentes) {
    const msRestantes = new Date(obrigacao.data_vencimento) - hoje;
    const diasRestantes = Math.ceil(msRestantes / (1000 * 60 * 60 * 24));
    const mensagem = `Obrigação "${obrigacao.nome}" [${obrigacao.id}] vence em ${diasRestantes} dia(s).`;

    const { data: existente } = await supabase
      .from("notificacoes")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("tipo", "obrigacao_vencendo")
      .gte("criado_em", hojeInicio.toISOString())
      .ilike("mensagem", `%${obrigacao.id}%`)
      .maybeSingle();

    if (!existente) {
      await criarNotificacao(clienteId, "obrigacao_vencendo", mensagem);
    }
  }

  return res.status(200).json(data);
}
