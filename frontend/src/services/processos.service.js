import api from './api';

function montarParams({ status, tipo, limit, offset } = {}) {
  const params = {};

  if (status) {
    params.status = status;
  }

  if (tipo) {
    params.tipo = tipo;
  }

  if (typeof limit === 'number') {
    params.limit = limit;
  }

  if (typeof offset === 'number') {
    params.offset = offset;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export async function listar({ status, tipo, limit, offset } = {}) {
  const response = await api.get('/processos', {
    params: montarParams({ status, tipo, limit, offset }),
  });

  return response.data;
}

export async function criar(dados) {
  const response = await api.post('/processos', dados);
  return response.data;
}

export async function concluirEtapa(processoId, etapaId, dados = {}) {
  const response = await api.patch(`/processos/${processoId}/etapas/${etapaId}`, dados);
  return response.data;
}

export async function listarProcessos({ status, tipo, limit, offset } = {}) {
  return listar({ status, tipo, limit, offset });
}

export async function listarProcessosEmAndamento({ tipo, limit, offset } = {}) {
  return listar({
    status: 'em_andamento',
    tipo,
    limit,
    offset,
  });
}
