import api from './api';

export async function buscarMetricas(periodo) {
  const response = await api.get('/eficiencia', {
    params: periodo !== undefined ? { periodo } : undefined,
  });

  return response.data;
}
