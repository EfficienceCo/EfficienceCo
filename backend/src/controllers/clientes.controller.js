import supabase from '../config/database.js';
import { criarSessaoPagamento } from '../services/stripe.service.js';

// Lista todos os clientes ordenados do mais recente para o mais antigo.
// Exclusivo para admin_efficience — painel interno da Efficience.
export async function listarClientes(req, res) {
  console.log('[clientes.controller] Listando todos os clientes');

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    console.error('[clientes.controller] Erro ao listar clientes:', error.message);
    return res.status(500).json({ erro: 'Erro ao listar clientes' });
  }

  console.log(`[clientes.controller] ${data.length} cliente(s) retornado(s)`);
  return res.status(200).json(data);
}

export async function buscarCliente(req, res) {
  const { id } = req.params;

  console.log(`[clientes.controller] Buscando cliente: ${id}`);

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.log(`[clientes.controller] Cliente não encontrado: ${id}`);
    return res.status(404).json({ erro: 'Cliente não encontrado' });
  }

  console.log(`[clientes.controller] Cliente encontrado: ${data.nome}`);
  return res.status(200).json(data);
}

export async function criarCliente(req, res) {
  const { nome, cnpj } = req.body;

  console.log(`[clientes.controller] Criando cliente — nome: ${nome} | cnpj: ${cnpj ?? 'não informado'}`);

  if (!nome) {
    console.log('[clientes.controller] Criação rejeitada — nome ausente');
    return res.status(400).json({ erro: 'Campo obrigatório: nome' });
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ nome, cnpj })
    .select()
    .single();

  if (error) {
    // Código 23505 = violação de unique constraint — CNPJ duplicado
    if (error.code === '23505') {
      console.log(`[clientes.controller] CNPJ já cadastrado: ${cnpj}`);
      return res.status(409).json({ erro: 'CNPJ já cadastrado' });
    }
    console.error('[clientes.controller] Erro ao criar cliente:', error.message);
    return res.status(500).json({ erro: 'Erro ao criar cliente' });
  }

  console.log(`[clientes.controller] Cliente criado com sucesso: ${data.id}`);
  return res.status(201).json(data);
}

export async function iniciarPagamento(req, res) {
  const { id } = req.params;
  const { email } = req.body;

  console.log(`[clientes.controller] Iniciando pagamento para cliente: ${id} | email: ${email}`);

  if (!email) {
    console.log('[clientes.controller] Pagamento rejeitado — email ausente');
    return res.status(400).json({ erro: 'Campo obrigatório: email' });
  }

  const { data: cliente, error } = await supabase
    .from('clientes')
    .select('id, nome')
    .eq('id', id)
    .single();

  if (error || !cliente) {
    console.log(`[clientes.controller] Cliente não encontrado para pagamento: ${id}`);
    return res.status(404).json({ erro: 'Cliente não encontrado' });
  }

  try {
    const session = await criarSessaoPagamento({ clienteId: id, email });
    console.log(`[clientes.controller] URL de pagamento gerada para cliente: ${id}`);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[clientes.controller] Erro ao criar sessão Stripe:', err.message);
    return res.status(500).json({ erro: 'Erro ao criar sessão de pagamento' });
  }
}
