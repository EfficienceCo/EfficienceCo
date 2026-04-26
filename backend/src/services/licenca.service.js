import supabase from '../config/database.js';

export async function validarTokenLicenca(token) {
  if (!token) return null;

  const { data, error } = await supabase
    .from('licencas')
    .select('cliente_id, ativa, validade')
    .eq('token', token)
    .single();

  if (error || !data) return null;

  const dentroDoValidade = !data.validade || new Date(data.validade) > new Date();
  if (!data.ativa || !dentroDoValidade) return null;

  return data;
}
