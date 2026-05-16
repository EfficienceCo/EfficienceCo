import api from './api';

export async function listarNotificacoes({ limit, offset } = {}) {
  const response = await api.get('/notificacoes', {
    params: {
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(typeof offset === 'number' ? { offset } : {}),
    },
  });

  return response.data;
}
