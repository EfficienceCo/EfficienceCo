import api from './api';

export async function buscarLicenca(clienteId) {
  if (!clienteId) {
    throw new Error('clienteId e obrigatorio para consultar licenca.');
  }

  const response = await api.get(`/licenca/${clienteId}`);
  return response.data;
}

export async function validarLicencaClienteLogado() {
  const response = await api.get('/licenca/validar');
  return response.data;
}
