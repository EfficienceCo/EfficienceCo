import api from './api';

export async function buscarMetricas({ periodo, clienteId } = {}) {
  const params = {
    ...(periodo !== undefined ? { periodo } : {}),
    ...(clienteId ? { cliente_id: clienteId } : {}),
  };

  const response = await api.get('/eficiencia', {
    params,
  });

  return response.data;
}
