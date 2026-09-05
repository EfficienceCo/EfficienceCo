import supabase from "../config/database.js";
import { PERFIS } from "../config/perfis.js";
import { resolverClienteId } from "../middlewares/permissao.middleware.js";
import { dataIsoValida } from "../utils/data.util.js";

const CAMPOS_OBRIGATORIOS_POST = ["cpf", "nome", "data_admissao", "categoria", "salario"];
const CAMPOS_EDITAVEIS_PATCH = ["nome", "endereco", "cargo", "cbo", "salario"];

function camposFaltando(body, campos) {
  return campos.filter(
    (campo) => body[campo] === undefined || body[campo] === null || body[campo] === "",
  );
}

function cpfValido(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calcularDigito = (quantidade) => {
    const soma = cpf
      .slice(0, quantidade)
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * (quantidade + 1 - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(cpf[9]) && calcularDigito(10) === Number(cpf[10]);
}

function ehAdminEfficience(req) {
  return req.usuario?.perfil === PERFIS.ADMIN_EFFICIENCE;
}

function funcionarioPertenceAoCliente(req, funcionario) {
  return ehAdminEfficience(req) || funcionario.cliente_id === resolverClienteId(req);
}

function aplicarIsolamentoCliente(query, req) {
  if (ehAdminEfficience(req)) {
    return query;
  }

  return query.eq("cliente_id", resolverClienteId(req));
}

function enderecoValido(endereco) {
  return endereco === null || Object.prototype.toString.call(endereco) === "[object Object]";
}

/**
 * POST /funcionarios
 * Cria um novo funcionário para um cliente.
 * Usado após aprovação de S-2200 (admissão).
 */
export async function criarFuncionario(req, res) {
  const body = req.body ?? {};
  const { cpf, nome, data_admissao, endereco, cargo, cbo, categoria, salario } = body;

  const faltando = camposFaltando(body, CAMPOS_OBRIGATORIOS_POST);
  if (faltando.length > 0) {
    return res.status(400).json({ erro: "Campos obrigatórios faltando", faltando });
  }

  // Validações básicas
  if (!Number.isFinite(salario) || salario < 0) {
    return res.status(400).json({ erro: "salario deve ser um número não negativo" });
  }

  const cpfNormalizado = typeof cpf === "string" ? cpf.replace(/\D/g, "") : "";
  if (cpfNormalizado.length !== 11) {
    return res.status(400).json({ erro: "cpf deve conter 11 dígitos" });
  }

  if (!cpfValido(cpfNormalizado)) {
    return res.status(400).json({ erro: "cpf inválido" });
  }

  if (typeof nome !== "string" || nome.trim().length === 0) {
    return res.status(400).json({ erro: "nome e obrigatorio e nao pode ser vazio" });
  }

  if (typeof categoria !== "string" || categoria.trim().length === 0) {
    return res.status(400).json({ erro: "categoria é obrigatória e não pode ser vazia" });
  }

  if (endereco !== undefined && !enderecoValido(endereco)) {
    return res.status(400).json({ erro: "endereco deve ser um objeto ou null" });
  }

  if (!dataIsoValida(data_admissao)) {
    return res.status(400).json({ erro: "data_admissao deve estar no formato AAAA-MM-DD" });
  }

  const clienteId = resolverClienteId(req);

  if (!clienteId) {
    return res.status(401).json({ erro: "Usuário não autenticado ou sem cliente_id" });
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .insert({
      cliente_id: clienteId,
      cpf: cpfNormalizado,
      nome: nome.trim(),
      data_admissao,
      endereco: endereco ?? null,
      cargo: typeof cargo === "string" && cargo.trim() ? cargo.trim() : null,
      cbo: typeof cbo === "string" && cbo.trim() ? cbo.trim() : null,
      categoria: categoria.trim(),
      salario,
    })
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
  const clienteId = resolverClienteId(req);

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

  let query = supabase
    .from("funcionarios")
    .select("*")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: funcionario, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (!funcionario || !funcionarioPertenceAoCliente(req, funcionario)) {
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
  const body = req.body ?? {};
  const atualizacoes = {};

  // Validar quais campos podem ser editados
  for (const campo of CAMPOS_EDITAVEIS_PATCH) {
    if (body[campo] === undefined) {
      continue;
    }

    const valor = body[campo];

    if (campo === "nome") {
      if (typeof valor !== "string" || !valor.trim()) {
        return res.status(400).json({ erro: "nome não pode ser vazio" });
      }
      atualizacoes.nome = valor.trim();
      continue;
    }

    if (campo === "endereco") {
      if (!enderecoValido(valor)) {
        return res.status(400).json({ erro: "endereco deve ser um objeto ou null" });
      }
      atualizacoes.endereco = valor;
      continue;
    }

    if (campo === "salario") {
      if (!Number.isFinite(valor) || valor < 0) {
        return res.status(400).json({ erro: "salario deve ser um número não negativo" });
      }
      atualizacoes.salario = valor;
      continue;
    }

    if (typeof valor !== "string") {
      return res.status(400).json({ erro: `${campo} deve ser um texto` });
    }

    atualizacoes[campo] = valor.trim() || null;
  }

  // Rejeitar campos não editáveis
  const camposNaoEditaveis = Object.keys(body).filter(
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
  let query = supabase
    .from("funcionarios")
    .select("cliente_id")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: funcionario, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (!funcionario || !funcionarioPertenceAoCliente(req, funcionario)) {
    return res.status(404).json({ erro: "Funcionário não encontrado" });
  }

  atualizacoes.atualizado_em = new Date().toISOString();

  const { data, error } = await supabase
    .from("funcionarios")
    .update(atualizacoes)
    .eq("id", id)
    .eq("cliente_id", funcionario.cliente_id)
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
  const { data_desligamento } = req.body ?? {};

  if (!data_desligamento) {
    return res.status(400).json({ erro: "data_desligamento é obrigatória" });
  }

  if (!dataIsoValida(data_desligamento)) {
    return res.status(400).json({ erro: "data_desligamento deve estar no formato AAAA-MM-DD" });
  }

  // Buscar funcionário primeiro para validar isolamento
  let query = supabase
    .from("funcionarios")
    .select("cliente_id, data_desligamento")
    .eq("id", id);
  query = aplicarIsolamentoCliente(query, req);

  const { data: funcionario, error: erroBusca } = await query.maybeSingle();

  if (erroBusca) {
    console.error("[funcionarios.controller] Erro ao buscar funcionário:", erroBusca.message);
    return res.status(500).json({ erro: "Erro ao buscar funcionário" });
  }

  // Isolamento multi-tenant: 404 nunca 403
  if (!funcionario || !funcionarioPertenceAoCliente(req, funcionario)) {
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
    .eq("cliente_id", funcionario.cliente_id)
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
