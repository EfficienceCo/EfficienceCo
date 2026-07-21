import supabase from "../config/database.js";

// Valida o token de licença recebido no header x-licenca-token.
// Retorna os dados da licença se válida, ou null em qualquer caso de falha.
// Usada por regras e eventos — rotas acessadas pelo agente Python.
export async function validarTokenLicenca(token) {
  if (!token) {
    console.log("[licenca.service] Token ausente");
    return null;
  }

  const { data, error } = await supabase
    .from("licencas")
    .select("cliente_id, ativa, validade")
    .eq("token", token)
    .single();

  if (error || !data) {
    console.log("[licenca.service] Token não encontrado no banco");
    return null;
  }

  const dentroDoValidade =
    !data.validade || new Date(data.validade) > new Date();

  if (!data.ativa) {
    console.log(
      `[licenca.service] Licença inativa para cliente: ${data.cliente_id}`,
    );
    return null;
  }

  if (!dentroDoValidade) {
    console.log(
      `[licenca.service] Licença expirada para cliente: ${data.cliente_id}`,
    );
    return null;
  }

  console.log(
    `[licenca.service] Token válido para cliente: ${data.cliente_id}`,
  );
  return data;
}

// Verifica se o cliente tem licença ativa e dentro da validade.
// Usada por rotas do frontend (JWT) que exigem licença ativa, ex. folha de pagamento.
export async function licencaAtivaParaCliente(clienteId) {
  if (!clienteId) {
    return false;
  }

  const { data, error } = await supabase
    .from("licencas")
    .select("ativa, validade")
    .eq("cliente_id", clienteId)
    .single();

  if (error || !data) {
    console.log(`[licenca.service] Licença não encontrada para cliente: ${clienteId}`);
    return false;
  }

  const dentroDoValidade = !data.validade || new Date(data.validade) > new Date();

  return Boolean(data.ativa && dentroDoValidade);
}
