import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  carregarConfigESocial,
  ErroConfigESocial,
} from "../src/config/esocial-ambiente.config.js";

describe("esocial-ambiente.config", () => {
  it("aceita URLs de Produção Restrita em homologacao", () => {
    const cfg = carregarConfigESocial({
      ESOCIAL_AMBIENTE: "homologacao",
      NODE_ENV: "development",
      ESOCIAL_SOAP_URL_ENVIO:
        "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
      ESOCIAL_SOAP_URL_CONSULTA:
        "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
    });
    assert.equal(cfg.ambiente, "homologacao");
    assert.equal(cfg.tpAmbEsperado, 2);
  });

  it("falha se dev apontar para produção real", () => {
    assert.throws(
      () =>
        carregarConfigESocial({
          ESOCIAL_AMBIENTE: "homologacao",
          NODE_ENV: "development",
          ESOCIAL_SOAP_URL_ENVIO:
            "https://webservices.envio.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
          ESOCIAL_SOAP_URL_CONSULTA:
            "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
        }),
      ErroConfigESocial,
    );
  });

  it("exige URLs oficiais de produção quando ambiente=producao", () => {
    assert.throws(
      () =>
        carregarConfigESocial({
          ESOCIAL_AMBIENTE: "producao",
          NODE_ENV: "production",
          ESOCIAL_SOAP_URL_ENVIO:
            "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
          ESOCIAL_SOAP_URL_CONSULTA:
            "https://webservices.consulta.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
        }),
      ErroConfigESocial,
    );
  });
});
