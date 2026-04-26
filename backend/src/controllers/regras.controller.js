import supabase from '../config/database.js';
import { validarTokenLicenca } from '../services/licenca.service.js';

export async function buscarRegras(req, res) {
  const { clienteId } = req.params;
  const token = req.headers['x-licenca-token'];

  const licenca = await validarTokenLicenca(token);
  if (!licenca) {
    return res.status(401).json({ erro: 'Token de licença inválido ou expirado' });
  }

  if (licenca.cliente_id !== clienteId) {
    return res.status(403).json({ erro: 'Token não pertence a este cliente' });
  }

  console.log('[regras.controller] Buscando regras para cliente:', clienteId);

  const { data, error } = await supabase
    .from('regras')
    .select('*')
    .eq('cliente_id', clienteId);

  if (error) {
    console.error('[regras.controller] Erro ao buscar regras:', error.message);
    return res.status(500).json({ erro: 'Erro ao buscar regras' });
  }

  return res.status(200).json(data);
}
