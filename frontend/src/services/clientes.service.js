import api from './api';

export async function listarClientes() {
  const response = await api.get('/clientes');
  return response.data;
}

export async function criarCliente({
  nome,
  cnpj,
  regime_tributario: regimeTributario,
  anexo_simples: anexoSimples,
}) {
  const payload = {
    nome,
    ...(cnpj ? { cnpj } : {}),
    // Regime e anexo são opcionais no cadastro: quem não souber o regime na
    // hora de criar preenche depois pelo editor de regime tributário (#496).
    ...(regimeTributario ? { regime_tributario: regimeTributario } : {}),
    ...(anexoSimples ? { anexo_simples: anexoSimples } : {}),
  };

  const response = await api.post('/clientes', payload);
  return response.data;
}

export async function atualizarCliente(id, dados) {
  const response = await api.patch(`/clientes/${id}`, dados);
  return response.data;
}

export async function deletarCliente(id) {
  const response = await api.delete(`/clientes/${id}`);
  return response.data;
}
