// Execute pelo npm test / npm run test:smoke, conforme o roteiro.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { prepararBanco } from "./preparar.mjs";

const raiz = fs.realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const somenteSmoke = process.argv.includes("--smoke");
const id = randomUUID();
// A CLI limita o identificador do projeto; manter curto alinha start e stop.
const projetoId = `efficience-testes-678-${id.replaceAll("-", "").slice(0, 12)}`;
const pastaPai = path.join(raiz, ".test-runtime");
const temporario = path.join(pastaPai, `678-${id}`);
const inicio = Date.now();
let filhoAtivo;
let interrompido = false;
let encerrando = false;
let tentativaDeSubida = false;
let pastaCriada = false;
let codigoFinal = 0;

function encerrarArvore(filho) {
  if (!filho?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(filho.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-filho.pid, "SIGKILL"); } catch {}
  }
}

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    if (encerrando || interrompido) return;
    interrompido = true;
    console.error("\n[executor] Interrupcao recebida; iniciando limpeza.");
    encerrarArvore(filhoAtivo);
  });
}

function executar(comando, argumentos, opcoes = {}) {
  if (interrompido && !opcoes.limpeza) return Promise.reject(new Error("Execucao interrompida."));
  return new Promise((resolve, reject) => {
    const filho = spawn(comando, argumentos, {
      cwd: opcoes.cwd ?? raiz,
      env: opcoes.env ?? ambienteCli,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: opcoes.capturar ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    filhoAtivo = filho;
    let saida = "";
    let expirou = false;
    if (opcoes.capturar) filho.stdout.setEncoding("utf8").on("data", (parte) => { saida += parte; });
    const timeout = setTimeout(() => {
      expirou = true;
      encerrarArvore(filho);
    }, opcoes.timeout ?? 20 * 60 * 1000);
    filho.once("error", (erro) => {
      clearTimeout(timeout);
      if (filhoAtivo === filho) filhoAtivo = undefined;
      reject(erro);
    });
    filho.once("close", (codigo, sinal) => {
      clearTimeout(timeout);
      if (filhoAtivo === filho) filhoAtivo = undefined;
      if (expirou) reject(new Error("Comando excedeu o tempo limite."));
      else if (codigo !== 0) reject(new Error(`Comando terminou com erro (${codigo ?? sinal}).`));
      else resolve(saida);
    });
  });
}

// Nao passamos credenciais/URLs Supabase da sessao de desenvolvimento para a CLI.
const ambienteCli = { ...process.env };
for (const nome of Object.keys(ambienteCli)) {
  if (nome.startsWith("SUPABASE_") || nome.startsWith("TEST_SUPABASE_")) delete ambienteCli[nome];
}
function cli(argumentos, opcoes = {}) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !fs.existsSync(npmCli)) throw new Error("Execute usando npm test ou npm run test:smoke.");
  // Chamar npm-cli.js pelo Node evita problemas de npx.cmd no Windows.
  return executar(process.execPath, [npmCli, "exec", "--yes=false", "--", "supabase", ...argumentos, "--workdir", temporario], opcoes);
}

async function conferirPorta(porta) {
  await new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.once("error", () => reject(new Error(`Porta ${porta} ocupada. O teste nao foi iniciado.`)));
    servidor.listen({ port: porta, host: "127.0.0.1", exclusive: true }, () => servidor.close(resolve));
  });
}

function descobrirTestes(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const arquivo = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) return descobrirTestes(arquivo);
    if (!entrada.name.endsWith(".test.js")) return [];
    // Este arquivo e manual: ele pode falar com o governo e nao e parte da suite automatica.
    if (arquivo.replaceAll("\\", "/").endsWith("/integration/esocial-gov.producao-restrita.test.js")) return [];
    return [arquivo];
  }).sort();
}

function limparPasta() {
  const paiReal = fs.realpathSync(pastaPai);
  const esperado = path.resolve(pastaPai);
  const normalizar = (valor) => process.platform === "win32" ? valor.toLowerCase() : valor;
  if (normalizar(paiReal) !== normalizar(esperado) || path.dirname(temporario) !== esperado || !path.basename(temporario).startsWith("678-")) {
    throw new Error("Caminho temporario fora do local esperado; limpeza recusada.");
  }
  if (fs.lstatSync(temporario).isSymbolicLink()) throw new Error("Diretorio temporario virou link; limpeza recusada.");
  fs.rmSync(temporario, { recursive: true, force: true });
  if (fs.readdirSync(pastaPai).length === 0) fs.rmdirSync(pastaPai);
}

