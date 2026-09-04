import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gerarXmlS2200 } from "../src/utils/esocial-xml.util.js";
import { assinarXmlEvento } from "../src/utils/esocial-assinatura.util.js";
import {
  montarLoteEnvio,
  montarConsultaLote,
  NS_ENVIO_LOTE,
  NS_CONSULTA_LOTE,
} from "../src/utils/esocial-lote.util.js";
import { grupoLoteParaEvento } from "../src/utils/esocial-grupo-lote.util.js";
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

describe("esocial-grupo-lote.util", () => {
  it("A4.1 S-2200 → grupo 2 (não periódicos)", () => {
    assert.equal(grupoLoteParaEvento("S-2200"), 2);
  });

  it("A4.2 S-1200 → grupo 3 (periódicos)", () => {
    assert.equal(grupoLoteParaEvento("S-1200"), 3);
  });

  it("S-2210 (CAT) → grupo 2 conforme manual", () => {
    assert.equal(grupoLoteParaEvento("S-2210"), 2);
  });
});

describe("esocial-lote.util", () => {
  it("A4.3 monta lote com ideEmpregador e evento embutido", () => {
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());
    const { privateKeyPem, certificatePem } = gerarPfxTeste();
    const assinado = assinarXmlEvento(xml, { privateKeyPem, certificatePem });
    const cred = { tpInsc: 1, nrInsc: "12345678000195" };

    const { xmlLote, grupo } = montarLoteEnvio({
      tipoEvento: "S-2200",
      xmlEventoAssinado: assinado,
      transmissor: cred,
    });

    assert.match(xmlLote, new RegExp(NS_ENVIO_LOTE.replace(/\//g, "\\/")));
    assert.match(xmlLote, /grupo="2"/);
    assert.equal(grupo, 2);
    assert.match(xmlLote, /<ideEmpregador>/);
    assert.match(xmlLote, /<evento Id="ID/);
    assert.match(xmlLote, /<evtAdmissao/);
  });

  it("monta consulta com protocolo", () => {
    const xml = montarConsultaLote("1.2.202608.000000012345678");
    assert.match(xml, new RegExp(NS_CONSULTA_LOTE.replace(/\//g, "\\/")));
    assert.match(xml, /<protocoloEnvio>1\.2\.202608\.000000012345678<\/protocoloEnvio>/);
  });
});
