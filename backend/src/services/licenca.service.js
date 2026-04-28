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
