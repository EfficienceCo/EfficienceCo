// Enumera as rotas realmente registradas no app Express (pilha do roteador),
// em vez de depender de uma lista escrita à mão.

function prefixoDoMontador(camada) {
  if (camada.regexp?.fast_slash) return "";
  // app.use("/clientes", router) vira /^\/clientes\/?(?=\/|$)/i
  const fonte = camada.regexp.source
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "");
  if (fonte.includes("(") || fonte.includes("[")) {
    throw new Error(`Prefixo de montagem não suportado pelo enumerador: ${camada.regexp}`);
  }
  return fonte.replaceAll(String.raw`\/`, "/");
}

function percorrer(pilha, prefixo, achadas) {
  for (const camada of pilha) {
    if (camada.route) {
      const caminho = (prefixo + camada.route.path).replace(/\/$/, "") || "/";
      for (const metodo of Object.keys(camada.route.methods)) {
        achadas.push({
          metodo: metodo.toUpperCase(),
          caminho,
          // nomes dos handlers, só para diagnóstico de mensagens de erro
          handlers: camada.route.stack.map(item => item.name || "(anonima)"),
        });
      }
    } else if (camada.handle?.stack) {
      percorrer(camada.handle.stack, prefixo + prefixoDoMontador(camada), achadas);
    }
  }
}

export function enumerarRotas(app) {
  const achadas = [];
  percorrer(app._router.stack, "", achadas);
  return achadas;
}

export const chaveDaRota = ({ metodo, caminho }) => `${metodo} ${caminho}`;
