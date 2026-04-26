import supabase from '../config/database.js';

export async function findUserByEmail(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !data) return null;

  return data;
}
