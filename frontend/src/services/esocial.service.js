import api from './api';
import { converterBlobDeErroParaJson } from './http-erro.util';

// Remove chaves undefined e devolve undefined se não sobrar nada, para o axios
// omitir o parâmetro em vez de mandar "campo=undefined" na querystring — mesmo
// padrão de fiscal.service.js / apuracao.service.js.
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
// Funcionários (#ES-5)
// clienteId em camelCase na query, igual ao eventos-esocial.controller.js.
// Os endpoints /funcionarios ainda dependem de #ES-5; a assinatura já segue o
// contrato acordado para não travar a tela wizard (#ES-10).
// ---------------------------------------------------------------------------
export async function listarFuncionarios({ clienteId } = {}) {
  const response = await api.get('/funcionarios', {
    params: montarParams({ clienteId }),
  });

  return response.data;
}

export async function criarFuncionario(dados) {
  const response = await api.post('/funcionarios', dados);
  return response.data;
}

// ---------------------------------------------------------------------------
// Eventos do eSocial (#ES-7 — fluxo rascunho → revisar → aprovar → baixar)
// ---------------------------------------------------------------------------

// GET /eventos-esocial?clienteId=&funcionarioId= — histórico / timeline.
// Resposta paginada: { data, total, limit, offset }.
export async function listarEventosEsocial({ clienteId, funcionarioId } = {}) {
  const response = await api.get('/eventos-esocial', {
    params: montarParams({ clienteId, funcionarioId }),
  });

  return response.data;
}

// POST /eventos-esocial — cria o rascunho e já gera o XML (#ES-6).
// body: { clienteId, funcionarioId?, tipoEvento, dadosFormulario }
export async function criarEventoEsocial(dados) {
  const response = await api.post('/eventos-esocial', dados);
  return response.data;
}

// GET /eventos-esocial/:id — detalhe, inclui o XML para a tela de revisão.
export async function buscarEventoEsocial(id) {
  const response = await api.get(`/eventos-esocial/${id}`);
  return response.data;
}

// PATCH /eventos-esocial/:id/aprovar — registra a aprovação humana (obrigatória
// antes de qualquer download/transmissão). Pode devolver `aviso` quando o efeito
// colateral de sincronização (criar/desligar funcionário) falha sem desfazer a
// aprovação.
export async function aprovarEventoEsocial(id) {
  const response = await api.patch(`/eventos-esocial/${id}/aprovar`);
  return response.data;
}

// GET /eventos-esocial/:id/xml — monta a URL absoluta do XML reaproveitando a
// baseURL configurada no axios. Retorna string (sem request). O backend exige
// token no header Authorization, então navegação direta do browser não
// autentica: para baixar dentro do app use baixarXmlEventoEsocial().
export function urlDownloadEventoEsocial(id) {
  const base = (api.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/eventos-esocial/${id}/xml`;
}

// GET /eventos-esocial/:id/xml — download autenticado do XML como Blob. Só
// funciona depois da aprovação (rascunho devolve 409). Converte o corpo de erro
// que o axios entrega como Blob quando responseType é 'blob', para o page
// conseguir ler a mensagem específica do backend via http-erro.util.js.
export async function baixarXmlEventoEsocial(id) {
  try {
    const response = await api.get(`/eventos-esocial/${id}/xml`, {
      responseType: 'blob',
    });

    return {
      blob: response.data,
      headers: response.headers,
    };
  } catch (error) {
    throw await converterBlobDeErroParaJson(error);
  }
}

// POST /eventos-esocial/:id/transmitir — envio ao eSocial (#ES-8). Endpoint
// ainda pode não estar disponível; a função já fica pronta para a tela wizard.
export async function transmitirEventoEsocial(id) {
  const response = await api.post(`/eventos-esocial/${id}/transmitir`);
  return response.data;
}
