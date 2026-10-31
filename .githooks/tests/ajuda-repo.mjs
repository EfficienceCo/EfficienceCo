// Repositorios git temporarios para testar o hook de verdade: um "remoto" bare e um clone de trabalho.
// O comando de teste do hook (PRE_PUSH_COMANDO) e trocado por um script falso que registra cada execucao.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const pastaHooks = path.resolve(aqui, "..").replaceAll("\\", "/");

// Quando o teste roda dentro de um git push (hook -> npm test), as variaveis GIT_* do pai nao podem vazar.
const semGit = Object.fromEntries(Object.entries(process.env).filter(([nome]) => !nome.startsWith("GIT_")));

export function git(cwd, argumentos, env = {}) {
  const r = spawnSync("git", argumentos, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...semGit, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0", ...env },
  });
  return { status: r.status, saida: r.stdout, erro: r.stderr, texto: `${r.stdout}${r.stderr}` };
}

export function git0(cwd, argumentos) {
  const r = git(cwd, argumentos);
  if (r.status !== 0) throw new Error(`git ${argumentos.join(" ")} falhou: ${r.texto}`);
  return r.saida.trim();
}

export function escrever(raiz, arquivo, conteudo) {
  const caminho = path.join(raiz, arquivo);
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, conteudo);
}

export function commitar(raiz, arquivo, conteudo, mensagem = `altera ${arquivo}`) {
  escrever(raiz, arquivo, conteudo);
  git0(raiz, ["add", "-A"]);
  git0(raiz, ["commit", "-q", "-m", mensagem]);
  return git0(raiz, ["rev-parse", "HEAD"]);
}

function configurarIdentidade(raiz, nome) {
  for (const [chave, valor] of [["user.name", nome], ["user.email", `${nome.toLowerCase()}@example.com`], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) {
    git0(raiz, ["config", chave, valor]);
  }
}

export function criarCenario() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-"));
  const remoto = path.join(base, "remoto.git");
  const trabalho = path.join(base, "trabalho");
  const registro = path.join(base, "execucoes.log");
  const comando = path.join(base, "comando.mjs").replaceAll("\\", "/");
  fs.writeFileSync(comando, [
    'import fs from "node:fs";',
    "fs.appendFileSync(process.env.PRE_PUSH_REGISTRO, `${process.cwd()}\\n`);",
    "process.exit(Number(process.env.PRE_PUSH_SAIDA ?? 0));",
  ].join("\n"));

  git0(base, ["init", "-q", "--bare", "-b", "main", remoto]);
  git0(base, ["clone", "-q", remoto, trabalho]);
  configurarIdentidade(trabalho, "Teste");
  git0(trabalho, ["checkout", "-q", "-b", "main"]);
  commitar(trabalho, "backend/a.js", "a1\n", "base");
  commitar(trabalho, "README.md", "# base\n", "base-md");
  // O hook so entra depois do push inicial, que nao deve passar por ele.
  git0(trabalho, ["push", "-q", "-u", "origin", "main"]);
  git0(trabalho, ["config", "core.hooksPath", pastaHooks]);

  function push(argumentos, { saida = 0, cwd = trabalho } = {}) {
    return git(cwd, ["push", ...argumentos], {
      PRE_PUSH_COMANDO: `node "${comando}"`,
      PRE_PUSH_REGISTRO: registro,
      PRE_PUSH_SAIDA: String(saida),
    });
  }

  // Segundo clone, sem hook, para o "outro dev" que empurra para o remoto sem que o primeiro saiba.
  function clonarOutro() {
    const outro = path.join(base, "outro");
    git0(base, ["clone", "-q", remoto, outro]);
    configurarIdentidade(outro, "Outro");
    return outro;
  }

  return {
    base, remoto, trabalho,
    push,
    clonarOutro,
    execucoes: () => (fs.existsSync(registro) ? fs.readFileSync(registro, "utf8").split("\n").filter(Boolean) : []),
    refRemota: (ref) => {
      const r = git(remoto, ["rev-parse", "--verify", "--quiet", ref]);
      return r.status === 0 ? r.saida.trim() : null;
    },
    limpar: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

// Cria o cenario e garante a limpeza ao fim do teste.
export function cenario(t) {
  const c = criarCenario();
  t.after(() => c.limpar());
  return c;
}

// Compara depois de resolver links (macOS: /var -> /private/var; Windows: junction e nomes 8.3).
export function mesmoCaminho(a, b) {
  const real = (p) => fs.realpathSync.native(p).replaceAll("\\", "/").toLowerCase();
  return real(a) === real(b);
}
