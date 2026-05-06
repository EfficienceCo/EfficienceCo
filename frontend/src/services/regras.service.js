import api from './api';

export async function listarRegras({ clienteId } = {}) {
  const response = await api.get('/regras', {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}

export async function criarRegra(dados, { clienteId } = {}) {
  const payload = clienteId
    ? {
        ...dados,
        cliente_id: clienteId,
      }
    : dados;

  const response = await api.post('/regras', payload);
  return response.data;
}

export async function atualizarRegra(id, dados, { clienteId } = {}) {
  const response = await api.patch(`/regras/${id}`, dados, {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}

export async function deletarRegra(id, { clienteId } = {}) {
  const response = await api.delete(`/regras/${id}`, {
    params: clienteId ? { cliente_id: clienteId } : undefined,
  });
  return response.data;
}
