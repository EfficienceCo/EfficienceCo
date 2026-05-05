import { buscarLicenca, validarLicencaClienteLogado } from './licenca.service';
import { obterSessao } from './session.service';

function resolverStatus({ ativa, validade }) {
  if (ativa) {
    return 'active';
  }

  if (validade && new Date(validade) <= new Date()) {
    return 'expired';
  }

  return 'suspended';
}

function normalizarStatusLicenca(licenca, clienteIdFallback) {
  return {
    clienteId: licenca?.clienteId || clienteIdFallback || null,
    ativa: Boolean(licenca?.ativa),
    validade: licenca?.validade || null,
    status: licenca?.status || resolverStatus(licenca || {}),
  };
}

export async function getStatusLicencaClienteLogado({ clienteId } = {}) {
  // Mantem suporte ao fluxo legado quando um clienteId explicito for informado.
  if (clienteId) {
    const licenca = await buscarLicenca(clienteId);
    return normalizarStatusLicenca(licenca, clienteId);
  }

  const sessao = obterSessao();
  const clienteIdToken = sessao.usuario?.cliente_id || null;

  const licenca = await validarLicencaClienteLogado();
  return normalizarStatusLicenca(licenca, clienteIdToken);
}
