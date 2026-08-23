import api from './api';

export async function buscarMetricas(periodo, clienteId) {
  const params = {};
  if (periodo !== undefined) {
    params.periodo = periodo;
  }
  if (clienteId) {
    params.cliente_id = clienteId;
  }

  const response = await api.get('/eficiencia', {
    params: Object.keys(params).length > 0 ? params : undefined,
  });

  return response.data;
}
