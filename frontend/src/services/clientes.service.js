import api from './api';

export async function listarClientes() {
  const response = await api.get('/clientes');
  return response.data;
}

export async function criarCliente({ nome, cnpj }) {
  const payload = {
    nome,
    ...(cnpj ? { cnpj } : {}),
  };

  const response = await api.post('/clientes', payload);
  return response.data;
}
