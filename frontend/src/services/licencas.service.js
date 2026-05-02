import { buscarLicenca } from './licenca.service';
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

export async function getStatusLicencaClienteLogado({ clienteId } = {}) {
  const sessao = obterSessao();
  const perfil = sessao.usuario?.perfil;
  const clienteIdToken = sessao.usuario?.cliente_id;
  const clienteIdResolvido = clienteId || clienteIdToken;

  if (!clienteIdResolvido) {
    if (perfil === 'admin_efficience') {
      throw new Error(
        'Seu usuario e admin global. Informe o cliente para consultar a licenca.',
      );
    }

    throw new Error('Usuario sem cliente vinculado no token JWT.');
  }

  const licenca = await buscarLicenca(clienteIdResolvido);

  return {
    clienteId: clienteIdResolvido,
    ativa: Boolean(licenca?.ativa),
    validade: licenca?.validade || null,
    status: resolverStatus(licenca || {}),
  };
}
