import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { arredondar, camposFaltando, cnpjValido, cpfValido, extrairTag, sanitizarNomeArquivo, soDigitos } from "../src/utils/comum.util.js";
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
});
