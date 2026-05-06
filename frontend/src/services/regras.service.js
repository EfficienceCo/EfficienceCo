import api from './api';

export async function listarRegras() {
  const response = await api.get('/regras');
  return response.data;
}

export async function criarRegra(dados) {
  const response = await api.post('/regras', dados);
  return response.data;
}

export async function atualizarRegra(id, dados) {
  const response = await api.patch(`/regras/${id}`, dados);
  return response.data;
}

export async function deletarRegra(id) {
  const response = await api.delete(`/regras/${id}`);
  return response.data;
}
