import api from './api';

// ---------------------------------------------------------------------------
// Certificado Digital — service layer (CD-4 / #411)
//
// Espelha esocial.service.js / fiscal.service.js. Os endpoints /certificados
// dependem da migration CD-1 (#408) e do CRUD CD-2 (#409); enquanto não
// estiverem aplicados no dev, a tela (CD-5) cai no modo mockado (Playwright via
// page.route) e o page.jsx materializa o checklist de renovação localmente.
//
// Contrato (CD-2):
//   GET    /certificados                       -> lista com dias_restantes + faixa
//   GET    /certificados/:id                   -> detalhe + renovacao_checklist
//   POST   /certificados                       -> cadastrar (só admin)
//   PATCH  /certificados/:id                   -> editar validade/serial/caminho
//   POST   /certificados/:id/iniciar-renovacao -> materializa o checklist por tipo
//   PATCH  /certificados/:id/renovacao         -> conclui / atualiza um item
// ---------------------------------------------------------------------------

// Mesmo padrão de fiscal.service.js: omite chaves vazias para o axios não
// mandar "campo=undefined" na querystring.
function montarParams(params = {}) {
  const limpos = {};

  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      limpos[chave] = valor;
    }
  }

  return Object.keys(limpos).length > 0 ? limpos : undefined;
}

// clienteId em camelCase na query, igual ao eventos-esocial.controller.js —
// ignorado pelo back-end para perfis não-admin (usa o do token).
export async function listarCertificados({ clienteId } = {}) {
  const response = await api.get('/certificados', {
    params: montarParams({ clienteId }),
  });

  return response.data;
}

export async function buscarCertificado(id, { clienteId } = {}) {
  const response = await api.get(`/certificados/${id}`, {
    params: montarParams({ clienteId }),
  });

  return response.data;
}

// payload: { tipo: 'A1' | 'A3', titular, serial?, validade, caminho_local? }
export async function criarCertificado(payload) {
  const response = await api.post('/certificados', payload);
  return response.data;
}

// payload: { validade?, serial?, caminho_local? }
export async function editarCertificado(id, payload) {
  const response = await api.patch(`/certificados/${id}`, payload);
  return response.data;
}

// Seta status='renovacao_iniciada' e devolve o certificado já com
// renovacao_checklist ramificado pelo tipo (A1 = 2 itens; A3 = 3, com o passo
// de agendamento presencial).
export async function iniciarRenovacao(id) {
  const response = await api.post(`/certificados/${id}/iniciar-renovacao`);
  return response.data;
}

// Marca um item do checklist como concluído e/ou grava dados do item (ex.: a
// data do comparecimento presencial no passo de agendamento do A3).
export async function atualizarItemRenovacao(id, itemId, { concluido, dados } = {}) {
  const response = await api.patch(`/certificados/${id}/renovacao`, {
    itemId,
    ...(concluido !== undefined ? { concluido } : {}),
    ...(dados !== undefined ? { dados } : {}),
  });

  return response.data;
}
