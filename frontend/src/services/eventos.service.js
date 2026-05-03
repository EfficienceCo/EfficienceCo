import api from './api';
import { obterSessao } from './session.service';

export async function listarEventos({ limit = 50, offset = 0, clienteId } = {}) {
  const sessao = obterSessao();
  const perfil = sessao.usuario?.perfil;
  const clienteIdToken = sessao.usuario?.cliente_id;
  const clienteIdResolvido = clienteId || clienteIdToken;

  if (perfil === 'admin_efficience' && !clienteIdResolvido) {
    throw new Error(
      'Seu usuario e admin global. Informe o cliente para visualizar os logs.',
    );
  }

  const response = await api.get('/eventos', {
    params: {
      limit,
      offset,
      ...(perfil === 'admin_efficience' && clienteIdResolvido
        ? { cliente_id: clienteIdResolvido }
        : {}),
    },
  });

  return response.data;
}
