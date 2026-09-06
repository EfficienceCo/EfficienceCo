import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gerarXmlS2200 } from "../src/utils/esocial-xml.util.js";
import { assinarXmlEvento } from "../src/utils/esocial-assinatura.util.js";
import { gerarPfxTeste } from "./fixtures/esocial-cert-fixture.js";

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

describe("esocial-assinatura.util", () => {
  it("A3.1 assina S-2200 com Signature e X509Certificate", () => {
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());
    const { privateKeyPem, certificatePem } = gerarPfxTeste();
    const assinado = assinarXmlEvento(xml, { privateKeyPem, certificatePem });
    assert.match(assinado, /<Signature/);
    assert.match(assinado, /<X509Certificate>/);
    assert.match(assinado, /rsa-sha256/i);
  });

  it("A3.3 referencia o atributo Id do evento", () => {
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());
    const { privateKeyPem, certificatePem } = gerarPfxTeste();
    const assinado = assinarXmlEvento(xml, { privateKeyPem, certificatePem });
    const id = xml.match(/\bId="(ID[^"]+)"/)[1];
    assert.match(assinado, new RegExp(`URI="#${id}"`));
  });
});
