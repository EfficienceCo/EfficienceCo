import api from './api';

export async function listarProcessos({ status, limit, offset } = {}) {
  const response = await api.get('/processos', {
    params: {
      ...(status ? { status } : {}),
      ...(typeof limit === 'number' ? { limit } : {}),
      ...(typeof offset === 'number' ? { offset } : {}),
    },
  });

  return response.data;
}

export async function listarProcessosEmAndamento({ limit, offset } = {}) {
  return listarProcessos({
    status: 'em_andamento',
    limit,
    offset,
  });
}
