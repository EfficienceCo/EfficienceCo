import axios from 'axios';
import { limparToken, obterSessao } from './session.service';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
});

api.interceptors.request.use((config) => {
  const { token, expirado } = obterSessao();

  if (expirado && token) {
    limparToken();
    return config;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
