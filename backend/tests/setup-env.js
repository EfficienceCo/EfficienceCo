process.env.SUPABASE_URL ??= "http://127.0.0.1";
process.env.SUPABASE_SERVICE_KEY ??= "test-service-key";
process.env.ESOCIAL_AMBIENTE ??= "homologacao";
process.env.ESOCIAL_SOAP_URL_ENVIO ??=
  "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc";
process.env.ESOCIAL_SOAP_URL_CONSULTA ??=
  "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc";
