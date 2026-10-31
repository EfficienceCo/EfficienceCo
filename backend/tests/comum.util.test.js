import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { arredondar, camposFaltando, chaveNfeDvValido, cnpjValido, cpfValido, documentoNaChaveNfe, extrairTag, sanitizarNomeArquivo, soDigitos } from "../src/utils/comum.util.js";
import { gerarXmlS2299 } from "../src/utils/esocial-xml.util.js";

describe("comum.util (UTIL-1 / #657)", () => {
  it("arredondar acerta a fronteira .xx5 (1621 * 0,075 = 121,58)", () => {
    assert.equal(arredondar(1621 * 0.075), 121.58);
    assert.equal(arredondar(1.004), 1);
  });

  it("arredondar: x.xx5 exato sobe (padrão definido pelo João; antes variava entre as 3 cópias)", () => {
    assert.equal(arredondar(10.075), 10.08);
    assert.equal(arredondar(1.005), 1.01);
  });

  it("camposFaltando acusa ausente, nulo e vazio", () => {
    assert.deepEqual(camposFaltando({ a: 1, b: "", c: null }, ["a", "b", "c", "d"]), ["b", "c", "d"]);
  });

  it("soDigitos aceita nulo e número", () => {
    assert.equal(soDigitos(null), "");
    assert.equal(soDigitos("12.345.678/0001-95"), "12345678000195");
  });

  it("extrairTag lê tag com atributo e tag vazia", () => {
    assert.equal(extrairTag('<a x="1"> ok </a>', "a"), "ok");
    assert.equal(extrairTag("<a></a>", "a"), "");
    assert.equal(extrairTag("<b>1</b>", "a"), null);
  });

  it("sanitizarNomeArquivo tira acento e símbolo", () => {
    assert.equal(sanitizarNomeArquivo("Ação Ltda/1"), "acao_ltda1");
  });

  it("eSocial recusa CPF com dígito verificador errado (antes só contava 11 dígitos)", () => {
    const dados = {
      empregador: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
      cpf: "123.456.789-00",
      matricula: "EMP0001",
      tpRegTrab: 1,
      codCateg: 101,
      desligamento: { motivo: 2, data: "2026-10-05", indPagtoAPI: false },
    };
    assert.throws(() => gerarXmlS2299(dados), /dadosDesligamento\.cpf é inválido/);
  });

  // Mesma bateria em frontend/src/lib/esocial-tabelas.js e agente/worker/tests/test_processar_nfe.py.
  it("cnpjValido: válidos, DV errado em cada posição, repetidos e tamanho", () => {
    assert.equal(cnpjValido("12345678000195"), true);
    assert.equal(cnpjValido("11222333000181"), true);
    assert.equal(cnpjValido("12345678000190"), false);
    assert.equal(cnpjValido("12345678000185"), false);
    assert.equal(cnpjValido("11111111111111"), false);
    assert.equal(cnpjValido("0000000000000"), false);
    assert.equal(cnpjValido("1234567800019"), false);
  });

  it("cpfValido: válido, DV errado e repetidos", () => {
    assert.equal(cpfValido("52998224725"), true);
    assert.equal(cpfValido("52998224724"), false);
    assert.equal(cpfValido("52998224735"), false);
    assert.equal(cpfValido("11111111111"), false);
  });

  it("chaveNfeDvValido: QA-E, DV errado, tamanho e repetidos", () => {
    assert.equal(chaveNfeDvValido("35250111222333000181559120000000011202610130"), true);
    assert.equal(chaveNfeDvValido("35260712345678000195550010000000011234567894"), true);
    assert.equal(chaveNfeDvValido("35260712345678000195550010000000011234567895"), false);
    assert.equal(chaveNfeDvValido("1".repeat(44)), false);
    assert.equal(chaveNfeDvValido("1".repeat(43)), false);
  });

  it("documentoNaChaveNfe: CNPJ cru e CPF com zfill(14)", () => {
    assert.equal(documentoNaChaveNfe("12345678000195"), "12345678000195");
    assert.equal(documentoNaChaveNfe("11144477735"), "00011144477735");
    assert.equal(documentoNaChaveNfe("123"), null);
  });
});
