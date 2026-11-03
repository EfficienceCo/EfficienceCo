import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { urlToHttpOptions } from "node:url";

const tentativas = [];
let instalado = false;

export class ErroServicoExternoBloqueado extends Error {
  constructor(tentativa) {
    super(`Serviço externo bloqueado: ${tentativa.servico} (${tentativa.transporte}) ${tentativa.destino}`);
    this.name = "ErroServicoExternoBloqueado";
    this.code = "SERVICO_EXTERNO_BLOQUEADO";
  }
}

export function lerTentativas() {
  return tentativas.map(tentativa => ({ ...tentativa }));
}

// O teste consome o registro depois de conferir as tentativas intencionais.
export function consumirTentativas() {
  return tentativas.splice(0).map(tentativa => ({ ...tentativa }));
}

function verificar(url, transporte, metodo = "GET") {
  const host = url.hostname.toLowerCase();
  const porta = Number(url.port);
  let servico;
  if (/^\/storage\/v1(?:\/|$)/.test(url.pathname)) servico = "storage";
  else if (/(^|\.)esocial(\.|$)/.test(host)) servico = "eSocial";
  else if (/(^|\.)(sefaz|nfe|nfce)(\.|$)/.test(host) || host.endsWith(".fazenda.gov.br")) servico = "SEFAZ";
  else if ([25, 465, 587, 2525].includes(porta) || /(^|\.)(smtp|sendgrid|mailgun|resend)(\.|$)/.test(host)) servico = "e-mail";
  else if (/^\/rest\/v1(?:\/|$)/.test(url.pathname) && url.origin !== process.env.TEST_SUPABASE_URL) servico = "banco fora do descartável";
  else if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) servico = "rede externa";
  if (!servico) return;

  const tentativa = {
    servico,
    transporte,
    metodo,
    // Não registrar credenciais, query strings, cabeçalhos ou corpo enviado.
    destino: `${url.protocol}//${url.host}${url.pathname}`,
  };
  tentativas.push(tentativa);
  throw new ErroServicoExternoBloqueado(tentativa);
}

function destinoHttp(argumentos, protocolo) {
  const primeiro = argumentos[0];
  const comUrl = typeof primeiro === "string" || primeiro instanceof URL;
  const base = comUrl ? urlToHttpOptions(new URL(primeiro)) : primeiro;
  const opcoes = { ...base, ...(comUrl && typeof argumentos[1] === "object" ? argumentos[1] : {}) };
  // Clientes HTTP podem colocar a URL absoluta em path ao usar um proxy.
  if (/^https?:\/\//.test(opcoes.path ?? "")) return { url: new URL(opcoes.path), metodo: opcoes.method };
  const host = opcoes.hostname ?? opcoes.host ?? "localhost";
  const autoridade = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const porta = opcoes.port ? `:${opcoes.port}` : "";
  return {
    url: new URL(`${opcoes.protocol ?? protocolo}//${autoridade}${porta}${opcoes.path ?? "/"}`),
    metodo: opcoes.method,
  };
}

export function instalarProtecaoServicosExternos() {
  if (instalado) return;
  instalado = true;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async function (entrada, opcoes) {
    const url = new URL(entrada instanceof Request ? entrada.url : entrada);
    verificar(url, "fetch", opcoes?.method ?? (entrada instanceof Request ? entrada.method : "GET"));
    return fetchOriginal.call(this, entrada, opcoes);
  };

  for (const [modulo, protocolo] of [[http, "http:"], [https, "https:"]]) {
    for (const metodo of ["request", "get"]) {
      const original = modulo[metodo];
      modulo[metodo] = function (...argumentos) {
        const destino = destinoHttp(argumentos, protocolo);
        verificar(destino.url, `${protocolo.slice(0, -1)}.${metodo}`, destino.metodo);
        return Reflect.apply(original, this, argumentos);
      };
    }
  }

  const conectar = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...argumentos) {
    const primeiro = Array.isArray(argumentos[0]) ? argumentos[0][0] : argumentos[0];
    // Pipes locais do Node não são conexões TCP.
    if (typeof primeiro === "string" && !/^\d+$/.test(primeiro)) return Reflect.apply(conectar, this, argumentos);
    const opcoes = typeof primeiro === "object" ? primeiro : {
      port: primeiro, host: typeof argumentos[1] === "string" ? argumentos[1] : undefined,
    };
    if (opcoes?.path) return Reflect.apply(conectar, this, argumentos);
    const host = opcoes?.host ?? opcoes?.hostname ?? "localhost";
    const autoridade = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
    verificar(new URL(`tcp://${autoridade}:${opcoes?.port ?? 0}`), "tcp", "CONNECT");
    return Reflect.apply(conectar, this, argumentos);
  };

  // Mantém imports nomeados de http/https sincronizados com os wrappers.
  syncBuiltinESMExports();
}
