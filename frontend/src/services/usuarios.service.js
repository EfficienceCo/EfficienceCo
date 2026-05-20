import api from './api';

export async function listarUsuarios({ clienteId } = {}) {
  const response = await api.get('/usuarios', {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}

export async function criarUsuario(dados, { clienteId } = {}) {
  const payload = clienteId
    ? {
        ...dados,
        cliente_id: clienteId,
      }
    : dados;

  const response = await api.post('/usuarios', payload);
  return response.data;
}

export async function atualizarUsuario(id, dados, { clienteId } = {}) {
  const response = await api.patch(`/usuarios/${id}`, dados, {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}

export async function deletarUsuario(id, { clienteId } = {}) {
  const response = await api.delete(`/usuarios/${id}`, {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}
