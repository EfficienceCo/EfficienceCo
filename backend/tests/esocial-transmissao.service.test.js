import { describe, it, mock, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gerarXmlS2200 } from "../src/utils/esocial-xml.util.js";
import { gerarPfxTeste } from "./fixtures/esocial-cert-fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(__dirname, "fixtures", "esocial-gov");

function fixture(nome) {
  return fs.readFileSync(path.join(FIX, nome), "utf8");
}

function funcionarioCLT() {
  return {
    cpf: "123.456.789-09",
    nome: "Maria Aparecida de Souza",
    sexo: "F",
    racaCor: 1,
    grauInstr: "07",
    dataNascimento: "1990-05-14",
    naturalidade: { codMunicipio: "3550308", uf: "SP" },
    endereco: {
      logradouro: "das Acácias",
      numero: "120",
      bairro: "Centro",
      cep: "01311-000",
      codMunicipio: "3550308",
      uf: "SP",
    },
  };
}

function admissaoCLT() {
  return {
    empregador: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
    matricula: "EMP0001",
    codCateg: 101,
    dataAdmissao: "2026-08-01",
    tpRegTrab: 1,
    tpRegPrev: 1,
    cadIni: false,
    tpAdmissao: 1,
    tpRegJor: 1,
    natAtividade: 1,
    fgts: { dataOpcao: "2026-08-01" },
    cargo: { nome: "Analista Contábil", cbo: "2522-10" },
    remuneracao: { valorSalarioFixo: 3500.5, unidadeSalarioFixo: 5 },
    duracao: { tpContr: 1 },
    localTrabalho: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
    horContratual: {
      qtdHrsSem: 44,
      tpJornada: 5,
      tmpParc: 0,
      horarioNoturno: false,
      descricaoJornada: "Segunda a sexta",
    },
    ambiente: "homologacao",
    dataHoraGeracao: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
    sequencial: 1,
  };
}

const mockClient = {
  EnviarLoteEventosAsync: mock.fn(async () => [fixture("retorno-envio-sucesso.xml")]),
  ConsultarLoteEventosAsync: mock.fn(async () => [fixture("retorno-processamento-aceito.xml")]),
  setSecurity: mock.fn(),
};

const mockSoap = {
  createClientAsync: mock.fn(async () => mockClient),
  ClientSSLSecurity: class {
    constructor() {}
  },
};

mock.module("soap", { defaultExport: mockSoap, namedExports: mockSoap });

const { transmitirEventoEsocial } = await import("../src/services/esocial-transmissao.service.js");

after(() => mock.restoreAll());

describe("esocial-transmissao.service (mock SOAP)", () => {
  it("A6.1/A6.2 envia lote e consulta até obter nrRecibo", async () => {
    const { buffer, senha } = gerarPfxTeste();
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());

    const resultado = await transmitirEventoEsocial({
      tipoEvento: "S-2200",
      xmlEvento: xml,
      certificadoBuffer: buffer,
      senha,
      config: {
        ambiente: "homologacao",
        tpAmbEsperado: 2,
        urlEnvio:
          "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
        urlConsulta:
          "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
        allowlist: new Set(["webservices.producaorestrita.esocial.gov.br"]),
        poll: { tentativas: 3, intervaloMs: 1 },
      },
    });

    assert.equal(resultado.status, "transmitido");
    assert.equal(resultado.numero_recibo, "1.2.0001234567890123");
    assert.equal(mockClient.EnviarLoteEventosAsync.mock.calls.length, 1);
    assert.equal(mockClient.ConsultarLoteEventosAsync.mock.calls.length, 1);
  });

  it("A6.2 faz poll quando processamento está aguardando", async () => {
    mockClient.ConsultarLoteEventosAsync.mock.mockImplementation(async () => {
      if (mockClient.ConsultarLoteEventosAsync.mock.calls.length <= 1) {
        return [fixture("retorno-processamento-aguardando.xml")];
      }
      return [fixture("retorno-processamento-aceito.xml")];
    });

    const { buffer, senha } = gerarPfxTeste();
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());

    const resultado = await transmitirEventoEsocial({
      tipoEvento: "S-2200",
      xmlEvento: xml,
      certificadoBuffer: buffer,
      senha,
      config: {
        ambiente: "homologacao",
        tpAmbEsperado: 2,
        urlEnvio:
          "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc",
        urlConsulta:
          "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc",
        allowlist: new Set(["webservices.producaorestrita.esocial.gov.br"]),
        poll: { tentativas: 5, intervaloMs: 1 },
      },
    });

    assert.equal(resultado.status, "transmitido");
    assert.ok(mockClient.ConsultarLoteEventosAsync.mock.calls.length >= 2);
  });
});
