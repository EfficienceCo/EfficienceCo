import api from './api';
import { converterBlobDeErroParaJson } from './http-erro.util';

// Remove chaves undefined e retorna undefined se não sobrar nada, para o axios
// omitir o parâmetro em vez de mandar "campo=undefined" na querystring.
function limparParams(params) {
  const limpos = Object.fromEntries(
    Object.entries(params).filter(([, valor]) => valor !== undefined),
  );

  return Object.keys(limpos).length > 0 ? limpos : undefined;
}

export async function criarLancamentoContabil(dados) {
  const response = await api.post('/lancamentos-contabeis', dados);
  return response.data;
}

// Lançamentos contábeis usam clienteId (camelCase) na query — mesmo padrão de
// lancamentos-fiscais.controller.js.
export async function listarLancamentosContabeis({ clienteId, mes, ano } = {}) {
  const response = await api.get('/lancamentos-contabeis', {
    params: limparParams({ clienteId, mes, ano }),
  });

  return response.data;
}

export async function atualizarLancamentoContabil(id, dados) {
  const response = await api.patch(`/lancamentos-contabeis/${id}`, dados);
  return response.data;
}

export async function deletarLancamentoContabil(id) {
  const response = await api.delete(`/lancamentos-contabeis/${id}`);
  return response.data;
}

// Conciliação bancária (extrato + matching) usa cliente_id (snake_case) no
// body/query — mesmo padrão de resolverClienteId em permissao.middleware.js.
export async function uploadExtrato(clienteId, arquivo, mes, ano) {
  if (!(arquivo instanceof Blob)) {
    throw new Error('arquivo deve ser um File/Blob — confira a ordem dos argumentos de uploadExtrato(clienteId, arquivo, mes, ano)');
  }

  const formData = new FormData();

  formData.append('arquivo', arquivo);

  if (clienteId !== undefined) {
    formData.append('cliente_id', clienteId);
  }

  if (mes !== undefined) {
    formData.append('mes', mes);
  }

  if (ano !== undefined) {
    formData.append('ano', ano);
  }

  const response = await api.post('/conciliacoes/extrato', formData);
  return response.data;
}

export async function listarTransacoesExtrato(extratoId) {
  const response = await api.get(`/conciliacoes/extrato/${extratoId}/transacoes`);
  return response.data;
}

export async function iniciarConciliacao({ clienteId, extratoId, mes, ano } = {}) {
  const response = await api.post('/conciliacoes', {
    cliente_id: clienteId,
    extrato_id: extratoId,
    mes,
    ano,
  });

  return response.data;
}

export async function listarConciliacoes({ clienteId, mes, ano } = {}) {
  const response = await api.get('/conciliacoes', {
    params: limparParams({ cliente_id: clienteId, mes, ano }),
  });

  return response.data;
}

// clienteId é opcional e só precisa ser informado por admin_efficience — para os
// demais perfis, resolverClienteId (backend) já resolve via o token, e o parâmetro
// extra é ignorado. Ver limparParams: omitido do payload quando undefined.
export async function buscarConciliacao(id, { clienteId } = {}) {
  const response = await api.get(`/conciliacoes/${id}`, {
    params: limparParams({ cliente_id: clienteId }),
  });
  return response.data;
}

export async function confirmarPar(conciliacaoId, pareId, { clienteId } = {}) {
  const response = await api.patch(
    `/conciliacoes/${conciliacaoId}/pares/${pareId}/confirmar`,
    undefined,
    { params: limparParams({ cliente_id: clienteId }) },
  );
  return response.data;
}

export async function rejeitarPar(conciliacaoId, pareId, { clienteId } = {}) {
  const response = await api.patch(
    `/conciliacoes/${conciliacaoId}/pares/${pareId}/rejeitar`,
    undefined,
    { params: limparParams({ cliente_id: clienteId }) },
  );
  return response.data;
}

export async function concluirConciliacao(id, { clienteId } = {}) {
  const response = await api.post(`/conciliacoes/${id}/concluir`, undefined, {
    params: limparParams({ cliente_id: clienteId }),
  });
  return response.data;
}

export async function downloadRelatorio(id, { clienteId } = {}) {
  try {
    const response = await api.get(`/conciliacoes/${id}/relatorio`, {
      responseType: 'blob',
      params: limparParams({ cliente_id: clienteId }),
    });

    return response.data;
  } catch (error) {
    throw await converterBlobDeErroParaJson(error);
  }
}
