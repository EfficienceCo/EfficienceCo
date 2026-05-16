import api from './api';

export async function listarProximasObrigacoes({ dias = 7 } = {}) {
  const response = await api.get('/obrigacoes/proximas', {
    params: { dias },
  });

  return response.data;
}
