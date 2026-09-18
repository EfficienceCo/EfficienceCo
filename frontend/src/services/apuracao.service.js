import api from './api';

function montarParams({ clienteId, mes, ano } = {}) {
  const params = {};

  if (clienteId !== undefined) {
    params.clienteId = clienteId;
  }

  if (mes !== undefined) {
    params.mes = mes;
  }

  if (ano !== undefined) {
    params.ano = ano;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export async function calcularApuracao({ clienteId, mes, ano, regime }) {
  const response = await api.post('/apuracoes', { clienteId, mes, ano, regime });
  return response.data;
}

export async function listarApuracoes({ clienteId, mes, ano } = {}) {
  const response = await api.get('/apuracoes', {
    params: montarParams({ clienteId, mes, ano }),
  });

  return response.data;
}

export async function buscarApuracao(id) {
  const response = await api.get(`/apuracoes/${id}`);
  return response.data;
}

export async function editarApuracao(id, { valor_editado, motivo }) {
  const response = await api.patch(`/apuracoes/${id}`, { valor_editado, motivo });
  return response.data;
}

export async function aprovarApuracao(id) {
  const response = await api.patch(`/apuracoes/${id}/aprovar`);
  return response.data;
}
