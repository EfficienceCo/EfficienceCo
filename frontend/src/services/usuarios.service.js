import api from './api';

export async function listarUsuarios() {
  const response = await api.get('/usuarios');
  return response.data;
}
