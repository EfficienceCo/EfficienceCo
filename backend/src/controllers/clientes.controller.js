import supabase from "../config/database.js";

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

export async function criarCliente(req, res) {
  const { nome, cnpj } = req.body;

  console.log(
    `[clientes.controller] Criando cliente — nome: ${nome} | cnpj: ${cnpj ?? "não informado"}`,
  );

  if (!nome) {
    console.log("[clientes.controller] Criação rejeitada — nome ausente");
    return res.status(400).json({ erro: "Campo obrigatório: nome" });
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({ nome, cnpj })
    .select()
    .single();

  if (error) {
    // Código 23505 = violação de unique constraint — CNPJ duplicado
    if (error.code === "23505") {
      console.log(`[clientes.controller] CNPJ já cadastrado: ${cnpj}`);
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
    .select("id")
    .eq("id", id)
    .single();

  if (erroBusca || !cliente) {
    return res.status(404).json({ erro: "Cliente não encontrado" });
  }

  const STATUSES_VALIDOS = ["ativo", "inativo", "suspenso"];
  const { nome, cnpj, status } = req.body;
  const updates = {};
  if (nome !== undefined) updates.nome = nome;
  if (cnpj !== undefined) updates.cnpj = cnpj;
  if (status !== undefined) {
    if (!STATUSES_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: "Status inválido. Use: ativo, inativo ou suspenso" });
    }
    updates.status = status;
  }

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
