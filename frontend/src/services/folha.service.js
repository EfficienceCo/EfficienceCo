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
  try {
    const response = await api.get('/folha/template', {
      params: clienteId ? { cliente_id: clienteId } : undefined,
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    // Com responseType 'blob', erros da API (ex.: licença inativa) chegam como
    // Blob em vez de JSON já parseado, escondendo a mensagem real do backend.
    // Convertemos o blob de volta para JSON quando possível para preservar o erro.
    const blob = error?.response?.data;

    if (blob instanceof Blob && blob.type?.includes('json')) {
      try {
        const texto = await blob.text();
        error.response.data = JSON.parse(texto);
      } catch {
        // Mantém o blob original se não for possível parsear.
      }
    }

    throw error;
  }
}
