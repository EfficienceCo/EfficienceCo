// Com responseType 'blob', o axios também entrega respostas de erro (4xx/5xx)
// como Blob em vez de JSON já parseado — sem essa conversão, obterMensagemErro()
// nunca encontra error.response.data.erro e o usuário só vê a mensagem genérica
// de fallback, mesmo quando o backend manda um motivo específico.
export async function converterBlobDeErroParaJson(error) {
  const blob = error?.response?.data;

  if (!(blob instanceof Blob) || !blob.type?.includes('json')) {
    return error;
  }

  try {
    const texto = await blob.text();
    error.response.data = JSON.parse(texto);
  } catch (_erroConversao) {
    // Mantém o blob original caso o corpo não seja um JSON válido.
  }

  return error;
}
