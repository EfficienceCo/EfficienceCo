/**
 * Integração opt-in com Produção Restrita (#ES-8).
 *
 * Requisitos:
 *   ESOCIAL_GOV_INTEGRATION=1
 *   ESOCIAL_TEST_PFX_PATH=caminho/para/cert.pfx
 *   ESOCIAL_TEST_PFX_PASSWORD=senha
 *
 * npm run test:esocial-gov
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gerarXmlS2200 } from "../src/utils/esocial-xml.util.js";
import { transmitirEventoEsocial } from "../src/services/esocial-transmissao.service.js";
import { carregarConfigESocial } from "../src/config/esocial-ambiente.config.js";

const habilitado = process.env.ESOCIAL_GOV_INTEGRATION === "1";
const pfxPath = process.env.ESOCIAL_TEST_PFX_PATH;
const pfxSenha = process.env.ESOCIAL_TEST_PFX_PASSWORD;

function skip(msg) {
  it.skip(msg, () => {});
}

if (!habilitado) {
  describe("integration/esocial-gov (skip — ESOCIAL_GOV_INTEGRATION≠1)", () => {
    skip("defina ESOCIAL_GOV_INTEGRATION=1 para rodar contra Produção Restrita");
  });
} else if (!pfxPath || !pfxSenha) {
  describe("integration/esocial-gov (skip — certificado de teste ausente)", () => {
    skip("defina ESOCIAL_TEST_PFX_PATH e ESOCIAL_TEST_PFX_PASSWORD");
  });
} else {
  describe("integration/esocial-gov Produção Restrita", () => {
    it("G1.1 WSDL de envio acessível", async () => {
      const cfg = carregarConfigESocial(process.env);
      const res = await fetch(`${cfg.urlEnvio}?singleWsdl`);
      assert.equal(res.status, 200);
      const texto = await res.text();
      assert.match(texto, /wsdl:definitions/i);
    });

    it("G2.1 transmissão S-2200 retorna status transmitido ou rejeitado gov", async () => {
      const cfg = carregarConfigESocial(process.env);
      const buffer = fs.readFileSync(pfxPath);
      const cnpjCert = process.env.ESOCIAL_TEST_CNPJ ?? "00000000000000";

      const funcionario = {
        cpf: "529.982.247-25",
        nome: "Trabalhador Teste PR",
        sexo: "M",
        racaCor: 1,
        grauInstr: "07",
        dataNascimento: "1985-03-10",
        naturalidade: { codMunicipio: "3550308", uf: "SP" },
        endereco: {
          logradouro: "Rua Teste",
          numero: "100",
          bairro: "Centro",
          cep: "01311000",
          codMunicipio: "3550308",
          uf: "SP",
        },
      };

      const admissao = {
        empregador: { tpInsc: 1, nrInsc: cnpjCert },
        matricula: `TST${Date.now().toString().slice(-6)}`,
        codCateg: 101,
        dataAdmissao: "2026-08-01",
        tpRegTrab: 1,
        tpRegPrev: 1,
        cadIni: false,
        tpAdmissao: 1,
        tpRegJor: 1,
        natAtividade: 1,
        fgts: { dataOpcao: "2026-08-01" },
        cargo: { nome: "Analista Teste", cbo: "2522-10" },
        remuneracao: { valorSalarioFixo: 3000, unidadeSalarioFixo: 5 },
        duracao: { tpContr: 1 },
        localTrabalho: { tpInsc: 1, nrInsc: cnpjCert },
        horContratual: {
          qtdHrsSem: 44,
          tpJornada: 5,
          tmpParc: 0,
          horarioNoturno: false,
          descricaoJornada: "Comercial",
        },
        ambiente: "homologacao",
        dataHoraGeracao: new Date(),
        sequencial: Math.floor(Math.random() * 99999) + 1,
      };

      const xml = gerarXmlS2200(funcionario, admissao);
      const resultado = await transmitirEventoEsocial({
        tipoEvento: "S-2200",
        xmlEvento: xml,
        certificadoBuffer: buffer,
        senha: pfxSenha,
        config: { ...cfg, poll: { tentativas: 10, intervaloMs: 5000 } },
      });

      assert.ok(["transmitido", "rejeitado"].includes(resultado.status));
      if (resultado.status === "transmitido") {
        assert.ok(resultado.numero_recibo);
        console.log("[gov-test] nrRecibo:", resultado.numero_recibo);
      } else {
        console.log("[gov-test] rejeição:", resultado.erro_rejeicao);
      }
    });
  });
}
