// Este arquivo prepara somente o projeto TEMPORARIO criado pelo executor.
// Nao altera database/migrations e nao se conecta a banco remoto.
import fs from "node:fs";
import path from "node:path";

export function prepararBanco(raiz, temporario, projetoId) {
  const arquivoConfig = path.join(temporario, "supabase", "config.toml");
  let config = fs.readFileSync(arquivoConfig, "utf8");
  if (!/^project_id\s*=/m.test(config)) {
    throw new Error("A configuracao gerada pela CLI nao tem project_id.");
  }
  config = config.replace(/^project_id\s*=.*$/m, `project_id = "${projetoId}"`);

  // A CLI acabou de criar esta configuracao. Somamos 1000 a cada porta
  // publicada para separar o teste das portas padrao do desenvolvimento.
  const portas = [];
  config = config.replace(
    /^(\s*(?:port|shadow_port|inspector_port|smtp_port|pop3_port|vector_port)\s*=\s*)(\d+)/gm,
    (_, inicio, valor) => {
      const porta = Number(valor) + 1000;
      if (porta > 65535) throw new Error("Porta de teste fora da faixa.");
      portas.push(porta);
      return `${inicio}${porta}`;
    },
  );
  // Usamos a porta da API para conferir a URL que o status da CLI devolver.
  const secaoApi = config.match(/^\[api\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
  const portaApi = secaoApi?.[1].match(/^port\s*=\s*(\d+)/m);
  if (!portaApi) throw new Error("A configuracao da CLI nao tem api.port.");
  fs.writeFileSync(arquivoConfig, config);

  const origem = path.join(raiz, "database", "migrations");
  const destino = path.join(temporario, "supabase", "migrations");
  fs.mkdirSync(destino, { recursive: true });
  const arquivos = fs.readdirSync(origem).filter((nome) => nome.endsWith(".sql"));
  if (!arquivos.length) throw new Error("Nenhuma migration encontrada.");
  if (arquivos.some((nome) => !/^\d+\.sql$/.test(nome))) {
    throw new Error("Existe migration fora do formato numerico. Atualize o adaptador.");
  }
  arquivos.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  const numeros = arquivos.map((nome) => Number.parseInt(nome, 10));
  if (new Set(numeros).size !== numeros.length) {
    throw new Error("Existem migrations com o mesmo numero.");
  }

  for (const nome of arquivos) {
    // Um timestamp deterministico por numero, mantendo a ordem original.
    const numero = Number.parseInt(nome, 10);
    const data = new Date(Date.UTC(2000, 0, 1) + numero * 1000);
    const timestamp = data.toISOString().slice(0, 19).replace(/[-:T]/g, "");
    fs.copyFileSync(path.join(origem, nome), path.join(destino, `${timestamp}_original_${nome}`));
  }
  console.log(`[preparo] ${arquivos.length} migrations copiadas em ordem numerica.`);
  // Suporte de reset somente no projeto temporário, após o histórico da aplicação.
  fs.copyFileSync(
    path.join(raiz, "backend", "tests", "helpers", "resetar-banco.sql"),
    path.join(destino, "20991231235959_infra_testes_reset.sql"),
  );
  console.log("[preparo] SQL de reset dos testes adicionado somente ao banco descartavel.");
  return { portaApi: Number(portaApi[1]), portas: [...new Set(portas)] };
}
