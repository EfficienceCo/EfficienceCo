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

export async function listarLancamentos({ clienteId, mes, ano } = {}) {
  const response = await api.get('/lancamentos-fiscais', {
    params: montarParams({ clienteId, mes, ano }),
  });

  return response.data;
}

export async function buscarResumoFiscal({ clienteId, mes, ano } = {}) {
  const response = await api.get('/lancamentos-fiscais/resumo', {
    params: montarParams({ clienteId, mes, ano }),
  });

  return response.data;
}
