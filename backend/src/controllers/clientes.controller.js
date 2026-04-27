import supabase from '../config/database.js';
import { criarSessaoPagamento } from '../services/stripe.service.js';

export async function listarClientes(req, res) {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('[clientes.controller] Erro ao listar clientes:', error.message);
    return res.status(500).json({ erro: 'Erro ao listar clientes' });
  }

  return res.status(200).json(data);
}

export async function buscarCliente(req, res) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ erro: 'Cliente não encontrado' });
  }

  return res.status(200).json(data);
}

export async function criarCliente(req, res) {
  const { nome, cnpj } = req.body;

  if (!nome) {
    return res.status(400).json({ erro: 'Campo obrigatório: nome' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ nome, cnpj })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'CNPJ já cadastrado' });
    }
    console.error('[clientes.controller] Erro ao criar cliente:', error.message);
    return res.status(500).json({ erro: 'Erro ao criar cliente' });
  }

  return res.status(201).json(data);
}

export async function iniciarPagamento(req, res) {
  const { id } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ erro: 'Campo obrigatório: email' });
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('id', id)
    .single();

  if (error || !cliente) {
    return res.status(404).json({ erro: 'Cliente não encontrado' });
  }

  try {
    const session = await criarSessaoPagamento({ clienteId: id, email });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[clientes.controller] Erro ao criar sessão Stripe:', err.message);
    return res.status(500).json({ erro: 'Erro ao criar sessão de pagamento' });
  }
}
