import api from './api';

function normalizarMesAno({ mes, ano } = {}) {
  let mesNumero = mes;
  let anoNumero = ano;

  if (typeof mes === 'string' && mes.includes('-') && ano === undefined) {
    const [anoValor, mesValor] = mes.split('-');
    anoNumero = Number.parseInt(anoValor, 10);
    mesNumero = Number.parseInt(mesValor, 10);
  }

  if (typeof mesNumero === 'string') {
    mesNumero = Number.parseInt(mesNumero, 10);
  }

  if (typeof anoNumero === 'string') {
    anoNumero = Number.parseInt(anoNumero, 10);
  }

  return { mesNumero, anoNumero };
}

function montarParams({ status, mes, ano, clienteId } = {}) {
  const params = {};
  const { mesNumero, anoNumero } = normalizarMesAno({ mes, ano });

  if (status) {
    params.status = status;
  }

  // admin_efficience não tem cliente_id no token: o resolverClienteId() do
  // backend lê o clienteId da query. Cliente normal não manda nada e o backend
  // usa o cliente_id do próprio token.
  if (clienteId) {
    params.clienteId = clienteId;
  }

  if (Number.isInteger(mesNumero) && mesNumero >= 1 && mesNumero <= 12) {
    params.mes = mesNumero;
  }

  if (Number.isInteger(anoNumero) && anoNumero >= 2000) {
    params.ano = anoNumero;
  }

  return Object.keys(params).length > 0 ? params : undefined;
}

export async function listar({ status, mes, ano, clienteId } = {}) {
  const response = await api.get('/obrigacoes', {
    params: montarParams({ status, mes, ano, clienteId }),
  });

  return response.data;
}

// dados aceita clienteId quando o usuário é admin_efficience (o backend lê
// body.clienteId / body.cliente_id); no cliente normal o campo é ignorado.
export async function criar(dados) {
  const response = await api.post('/obrigacoes', dados);
  return response.data;
}

export async function atualizar(id, dados) {
  const response = await api.patch(`/obrigacoes/${id}`, dados);
  return response.data;
}

export async function deletar(id) {
  const response = await api.delete(`/obrigacoes/${id}`);
  return response.data;
}

export async function concluir(id, arquivo) {
  const formData = new FormData();
  formData.append('comprovante', arquivo);
  const response = await api.patch(`/obrigacoes/${id}/concluir`, formData);
  return response.data;
}

export async function listarProximasObrigacoes({ dias = 7 } = {}) {
  const response = await api.get('/obrigacoes/proximas', {
    params: { dias },
  });

  return response.data;
}
