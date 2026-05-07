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

export async function atualizarCliente(id, dados) {
  const response = await api.patch(`/clientes/${id}`, dados);
  return response.data;
}

export async function deletarCliente(id) {
  const response = await api.delete(`/clientes/${id}`);
  return response.data;
}
