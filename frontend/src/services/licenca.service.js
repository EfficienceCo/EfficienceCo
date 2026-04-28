import api from './api';

export async function buscarLicenca(clienteId) {
  const response = await api.get(`/licenca/${clienteId}`);
  return response.data;
}
