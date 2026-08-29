import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";

const CAMPOS_OBRIGATORIOS_POST = ["cpf", "nome", "data_admissao", "categoria", "salario"];
const CAMPOS_EDITAVEIS_PATCH = ["nome", "cargo", "cbo", "salario"];

function camposFaltando(body, campos) {
  return campos.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

/**
 * POST /funcionarios
 * Cria um novo funcionário para um cliente.
 * Usado após aprovação de S-2200 (admissão).
 */
export async function criarFuncionario(req, res) {
  const { cpf, nome, data_admissao, cargo, cbo, categoria, salario } = req.body;

  const faltando = camposFaltando(req.body, CAMPOS_OBRIGATORIOS_POST);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  // Validações básicas
  if (typeof salario !== "number" || salario < 0) {
    return res.status(400).json({ erro: "salario deve ser um número não negativo" });
  }

  if (!cpf || cpf.trim().length === 0) {
    return res.status(400).json({ erro: "cpf é obrigatório e não pode ser vazio" });
  }

  if (!categoria || categoria.trim().length === 0) {
    return res.status(400).json({ erro: "categoria é obrigatória e não pode ser vazia" });
  }

  const clienteId = req.usuario?.cliente_id;

  if (!clienteId) {
    return res.status(401).json({ erro: "Usuário não autenticado ou sem cliente_id" });
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .insert([
      {
        cliente_id: clienteId,
        cpf,
        nome,
        data_admissao,
        cargo: cargo || null,
        cbo: cbo || null,
        categoria,
        salario,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    // Violação de UNIQUE(cliente_id, cpf, data_admissao)
    if (error.code === "23505") {
      return res.status(409).json({
        erro: "Funcionário já existe com este CPF e data de admissão",
      });
    }
    console.error("[funcionarios.controller] Erro ao criar funcionário:", error.message);
    return res.status(500).json({ erro: "Erro ao criar funcionário" });
  }

  return res.status(201).json(data);
}

/**
 * GET /funcionarios
 * Lista funcionários do cliente (ativos e desligados).
 * Query: clienteId (obrigatório para admin, extraído de req.usuario para usuários comuns)
 */
export async function listarFuncionarios(req, res) {
  let clienteId = req.usuario?.cliente_id;

  // Admin pode listar funcionários de outro cliente via query
  if (req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE) {
    clienteId = req.query.clienteId || clienteId;
  }

  if (!clienteId) {
    return res.status(400).json({ erro: "clienteId é obrigatório" });
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("[funcionarios.controller] Erro ao listar funcionários:", error.message);
    return res.status(500).json({ erro: "Erro ao listar funcionários" });
  }

  return res.status(200).json(data || []);
}

/**
 * GET /funcionarios/:id
 * Retorna detalhe de um funcionário específico.
 * Isolamento multi-tenant: 404 se for de outro cliente.
 */
export async function obterFuncionario(req, res) {
  const { id } = req.params;

  const { data: funcionario, error: erroBusca } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (
    !funcionario ||
    (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE &&
      funcionario.cliente_id !== req.usuario?.cliente_id)
  ) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  return res.status(200).json(funcionario);
}

/**
 * PATCH /funcionarios/:id
 * Edita dados cadastrais de um funcionário (nome, endereço, cargo, CBO, salário).
 * Usado por S-2205 (alteração de dados).
 * Não permite editar CPF ou data_admissao.
 */
export async function editarFuncionario(req, res) {
  const { id } = req.params;
  const atualizacoes = {};

  // Validar quais campos podem ser editados
  for (const campo of CAMPOS_EDITAVEIS_PATCH) {
    if (req.body[campo] !== undefined) {
      if (typeof req.body[campo] === "string" && req.body[campo].trim() === "") {
        atualizacoes[campo] = null; // Permitir null para campos opcionais
      } else {
        atualizacoes[campo] = req.body[campo];
      }
    }
  }

  // Rejeitar campos não editáveis
  const camposNaoEditaveis = Object.keys(req.body).filter(
    (campo) => !CAMPOS_EDITAVEIS_PATCH.includes(campo),
  );
  if (camposNaoEditaveis.length > 0) {
    return res.status(400).json({
      erro: "Campos não editáveis",
      camposNaoEditaveis,
      editaveisApenas: CAMPOS_EDITAVEIS_PATCH,
    });
  }

  // Se não houver atualização, retornar 400
  if (Object.keys(atualizacoes).length === 0) {
    return res.status(400).json({
      erro: "Nenhum campo válido para editar",
      editaveisApenas: CAMPOS_EDITAVEIS_PATCH,
    });
  }

  // Buscar funcionário primeiro para validar isolamento
  const { data: funcionario, error: erroBusca } = await supabase
    .from("funcionarios")
    .select("cliente_id")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (
    !funcionario ||
    (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE &&
      funcionario.cliente_id !== req.usuario?.cliente_id)
  ) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  atualizacoes.atualizado_em = new Date().toISOString();

  const { data, error } = await supabase
    .from("funcionarios")
    .update(atualizacoes)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[funcionarios.controller] Erro ao editar funcionário:", error.message);
    return res.status(500).json({ erro: "Erro ao editar funcionário" });
  }

  if (!data) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  return res.status(200).json(data);
}

/**
 * PATCH /funcionarios/:id/desligar
 * Registra a data de desligamento de um funcionário.
 * Usado após aprovação de S-2299 (término de vínculo).
 */
export async function desligarFuncionario(req, res) {
  const { id } = req.params;
  const { data_desligamento } = req.body;

  if (!data_desligamento) {
    return res.status(400).json({ erro: "data_desligamento é obrigatória" });
  }

  // Buscar funcionário primeiro para validar isolamento
  const { data: funcionario, error: erroBusca } = await supabase
    .from("funcionarios")
    .select("cliente_id, data_desligamento")
    .eq("id", id)
    .maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (
    !funcionario ||
    (req.usuario?.perfil !== PERFIS.ADMIN_EFFICIENCE &&
      funcionario.cliente_id !== req.usuario?.cliente_id)
  ) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  if (funcionario.data_desligamento) {
    return res.status(409).json({ erro: "Funcionário já foi desligado" });
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .update({
      data_desligamento,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[funcionarios.controller] Erro ao desligar funcionário:", error.message);
    return res.status(500).json({ erro: "Erro ao desligar funcionário" });
  }

  if (!data) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  return res.status(200).json(data);
}
