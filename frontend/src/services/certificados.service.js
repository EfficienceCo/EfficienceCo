import api from './api';

// Remove chaves undefined e devolve undefined se não sobrar nada, para o axios
// omitir o parâmetro em vez de mandar "campo=undefined" na querystring — mesmo
// padrão de esocial.service.js / fiscal.service.js.
function montarParams(params = {}) {
  const limpos = {};

  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) {
      limpos[chave] = valor;
    }
  }

  return Object.keys(limpos).length > 0 ? limpos : undefined;
}

// ---------------------------------------------------------------------------
// Certificado Digital (b3 — CD-2/CD-4). Motor de prazo/alerta: sem XML, sem
// SOAP. clienteId em camelCase na query, igual ao resolverClienteId() do
// certificados.controller.js (admin_efficience usa o clienteId da query;
// cliente normal usa o do token e o parâmetro é ignorado).
//
// Todos os endpoints do controller respondem JSON puro (nenhum blob/download),
// então o erro do axios já chega com response.data parseado — o consumidor
// (page) trata via obterMensagemErro(). Sem responseType 'blob' aqui, não há
// o que converter com http-erro.util.js.
// ---------------------------------------------------------------------------

// GET /certificados — lista os certificados do cliente, cada um com
// dias_restantes e faixa (verde > 60 / ambar 30–60 / vermelho < 30 / vencido).
export async function listarCertificados({ clienteId } = {}) {
  const response = await api.get('/certificados', {
    params: montarParams({ clienteId }),
  });

  return response.data;
}

// GET /certificados/:id — detalhe, inclui renovacao_checklist. 404 cross-tenant.
export async function buscarCertificado(id, { clienteId } = {}) {
  const response = await api.get(`/certificados/${id}`, {
    params: montarParams({ clienteId }),
  });

  return response.data;
}

// POST /certificados — cadastra (tipo, serial, titular, validade,
// caminho_local; clienteId no corpo quando admin_efficience). Só admin.
export async function criarCertificado(payload) {
  const response = await api.post('/certificados', payload);
  return response.data;
}

// PATCH /certificados/:id — edita validade / serial / caminho_local. Só admin.
export async function editarCertificado(id, payload) {
  const response = await api.patch(`/certificados/${id}`, payload);
  return response.data;
}

// POST /certificados/:id/iniciar-renovacao — status='renovacao_iniciada' e
// materializa o renovacao_checklist conforme o tipo (A1 = 2 itens; A3 = 3,
// com "agendar comparecimento presencial"). Sem corpo. Só admin.
export async function iniciarRenovacao(id) {
  const response = await api.post(`/certificados/${id}/iniciar-renovacao`);
  return response.data;
}

// PATCH /certificados/:id/renovacao — marca um item do checklist como concluído.
// `dados` carrega os campos opcionais que o controller aceita no corpo: `data`
// (agendamento do item A3), `validade_nova`, `serial_novo`, `caminho_local_novo`.
// Quando todos os itens ficam concluídos e há validade_nova, o backend cria o
// novo certificado ativo e devolve { certificado, novo_certificado }. Só admin.
export async function atualizarItemRenovacao(id, itemId, { concluido, dados } = {}) {
  const response = await api.patch(`/certificados/${id}/renovacao`, {
    itemId,
    concluido,
    ...dados,
  });

  return response.data;
}
