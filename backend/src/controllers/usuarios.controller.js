import bcrypt from 'bcryptjs';
import supabase from '../config/database.js';

const CAMPOS_PUBLICOS = 'id, cliente_id, nome, email, perfil, criado_em';

export async function listarUsuarios(req, res) {
  const { perfil, cliente_id: clienteIdToken } = req.usuario;

  let query = supabase.from('usuarios').select(CAMPOS_PUBLICOS).order('criado_em', { ascending: false });

  if (perfil === 'admin_cliente') {
    query = query.eq('cliente_id', clienteIdToken);
  } else if (req.query.cliente_id) {
    query = query.eq('cliente_id', req.query.cliente_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[usuarios.controller] Erro ao listar usuarios:', error.message);
    return res.status(500).json({ erro: 'Erro ao listar usuários' });
  }

  return res.status(200).json(data);
}

export async function criarUsuario(req, res) {
  const { perfil, cliente_id: clienteIdToken } = req.usuario;
  const { nome, email, senha, perfil: perfilNovo = 'funcionario' } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Campos obrigatórios: nome, email, senha' });
  }

  const cliente_id = perfil === 'admin_cliente' ? clienteIdToken : req.body.cliente_id;

  if (!cliente_id) {
    return res.status(400).json({ erro: 'Campo obrigatório: cliente_id' });
  }

  const senha_hash = await bcrypt.hash(senha, 10);

  const { data, error } = await supabase
    .from('usuarios')
    .insert({ nome, email, senha_hash, perfil: perfilNovo, cliente_id })
    .select(CAMPOS_PUBLICOS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ erro: 'Email já cadastrado' });
    }
    console.error('[usuarios.controller] Erro ao criar usuario:', error.message);
    return res.status(500).json({ erro: 'Erro ao criar usuário' });
  }

  return res.status(201).json(data);
}

export async function deletarUsuario(req, res) {
  const { perfil, cliente_id: clienteIdToken } = req.usuario;
  const { id } = req.params;

  const cliente_id = perfil === 'admin_cliente' ? clienteIdToken : req.query.cliente_id;

  if (!cliente_id) {
    return res.status(400).json({ erro: 'Parâmetro obrigatório: cliente_id' });
  }

  const { data, error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id)
    .eq('cliente_id', cliente_id)
    .select(CAMPOS_PUBLICOS)
    .single();

  if (error || !data) {
    return res.status(404).json({ erro: 'Usuário não encontrado' });
  }

  return res.status(200).json({ mensagem: 'Usuário removido com sucesso', usuario: data });
}
