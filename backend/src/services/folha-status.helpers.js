/** Basename do path no storage (ex.: .../holerites/foo.pdf → foo.pdf). */
export function nomeArquivoDePath(caminho) {
  if (!caminho || typeof caminho !== "string") return null;
  const partes = caminho.replace(/\\/g, "/").split("/").filter(Boolean);
  return partes.at(-1) || null;
}

/**
 * Monta a lista de arquivos gerados a partir dos paths persistidos.
 * Inclui `path` para uso interno (download); a API pública deve omitir esse campo.
 */
export function montarListaArquivos(calculos = [], relatorios = []) {
  const arquivos = [];

  for (const calculo of calculos) {
    const nome = nomeArquivoDePath(calculo.holerite_path);
    if (nome) {
      arquivos.push({ nome, tipo: "holerite", path: calculo.holerite_path });
    }
  }

  for (const relatorio of relatorios) {
    const nome = nomeArquivoDePath(relatorio.arquivo_path);
    if (nome) {
      arquivos.push({ nome, tipo: "relatorio", path: relatorio.arquivo_path });
    }
  }

  return arquivos;
}

/** Resposta pública: sem path de storage. */
export function arquivosParaResposta(arquivos) {
  return arquivos.map(({ nome, tipo }) => ({ nome, tipo }));
}

/**
 * Resolve o path de storage a partir do nome solicitado.
 * Só aceita nomes que existam na lista do processamento (sem path traversal).
 */
export function resolverPathDownload(nomeSolicitado, arquivos) {
  if (!nomeSolicitado || typeof nomeSolicitado !== "string") return null;

  if (
    nomeSolicitado.includes("/") ||
    nomeSolicitado.includes("\\") ||
    nomeSolicitado.includes("..")
  ) {
    return null;
  }

  const encontrado = arquivos.find((arquivo) => arquivo.nome === nomeSolicitado);
  return encontrado?.path || null;
}

export function montarDescricaoConclusao(totalFuncionarios, totalEmpresas) {
  return `Folha processada — ${totalFuncionarios} funcionários, ${totalEmpresas} empresas`;
}

export function calcularTotaisProcessamento(calculos = []) {
  const empresas = new Set(calculos.map((c) => c.empresa).filter(Boolean));
  return {
    total_funcionarios: calculos.length,
    total_empresas: empresas.size,
  };
}
