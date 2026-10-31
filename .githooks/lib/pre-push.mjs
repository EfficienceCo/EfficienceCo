// Decisao do hook pre-push. Funcoes puras: nao chamam git nem tocam no disco.
// Quem coleta os dados (executar.mjs) e quem executa so ligam as pecas.

const SHA_ZERO = /^0+$/;
const LIMITE_LISTA = 20;

export function ehShaZero(sha) {
  return SHA_ZERO.test(sha);
}

// Cada linha do stdin do git: "<ref local> <sha local> <ref remota> <sha remoto>".
export function lerLinhas(texto) {
  return String(texto)
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const [refLocal, shaLocal, refRemoto, shaRemoto] = linha.split(/\s+/);
      if (!refLocal || !shaLocal || !refRemoto || !shaRemoto) throw new Error(`Linha inesperada do git: "${linha}"`);
      return { refLocal, shaLocal, refRemoto, shaRemoto };
    });
}

// "exclusao" e "tag" nao rodam nada; "novo" e "atualizacao" sao branches que recebem commits.
export function classificarLinha(linha) {
  if (ehShaZero(linha.shaLocal)) return "exclusao";
  if (linha.refRemoto.startsWith("refs/tags/") || linha.refLocal.startsWith("refs/tags/")) return "tag";
  if (!linha.refRemoto.startsWith("refs/heads/")) return "outra-ref";
  return ehShaZero(linha.shaRemoto) ? "novo" : "atualizacao";
}

// Saida de `git status --porcelain=v1 -z --untracked-files=all` -> lista de caminhos.
// Nao rastreados entram: eles mudam o que o teste descobre.
export function lerStatus(saida) {
  const entradas = String(saida).split("\0").filter(Boolean);
  const caminhos = [];
  for (let i = 0; i < entradas.length; i++) {
    const entrada = entradas[i];
    const xy = entrada.slice(0, 2);
    caminhos.push(entrada.slice(3));
    // Renomeacao/copia traz o caminho antigo como entrada seguinte.
    if (/[RC]/.test(xy)) {
      i++;
      if (entradas[i]) caminhos.push(entradas[i]);
    }
  }
  return caminhos;
}

export function ehDocumentacao(caminho) {
  const normal = caminho.replaceAll("\\", "/");
  return /\.md$/i.test(normal) || normal.startsWith("docs/") || normal === "LICENSE";
}

function curto(sha) {
  return sha.slice(0, 7);
}

