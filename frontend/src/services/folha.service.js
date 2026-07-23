import api from './api';

export async function uploadFolha({ arquivo, mesReferencia, clienteId } = {}) {
  const formData = new FormData();

  formData.append('planilha', arquivo);
  formData.append('mes_referencia', mesReferencia);

  if (clienteId) {
    formData.append('cliente_id', clienteId);
  }

  const response = await api.post('/folha/upload', formData);
  return response.data;
}

export async function baixarTemplateFolha({ clienteId } = {}) {
  const response = await api.get('/folha/template', {
    params: clienteId ? { cliente_id: clienteId } : undefined,
    responseType: 'blob',
  });

  return response.data;
}
