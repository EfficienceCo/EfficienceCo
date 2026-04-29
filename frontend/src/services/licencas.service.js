const MOCK_STATUS_LICENCA = {
  status: 'active',
  plano: 'Profissional',
  expiraEm: '2026-12-31T23:59:59.000Z',
  limiteAutomacoes: 1500,
  automacoesUtilizadas: 437,
  suportePrioritario: true,
};

export async function getStatusLicencaClienteLogado() {
  // TODO: substituir pela chamada real quando a rota estiver disponivel.
  // Exemplo esperado:
  // const response = await api.get('/clientes/me/licenca/status');
  // return response.data;
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_STATUS_LICENCA), 450);
  });
}
