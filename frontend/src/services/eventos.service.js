import api from './api';

export async function listarEventos({ limit = 50, offset = 0 } = {}) {
  const response = await api.get('/eventos', {
    params: {
      limit,
      offset,
    },
  });

  return response.data;
}
