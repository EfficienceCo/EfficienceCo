import api from './api';

// Contrato esperado do backend (AP-5, ainda não implementado nesta branch):
// erros de regra de negócio devem vir como { erro: '<mensagem>', codigo: '<CODIGO>' }
// — codigo é o que a página usa pra escolher qual banner mostrar
// (FATOR_R_SEM_FOLHA / REGIME_NAO_SUPORTADO); qualquer outro valor cai no
// banner genérico.
export async function calcularApuracao({ clienteId, mes, ano } = {}) {
  const response = await api.post('/apuracoes', {
    cliente_id: clienteId,
    mes,
    ano,
  });

  return response.data;
}

export async function editarApuracao(id, { valorFinal, motivo, clienteId } = {}) {
  const response = await api.patch(`/apuracoes/${id}`, {
    valor_final: valorFinal,
    motivo,
    cliente_id: clienteId,
  });

  return response.data;
}

export async function aprovarApuracao(id, { clienteId } = {}) {
  const response = await api.post(`/apuracoes/${id}/aprovar`, undefined, {
    params: clienteId !== undefined ? { cliente_id: clienteId } : undefined,
  });

  return response.data;
}
