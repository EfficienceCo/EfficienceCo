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

// Com responseType 'blob', o axios também entrega respostas de erro (4xx/5xx)
// como Blob em vez de JSON já parseado — sem isso, obterMensagemErro() nunca
// encontra error.response.data.erro e o usuário só vê a mensagem genérica de fallback,
// mesmo quando o backend manda um motivo específico (ex: "Licença inativa ou expirada").
async function converterBlobDeErroParaJson(error) {
  const blob = error?.response?.data;

  if (!(blob instanceof Blob) || !blob.type?.includes('json')) {
    return error;
  }

  try {
    const texto = await blob.text();
    error.response.data = JSON.parse(texto);
  } catch (_erroConversao) {
    // Mantém o blob original caso o corpo não seja um JSON válido.
  }

  return error;
}

export async function baixarTemplateFolha({ clienteId } = {}) {
  try {
    const response = await api.get('/folha/template', {
      params: clienteId ? { cliente_id: clienteId } : undefined,
      responseType: 'blob',
    });

    return response.data;
  } catch (error) {
    throw await converterBlobDeErroParaJson(error);
  }
}
