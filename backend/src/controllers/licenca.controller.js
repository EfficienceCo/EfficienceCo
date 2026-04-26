import supabase from '../config/database.js';

export async function validarLicenca(req, res) {
  const token = req.headers['x-licenca-token'];

  if (!token) {
    return res.status(400).json({ ativa: false, message: 'Token ausente' });
  }

  const { data, error } = await supabase
    .from('licencas')
    .select('ativa, validade')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(404).json({ ativa: false, message: 'Licença não encontrada' });
  }

  const dentroDoValidade = !data.validade || new Date(data.validade) > new Date();

  return res.status(200).json({ ativa: data.ativa && dentroDoValidade });
}
