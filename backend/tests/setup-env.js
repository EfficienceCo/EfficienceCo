import { afterEach } from "node:test";
import { instalarProtecaoServicosExternos, consumirTentativas } from "./helpers/servicos-externos.js";

process.env.SUPABASE_URL ??= "http://127.0.0.1";
process.env.SUPABASE_SERVICE_KEY ??= "test-service-key";
process.env.ESOCIAL_AMBIENTE ??= "homologacao";
process.env.ESOCIAL_SOAP_URL_ENVIO ??=
  "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc";
process.env.ESOCIAL_SOAP_URL_CONSULTA ??=
  "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc";

// A integração governamental manual mantém sua opção explícita de execução.
// O executor automático da #678 remove essa opção dos processos de teste.
const integracaoManual = process.env.ESOCIAL_GOV_INTEGRATION === "1" && process.argv.some(
  argumento => argumento.replaceAll("\\", "/").endsWith("/integration/esocial-gov.producao-restrita.test.js"),
);
if (!integracaoManual) {
  instalarProtecaoServicosExternos();
  afterEach(() => {
    const pendentes = consumirTentativas();
    if (pendentes.length) {
      throw new Error(`Tentativa externa não verificada pelo teste: ${pendentes.map(item => `${item.servico} ${item.destino}`).join("; ")}`);
    }
  });
}