try {
  // Recusar configuracao de destino recebida de fora e mais claro que sobrescreve-la.
  for (const nome of ["SUPABASE_URL", "DATABASE_URL", "TEST_SUPABASE_URL", "TEST_SUPABASE_SERVICE_KEY"]) {
    if (process.env[nome]) throw new Error(`Remova ${nome} deste terminal. O executor cria seu proprio destino local.`);
  }
  if (!fs.existsSync(path.join(raiz, "node_modules", "supabase", "package.json"))) {
    throw new Error("Instale a CLI na raiz: npm install --save-dev --save-exact supabase");
  }
  await executar("docker", ["info", "--format", "{{.ServerVersion}}"], { capturar: true, timeout: 30_000 });
  if (fs.existsSync(pastaPai) && fs.lstatSync(pastaPai).isSymbolicLink()) throw new Error(".test-runtime nao pode ser um link.");
  fs.mkdirSync(temporario, { recursive: true });
  pastaCriada = true;

  console.log("[1/6] Criando configuracao temporaria do Supabase.");
  await cli(["init"]);
  const { portaApi, portas } = prepararBanco(raiz, temporario, projetoId);
  for (const porta of portas) await conferirPorta(porta);

  console.log("[2/6] Subindo Supabase e aplicando migrations. A primeira vez baixa imagens.");
  tentativaDeSubida = true;
  await cli(["start"]);
  const status = JSON.parse(await cli(["status", "--output", "json"], { capturar: true }));
  const url = new URL(status.API_URL);
  const esperado = `http://127.0.0.1:${portaApi}`;
  if (url.origin !== esperado || url.pathname !== "/" || url.search || url.username || url.password) {
    throw new Error("A URL devolvida pela CLI nao pertence ao destino local esperado.");
  }
  if (!status.SERVICE_ROLE_KEY) throw new Error("A CLI nao devolveu a chave service_role local. Confira a versao instalada.");

  const ambienteTeste = {
    ...ambienteCli,
    NODE_ENV: "test",
    SUPABASE_URL: esperado,
    SUPABASE_SERVICE_KEY: status.SERVICE_ROLE_KEY,
    TEST_SUPABASE_URL: esperado,
    TEST_SUPABASE_SERVICE_KEY: status.SERVICE_ROLE_KEY,
    TEST_SUPABASE_PORT: String(portaApi),
    TEST_SUPABASE_PROJECT_ID: projetoId,
    JWT_SECRET: "segredo-ficticio-exclusivo-dos-testes-678",
    DOTENV_CONFIG_PATH: path.join(temporario, "nenhum-env-local"),
  };
  delete ambienteTeste.SUPABASE_KEY;
  delete ambienteTeste.ESOCIAL_GOV_INTEGRATION;

  const smoke = path.join(raiz, "backend", "tests", "infra", "banco-real.test.js");
  if (!fs.existsSync(smoke)) throw new Error("Copie o exemplo banco-real.test.js para backend/tests/infra/.");
  const testes = somenteSmoke ? [smoke] : descobrirTestes(path.join(raiz, "backend", "tests"));
  if (!testes.length) throw new Error("Nenhum arquivo de teste automatico encontrado.");
  console.log(`[3/6] Rodando ${testes.length} arquivo(s) do backend.`);
  await executar(process.execPath, [
    "--import", pathToFileURL(path.join(raiz, "backend", "tests", "setup-env.js")).href,
    "--experimental-test-module-mocks", "--test", "--test-concurrency=1", ...testes,
  ], { cwd: path.join(raiz, "backend"), env: ambienteTeste });

  if (!somenteSmoke) {
    console.log("[4/6] Rodando pytest do agente.");
    const python = path.join(raiz, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    if (!fs.existsSync(python)) throw new Error("Crie o .venv na raiz e instale as dependencias do agente conforme o roteiro.");
    await executar(python, [
      "-m", "pytest", "tests", "--basetemp", path.join(temporario, "pytest"),
      "-o", `cache_dir=${path.join(temporario, "pytest-cache")}`,
    ], {
      cwd: path.join(raiz, "agente", "worker"), env: ambienteTeste,
    });
  } else {
    console.log("[4/6] Modo inicial: somente o teste de escrita/leitura real.");
  }
} catch (erro) {
  codigoFinal = interrompido ? 130 : 1;
  console.error(`[falha] ${erro.message}`);
} finally {
  encerrando = true;
  let bancoRemovido = !tentativaDeSubida;
  if (tentativaDeSubida) {
    console.log("[5/6] Removendo somente o projeto temporario desta execucao.");
    try {
      await cli(["stop", "--no-backup", "--project-id", projetoId], { limpeza: true, timeout: 120_000 });
      for (const comando of [["ps", "-aq"], ["volume", "ls", "-q"]]) {
        const restantes = await executar("docker", [...comando, "--filter", `label=com.supabase.cli.project=${projetoId}`], {
          capturar: true, limpeza: true, timeout: 30_000,
        });
        if (restantes.trim()) throw new Error("Ainda existem containers ou volumes do projeto temporario.");
      }
      bancoRemovido = true;
    } catch (erro) {
      codigoFinal = 1;
      console.error(`[limpeza] ${erro.message}. Projeto preservado para recuperacao: ${projetoId}`);
    }
  }
  if (pastaCriada && bancoRemovido) {
    try { limparPasta(); } catch (erro) { codigoFinal = 1; console.error(`[limpeza] ${erro.message}`); }
  } else if (pastaCriada) {
    console.error(`[limpeza] Configuracao mantida em ${temporario}.`);
  }
  if (interrompido && codigoFinal === 0) codigoFinal = 130;
  console.log(`[6/6] Tempo total: ${((Date.now() - inicio) / 1000).toFixed(1)} s. Codigo de saida: ${codigoFinal}.`);
  process.exitCode = codigoFinal;
}
