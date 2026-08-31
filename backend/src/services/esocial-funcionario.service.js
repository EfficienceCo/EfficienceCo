// Ponte entre a aprovação de um evento do eSocial e a tabela `funcionarios`.
//
// #ES-5 (endpoints de funcionário) ainda não existe. Enquanto isso, este
// service escreve direto na tabela. Quando #ES-5 mergear, trocar o corpo das
// duas funções por chamadas ao controller/service dele — a assinatura e os
// pontos de chamada (eventos-esocial.controller.js) não mudam.

import supabase from "../config/database.js";
import { formatarData, formatarValor } from "../utils/esocial-xml.util.js";

// Aplica um normalizador do gerador (formatarData/formatarValor), devolvendo
// `null` em vez de propagar o ErroXmlESocial — a coluna correspondente é
// NOT NULL, então entrada inválida cai no guard de mapearFuncionario com
// mensagem clara, não num erro de constraint do Postgres.
function normalizar(fn) {
  try {
    const v = fn();
    return v === "" || v === undefined ? null : v;
  } catch {
    return null;
  }
}

// Extrai os campos de `funcionarios` a partir do formulário de um S-2200.
// O formulário segue o shape que o gerador de XML espera:
//   { funcionario: { cpf, nome, ... }, dadosAdmissao: { dataAdmissao, codCateg,
//     cargo: { nome, cbo }, remuneracao: { valorSalarioFixo }, ... } }
function mapearFuncionario(clienteId, dadosFormulario) {
  const f = dadosFormulario?.funcionario ?? {};
  const a = dadosFormulario?.dadosAdmissao ?? {};

  return {
    cliente_id: clienteId,
    cpf: String(f.cpf ?? "").replace(/\D+/g, ""),
    nome: f.nome ?? null,
    data_admissao: normalizar(() => formatarData(a.dataAdmissao)), // -> "AAAA-MM-DD"
    cargo: a.cargo?.nome ?? null,
    cbo: a.cargo?.cbo != null ? String(a.cargo.cbo).replace(/\D+/g, "") : null,
    categoria: a.codCateg != null ? String(a.codCateg) : null,
    salario: normalizar(() => formatarValor(a.remuneracao?.valorSalarioFixo)), // ponto decimal, 2 casas
  };
}

/**
 * Cria (ou reaproveita) o registro em `funcionarios` a partir de um S-2200
 * aprovado. Idempotente: a tabela tem UNIQUE(cliente_id, cpf, data_admissao),
 * então uma reexecução devolve o funcionário já existente em vez de estourar.
 *
 * @returns {Promise<{ funcionario: object|null, erro: string|null }>}
 */
export async function criarFuncionarioDeS2200({ clienteId, dadosFormulario }) {
  const registro = mapearFuncionario(clienteId, dadosFormulario);

  // Colunas NOT NULL de `funcionarios`: cpf, nome, data_admissao, categoria, salario.
  if (
    !registro.cpf ||
    !registro.nome ||
    !registro.data_admissao ||
    !registro.categoria ||
    registro.salario == null
  ) {
    return {
      funcionario: null,
      erro: "Formulário do S-2200 incompleto para criar o funcionário (cpf/nome/dataAdmissao/categoria/salário)",
    };
  }

  const { data: existente } = await supabase
    .from("funcionarios")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("cpf", registro.cpf)
    .eq("data_admissao", registro.data_admissao)
    .maybeSingle();

  if (existente) {
    return { funcionario: existente, erro: null };
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .insert(registro)
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "[esocial-funcionario.service] Erro ao criar funcionário do S-2200:",
      error.message,
    );
    return { funcionario: null, erro: "Falha ao criar funcionário a partir do S-2200" };
  }

  return { funcionario: data, erro: null };
}

/**
 * Marca o desligamento em `funcionarios` a partir de um S-2299 aprovado.
 * Equivale ao PATCH /funcionarios/:id/desligar previsto no #ES-5.
 *
 * @returns {Promise<{ funcionario: object|null, erro: string|null }>}
 */
export async function desligarFuncionarioDeS2299({ funcionarioId, dadosFormulario }) {
  if (!funcionarioId) {
    return { funcionario: null, erro: "S-2299 sem funcionarioId — desligamento não aplicado" };
  }

  const dataInformada =
    dadosFormulario?.dadosAdmissao?.desligamento?.data ??
    dadosFormulario?.desligamento?.data ??
    dadosFormulario?.dataDesligamento;

  const dataDesligamento =
    normalizar(() => formatarData(dataInformada)) ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("funcionarios")
    .update({ data_desligamento: dataDesligamento })
    .eq("id", funcionarioId)
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "[esocial-funcionario.service] Erro ao desligar funcionário do S-2299:",
      error.message,
    );
    return { funcionario: null, erro: "Falha ao registrar desligamento a partir do S-2299" };
  }

  return { funcionario: data, erro: null };
}