function nomeDoBranch(ref) {
  return ref.replace(/^refs\/heads\//, "");
}

function listar(itens) {
  const linhas = itens.slice(0, LIMITE_LISTA).map((item) => `  - ${item}`);
  if (itens.length > LIMITE_LISTA) linhas.push(`  ... e mais ${itens.length - LIMITE_LISTA}`);
  return linhas.join("\n");
}

// Decisao de uma ref: { acao: "ignorar" | "pular" | "rodar", motivo, aviso? }.
// `dados` e o que o coletor reuniu para a ref (veja executar.mjs):
//   remotoExiste  - o sha remoto existe neste clone (so em "atualizacao")
//   origemMainExiste - origin/main existe neste clone (so em "novo")
//   arquivos      - caminhos alterados contra a base, ou null se nao foi possivel calcular
function decidirRef(linha, dados) {
  const tipo = classificarLinha(linha);
  if (tipo === "exclusao") return { acao: "ignorar", motivo: "exclusao" };
  if (tipo === "tag") return { acao: "ignorar", motivo: "tag" };
  if (tipo === "outra-ref") return { acao: "ignorar", motivo: "outra-ref" };

  const branch = nomeDoBranch(linha.refRemoto);
  if (tipo === "atualizacao" && !dados.remotoExiste) {
    return {
      acao: "rodar",
      motivo: "base-remota-desconhecida",
      aviso: `A versao de "${branch}" no remoto (${curto(linha.shaRemoto)}) nao existe neste clone. Rode git fetch para o hook comparar so o que mudou. Por seguranca, rodando todos os testes.`,
    };
  }
  if (tipo === "novo" && !dados.origemMainExiste) {
    return {
      acao: "rodar",
      motivo: "origin-main-ausente",
      aviso: `"${branch}" e um branch novo e origin/main nao existe neste clone (rode git fetch origin). Sem base de comparacao, rodando todos os testes.`,
    };
  }
  if (!dados.arquivos) {
    return {
      acao: "rodar",
      motivo: "base-indeterminada",
      aviso: `Nao foi possivel comparar "${branch}" com a base (sem ancestral comum com origin/main?). Por seguranca, rodando todos os testes.`,
    };
  }
  if (dados.arquivos.length === 0) return { acao: "pular", motivo: "sem-alteracoes" };
  if (dados.arquivos.every(ehDocumentacao)) return { acao: "pular", motivo: "so-documentacao" };
  return { acao: "rodar", motivo: "codigo-alterado" };
}

/**
 * entrada = {
 *   linhas:  [{ refLocal, shaLocal, refRemoto, shaRemoto }],
 *   dados:   [{ remotoExiste?, origemMainExiste?, arquivos? }]   // mesma ordem de `linhas`
 *   head:    sha do commit em que a pasta esta,
 *   sujos:   caminhos com alteracao nao commitada (inclui nao rastreados),
 * }
 * saida = { acao: "recusar" | "pular" | "rodar", motivo, mensagem?, avisos: [] }
 */
export function decidir({ linhas, dados = [], head, sujos = [] }) {
  const decisoes = linhas.map((linha, i) => ({ linha, ...decidirRef(linha, dados[i] ?? {}) }));
  const avisos = decisoes.filter((d) => d.aviso).map((d) => d.aviso);
  const aRodar = decisoes.filter((d) => d.acao === "rodar");

  if (aRodar.length === 0) {
    const motivo = decisoes.some((d) => d.acao === "pular")
      ? (decisoes.every((d) => d.acao === "ignorar" || d.motivo === "so-documentacao") ? "so-documentacao" : "sem-alteracoes")
      : "nada-a-testar";
    const mensagens = {
      "so-documentacao": "Push so de documentacao (*.md, docs/, LICENSE): testes pulados.",
      "sem-alteracoes": "Push sem alteracoes de codigo: testes pulados.",
      "nada-a-testar": "Nada a testar (sem commits de branch: exclusao, tag, outra ref ou nada a enviar).",
    };
    return { acao: "pular", motivo, mensagem: mensagens[motivo], avisos };
  }

  const desalinhadas = aRodar.filter((d) => d.linha.shaLocal !== head);
  if (desalinhadas.length > 0) {
    const itens = desalinhadas.map((d) => `${nomeDoBranch(d.linha.refLocal)} (${curto(d.linha.shaLocal)})`);
    const alvo = desalinhadas[0].linha.refLocal.startsWith("refs/heads/") ? nomeDoBranch(desalinhadas[0].linha.refLocal) : "<branch>";
    return {
      acao: "recusar",
      motivo: "commit-diferente-do-head",
      avisos,
      mensagem: [
        `Push recusado: o commit enviado nao e o da pasta (pasta em ${head ? curto(head) : "?"}).`,
        "Os testes rodariam sobre outro codigo e nao provariam nada sobre o que vai ser enviado:",
        listar(itens),
        `Faca checkout do que quer enviar (git switch ${alvo}) e rode o push de novo, um branch por vez.`,
        "Para ignorar esta checagem: git push --no-verify (o CI testa de qualquer forma).",
      ].join("\n"),
    };
  }

  if (sujos.length > 0) {
    return {
      acao: "recusar",
      motivo: "pasta-suja",
      avisos,
      mensagem: [
        `Push recusado: ${sujos.length} arquivo(s) com alteracao nao commitada.`,
        "Os testes rodariam sobre a pasta e nao sobre o que vai ser enviado:",
        listar(sujos),
        "Commite, guarde (git stash -u) ou descarte as alteracoes e tente de novo.",
        "Para ignorar esta checagem: git push --no-verify (o CI testa de qualquer forma).",
      ].join("\n"),
    };
  }

  return { acao: "rodar", motivo: aRodar[0].motivo, avisos };
}
