import { createServer } from "node:http";
import express from "express";
import jwt from "jsonwebtoken";

// App Express mínimo para testar UM middleware isolado, por HTTP de verdade.
// Os middlewares são os do código de produção; só a rota que os recebe é de teste.
export async function subirMiniApp(montar) {
  const app = express();
  app.use(express.json());
  montar(app);
  const servidor = createServer(app);
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${servidor.address().port}`;
  return {
    async requisitar(caminho, { headers = {}, metodo = "GET" } = {}) {
      const resposta = await fetch(new URL(caminho, baseUrl), {
        method: metodo, headers, redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      return { status: resposta.status, corpo: await resposta.json().catch(() => null) };
    },
    async fechar() {
      await new Promise((resolve, reject) => {
        servidor.close(erro => (erro ? reject(erro) : resolve()));
        servidor.closeAllConnections();
      });
    },
  };
}

// Handler final de teste: se a resposta tem usuario/ok, o middleware deixou passar.
export function responderOk(req, res) {
  res.json({ ok: true, usuario: req.usuario ?? null });
}

export function bearer(payload, { segredo = process.env.JWT_SECRET, ...opcoes } = {}) {
  return { Authorization: `Bearer ${jwt.sign(payload, segredo, { expiresIn: "5m", ...opcoes })}` };
}

// Roda UM middleware direto, com req/res mínimos, sem passar por HTTP.
// Existe porque o servidor HTTP do Node corta o espaço do fim do valor do cabeçalho:
// "Bearer " (token vazio) chega ao middleware como "Bearer" e nunca exercita o ramo
// startsWith("Bearer ") com token vazio. Aqui o valor chega exatamente como escrito.
export function executarMiddleware(middleware, headers = {}) {
  const req = { method: "GET", originalUrl: "/direto", headers };
  const resultado = { status: null, corpo: null, passou: false };
  const res = {
    status(codigo) { resultado.status = codigo; return res; },
    json(corpo) { resultado.corpo = corpo; return res; },
  };
  middleware(req, res, () => { resultado.passou = true; });
  return { ...resultado, req };
}
