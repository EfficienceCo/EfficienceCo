import api from './api';

export async function listar({ limit, offset } = {}) {
  const response = await api.get('/notificacoes', {
    params: {
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(typeof offset === 'number' ? { offset } : {}),
    },
  });

  return response.data;
}

export async function marcarLida(id) {
  if (!id) {
    throw new Error('ID da notificação é obrigatório para marcar como lida.');
  }

  const response = await api.patch(`/notificacoes/${id}/lida`);
  return response.data;
}

export const listarNotificacoes = listar;
