// Configuração de ambiente eSocial (#ES-8).
// Manual do Desenvolvedor §7.5 (EnviarLoteEventos) e §7.6 (ConsultarLoteEventos):
// Produção Restrita vs Produção usam hosts distintos — nunca misturar por config.

const HOSTS_HOMOLOGACAO = new Set([
  "webservices.producaorestrita.esocial.gov.br",
]);

const HOSTS_PRODUCAO = new Set([
  "webservices.envio.esocial.gov.br",
  "webservices.consulta.esocial.gov.br",
]);

const URLS_HOMOLOGACAO_PADRAO = {
  envio:
    "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
  consulta:
    "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
};

const URLS_PRODUCAO_PADRAO = {
  envio:
    "https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
  consulta:
    "https://webservices.consulta.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
};

export class ErroConfigESocial extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroConfigESocial";
  }
}

function hostDeUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    throw new ErroConfigESocial(`URL eSocial inválida: ${url}`);
  }
}

function validarParUrls({ ambiente, urlEnvio, urlConsulta, nodeEnv }) {
  const hostEnvio = hostDeUrl(urlEnvio);
  const hostConsulta = hostDeUrl(urlConsulta);

  const emProducao =
    ambiente === "producao" && nodeEnv === "production";

  if (!emProducao) {
    if (HOSTS_PRODUCAO.has(hostEnvio) || HOSTS_PRODUCAO.has(hostConsulta)) {
      throw new ErroConfigESocial(
        "Ambiente não-produção não pode apontar para webservices de produção do eSocial",
      );
    }
    if (!HOSTS_HOMOLOGACAO.has(hostEnvio) || !HOSTS_HOMOLOGACAO.has(hostConsulta)) {
      throw new ErroConfigESocial(
        "URLs de homologação devem usar webservices.producaorestrita.esocial.gov.br",
      );
    }
    return;
  }

  if (!HOSTS_PRODUCAO.has(hostEnvio) || !HOSTS_PRODUCAO.has(hostConsulta)) {
    throw new ErroConfigESocial(
      "Deploy de produção exige URLs oficiais webservices.envio/consulta.esocial.gov.br",
    );
  }
}

export function carregarConfigESocial(env = process.env) {
  const ambiente = env.ESOCIAL_AMBIENTE ?? "homologacao";
  if (!["homologacao", "producao"].includes(ambiente)) {
    throw new ErroConfigESocial(
      "ESOCIAL_AMBIENTE deve ser 'homologacao' ou 'producao'",
    );
  }

  const padrao =
    ambiente === "producao" ? URLS_PRODUCAO_PADRAO : URLS_HOMOLOGACAO_PADRAO;

  const urlEnvio = env.ESOCIAL_SOAP_URL_ENVIO ?? padrao.envio;
  const urlConsulta = env.ESOCIAL_SOAP_URL_CONSULTA ?? padrao.consulta;

  validarParUrls({
    ambiente,
    urlEnvio,
    urlConsulta,
    nodeEnv: env.NODE_ENV ?? "development",
  });

  const allowlist = ambiente === "producao" ? HOSTS_PRODUCAO : HOSTS_HOMOLOGACAO;

  return {
    ambiente,
    tpAmbEsperado: ambiente === "producao" ? 1 : 2,
    urlEnvio,
    urlConsulta,
    allowlist,
    poll: {
      tentativas: Number(env.ESOCIAL_POLL_TENTATIVAS ?? 8),
      intervaloMs: Number(env.ESOCIAL_POLL_INTERVALO_MS ?? 3000),
    },
  };
}

/** Valida se a URL de destino está na allowlist do ambiente configurado. */
export function assertUrlPermitida(url, config) {
  const host = hostDeUrl(url);
  if (!config.allowlist.has(host)) {
    throw new ErroConfigESocial(`Host SOAP não permitido para este ambiente: ${host}`);
  }
}

/** Singleton carregado no startup — falha cedo se config inválida. */
export const configESocial = carregarConfigESocial();
