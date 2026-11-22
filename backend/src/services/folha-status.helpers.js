import { sanitizarNomeArquivo } from "../utils/comum.util.js";

export { sanitizarNomeArquivo };

/** Basename do path no storage (ex.: .../holerites/foo.pdf → foo.pdf). */
export function nomeArquivoDePath(caminho) {
  if (!caminho || typeof caminho !== "string") return null;
  const partes = caminho.replace(/\\/g, "/").split("/").filter(Boolean);
  return partes.at(-1) || null;
}

/**
 * Nome de exibição do holerite — SEM CPF (LGPD, BUG-FOLHA-07).
 * Homônimos geram o mesmo nome de exibição; a unicidade do download vem do id interno.
 */
export function nomeExibicaoHolerite(calculo = {}) {
  const partes = ["holerite", calculo.empresa, calculo.funcionario]
    .map((parte) => sanitizarNomeArquivo(parte))
    .filter(Boolean);
  return `${partes.join("_")}.pdf`;
}

/**
 * Monta a lista de arquivos gerados a partir dos paths persistidos.
 * Cada item tem:
 *  - `id`: identificador opaco (id da linha em folha_calculos / folha_relatorios) usado na URL de download;
 *  - `nome`: nome de exibição SEM CPF;
 *  - `path`: caminho de storage, uso interno (download) — a API pública deve omitir esse campo.
 */
export function montarListaArquivos(calculos = [], relatorios = []) {
  const arquivos = [];

  for (const calculo of calculos) {
    if (!calculo?.holerite_path || calculo?.id == null) continue;
    arquivos.push({
      id: String(calculo.id),
      nome: nomeExibicaoHolerite(calculo),
      tipo: "holerite",
      empresa: calculo.empresa ?? null,
      funcionario: calculo.funcionario ?? null,
      path: calculo.holerite_path,
    });
  }

  for (const relatorio of relatorios) {
    if (!relatorio?.arquivo_path || relatorio?.id == null) continue;
    arquivos.push({
      id: String(relatorio.id),
      // O nome do relatório de fechamento não carrega dado pessoal (empresa + mês).
      nome: nomeArquivoDePath(relatorio.arquivo_path),
      tipo: "relatorio",
      empresa: relatorio.empresa ?? null,
      funcionario: null,
      path: relatorio.arquivo_path,
    });
  }

  return arquivos;
}

/** Resposta pública: id opaco, nome de exibição, tipo, empresa e funcionário — sem path de storage nem CPF. */
export function arquivosParaResposta(arquivos) {
  return arquivos.map(({ id, nome, tipo, empresa, funcionario }) => ({
    id,
    nome,
    tipo,
    empresa,
    funcionario,
  }));
}

/**
 * Resolve o arquivo solicitado no download a partir do id opaco na URL.
 * Só aceita ids que existam na lista do processamento (escopo por processamento/tenant,
 * sem path traversal — o id nunca contém separador de path).
 * Retorna o item completo ({ id, nome, tipo, path }) ou null.
 */
export function resolverArquivoDownload(idSolicitado, arquivos) {
  if (!idSolicitado || typeof idSolicitado !== "string") return null;

  if (
    idSolicitado.includes("/") ||
    idSolicitado.includes("\\") ||
    idSolicitado.includes("..")
  ) {
    return null;
  }

  return arquivos.find((arquivo) => arquivo.id === idSolicitado) || null;
}

export function montarDescricaoConclusao(totalFuncionarios, totalEmpresas) {
  return `Folha processada — ${totalFuncionarios} funcionários, ${totalEmpresas} empresas`;
}

/**
 * Status que a API mostra. No banco, `calculado` = cálculo salvo e arquivos ainda não
 * prontos (#743): enquanto os PDFs são gerados aparece `processando`, e se a geração
 * falhou aparece `erro`. Só `concluido` (cálculo e arquivos terminados) sai como concluído.
 */
export function statusPublicoProcessamento(status, saidaStatus) {
  if (status !== "calculado") return status;
  return saidaStatus === "erro" ? "erro" : "processando";
}

/** Arquivos que a geração de saída vai produzir: 1 holerite por funcionário + 1 relatório por empresa. */
export function totalArquivosEsperados(calculos = []) {
  const empresas = new Set(calculos.map((c) => c.empresa).filter(Boolean));
  return calculos.length + empresas.size;
}

export function calcularTotaisProcessamento(calculos = []) {
  const empresas = new Set(calculos.map((c) => c.empresa).filter(Boolean));
  return {
    total_funcionarios: calculos.length,
    total_empresas: empresas.size,
  };
}
