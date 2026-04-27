import api from './api';

export async function login(email, password) {
  const response = await api.post('/auth/login', { email, senha: password });
  return response.data;
}
