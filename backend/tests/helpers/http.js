import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { validarBancoDescartavel } from "./banco.js";

export async function iniciarApiTeste() {
  validarBancoDescartavel();
  const segredo = process.env.JWT_SECRET;
  if (!segredo) throw new Error("JWT_SECRET de teste ausente. Execute npm test na raiz.");

  // Importar o app depois da validação evita carregar o banco com destino indevido.
  // server.js também iniciaria os jobs; aqui queremos apenas as rotas Express.
  const { default: app } = await import("../../src/app.js");
  const servidor = createServer(app);
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${servidor.address().port}`;

  return {
    baseUrl,

    // `formulario` (FormData) serve ao upload multipart do OFX; não combina com `corpo`.
    async requisitar(caminho, { usuario = null, metodo = "GET", corpo, formulario } = {}) {
      const url = new URL(caminho, baseUrl);
      if (typeof caminho !== "string" || !caminho.startsWith("/") || url.origin !== baseUrl) {
        throw new Error("Use um caminho da API local de teste, como /funcionarios/ID.");
      }
      if (!servidor.listening) throw new Error("API de teste encerrada.");
      // Cabeçalhos novos a cada chamada: usuário de uma requisição não fica na próxima.
      const headers = {};
      if (usuario) {
        const { id, email, perfil, cliente_id } = usuario;
        headers.Authorization = `Bearer ${jwt.sign(
          { id, email, perfil, cliente_id }, segredo, { expiresIn: "5m" },
        )}`;
      }
      if (corpo !== undefined && formulario !== undefined) throw new Error("Use corpo ou formulario, não os dois.");
      if (corpo !== undefined) headers["Content-Type"] = "application/json";
      const resposta = await fetch(url, {
        method: metodo,
        headers,
        body: formulario ?? (corpo === undefined ? undefined : JSON.stringify(corpo)),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const tipo = resposta.headers.get("content-type") ?? "";
      // PDF volta como Buffer (como texto os bytes se corromperiam); o resto, JSON ou texto.
      const corpoLido = tipo.includes("application/json") ? await resposta.json()
        : tipo.includes("application/pdf") ? Buffer.from(await resposta.arrayBuffer())
          : await resposta.text();
      return { status: resposta.status, headers: resposta.headers, corpo: corpoLido };
    },

    async fechar() {
      if (!servidor.listening) return;
      await new Promise((resolve, reject) => {
        servidor.close(erro => erro ? reject(erro) : resolve());
        servidor.closeAllConnections();
      });
    },
  };
}
