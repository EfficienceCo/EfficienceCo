import api from './api';
import { converterBlobDeErroParaJson } from './http-erro.util';

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
    throw await converterBlobDeErroParaJson(error);
  }
}

export async function obterProcessamentoFolha(processamentoId) {
  if (!processamentoId) {
    throw new Error('processamento_id é obrigatório para consultar a folha.');
  }

  const response = await api.get(`/folha/${encodeURIComponent(processamentoId)}`);
  return response.data;
}

export async function baixarArquivoFolha({ processamentoId, arquivo } = {}) {
  if (!processamentoId || !arquivo) {
    throw new Error('Processamento e arquivo são obrigatórios para baixar a folha.');
  }

  const response = await api.get(
    `/folha/${encodeURIComponent(processamentoId)}/download/${encodeURIComponent(arquivo)}`,
    { responseType: 'blob' },
  );

  return {
    blob: response.data,
    headers: response.headers,
  };
}
