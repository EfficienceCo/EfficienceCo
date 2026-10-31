// Liga as pecas do hook pre-push: coleta os dados via git, pergunta a decisao e executa.
// O git executa o hook na raiz da arvore de trabalho, entao o comando roda la.
// Comando de teste: `npm test` (o mesmo do CI). PRE_PUSH_COMANDO o substitui; uso dos testes do hook.
import { spawnSync } from "node:child_process";
import { lerEntrada } from "./entrada.mjs";
import { classificarLinha, decidir, lerLinhas, lerStatus } from "./pre-push.mjs";

const inicio = Date.now();

function git(argumentos) {
  const r = spawnSync("git", argumentos, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, saida: r.stdout ?? "" };
}

// Para o que muda a decisao de liberar: se o git falhar, o erro sobe e o push e cancelado (nunca fail-open).
function gitObrigatorio(argumentos) {
  const r = git(argumentos);
  if (!r.ok) throw new Error(`git ${argumentos.join(" ")} falhou`);
  return r.saida;
}

function arquivosAlterados(base, sha) {
  const r = git(["diff", "--name-only", "--no-renames", "-z", base, sha]);
  return r.ok ? r.saida.split("\0").filter(Boolean) : null;
}

function coletar(linha) {
  const tipo = classificarLinha(linha);
  if (tipo === "atualizacao") {
    // Force push depois que o remoto andou: o sha remoto pode nao existir aqui (evita "bad object").
    const remotoExiste = git(["cat-file", "-e", `${linha.shaRemoto}^{commit}`]).ok;
    return { remotoExiste, arquivos: remotoExiste ? arquivosAlterados(linha.shaRemoto, linha.shaLocal) : null };
  }
  if (tipo === "novo") {
    const origemMainExiste = git(["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]).ok;
    if (!origemMainExiste) return { origemMainExiste, arquivos: null };
    const base = git(["merge-base", "refs/remotes/origin/main", linha.shaLocal]);
    return { origemMainExiste, arquivos: base.ok ? arquivosAlterados(base.saida.trim(), linha.shaLocal) : null };
  }
  return {};
}

function tempo() {
  return `${((Date.now() - inicio) / 1000).toFixed(1)} s`;
}

function main() {
  const linhas = lerLinhas(lerEntrada());

  const decisao = decidir({
    linhas,
    dados: linhas.map(coletar),
    head: gitObrigatorio(["rev-parse", "HEAD"]).trim(),
    sujos: lerStatus(gitObrigatorio(["status", "--porcelain=v1", "-z", "--untracked-files=all"])),
  });

  for (const aviso of decisao.avisos) console.error(`[pre-push] Aviso: ${aviso}`);
  if (decisao.acao === "recusar") {
    console.error(`[pre-push] ${decisao.mensagem}`);
    return 1;
  }
  if (decisao.acao === "pular") {
    console.log(`[pre-push] ${decisao.mensagem}`);
    return 0;
  }

  const comando = process.env.PRE_PUSH_COMANDO || "npm test";
  console.log(`[pre-push] Rodando "${comando}" antes do push (git push --no-verify pula).`);
  const r = spawnSync(comando, { shell: true, stdio: ["ignore", "inherit", "inherit"] });
  if (r.status === 0) {
    console.log(`[pre-push] Testes passaram em ${tempo()}. Enviando.`);
    return 0;
  }
  const motivo = r.error ? r.error.message : `codigo de saida ${r.status ?? r.signal}`;
  console.error(`[pre-push] Push cancelado: os testes falharam (${motivo}) apos ${tempo()}.`);
  console.error("[pre-push] Corrija e tente de novo. Para enviar assim mesmo: git push --no-verify (o CI testa de qualquer forma).");
  return 1;
}

try {
  process.exitCode = main();
} catch (erro) {
  console.error(`[pre-push] Erro inesperado: ${erro.message}`);
  console.error("[pre-push] Push cancelado por seguranca. Para ignorar o hook: git push --no-verify.");
  process.exitCode = 1;
}
