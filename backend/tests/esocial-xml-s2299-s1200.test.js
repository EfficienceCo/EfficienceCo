import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gerarXmlS2299,
  gerarXmlS1200,
  gerarXmlEvento,
  eventoSuportado,
  ErroXmlESocial,
} from "../src/utils/esocial-xml.util.js";

// #648 — geradores do S-2299 (Desligamento) e S-1200 (Remuneração).
// Fixtures montadas aqui (nunca dentro do gerador), mesmo padrão do S-2200.

const EMPREGADOR = { tpInsc: 1, nrInsc: "12.345.678/0001-95" };
const GERACAO = { ambiente: "homologacao", dataHoraGeracao: new Date(Date.UTC(2026, 9, 12, 9, 0, 0)), sequencial: 1 };

function rubrica(extra = {}) {
  return { codigo: "1000", tabela: "TAB01", valor: 3500.5, indApurIR: 0, ...extra };
}

function desligamentoCLT() {
  return {
    empregador: EMPREGADOR,
    cpf: "123.456.789-09",
    matricula: "EMP0001",
    tpRegTrab: 1,
    codCateg: 101,
    desligamento: {
      motivo: 2,
      data: "2026-10-05",
      dataAvisoPrevio: "2026-10-01",
      indPagtoAPI: true,
      dataProjFimAPI: "2026-11-04",
      pensaoAlimenticia: { tipo: 0 },
      observacoes: ["Dispensa sem justa causa"],
    },
    verbasRescisorias: {
      demonstrativos: [{
        ideDmDev: "RESC-2026-10",
        estabelecimentos: [{
          tpInsc: 1,
          nrInsc: "12345678000195",
          codLotacao: "LOT01",
          grauExp: 1,
          rubricas: [rubrica(), rubrica({ codigo: "2000", valor: "1.234,56", quantidade: 30, fator: 50 })],
        }],
      }],
    },
    ...GERACAO,
  };
}

function remuneracaoMensal() {
  return {
    empregador: EMPREGADOR,
    indApuracao: 1,
    perApur: "2026-09",
    cpf: "123.456.789-09",
    demonstrativos: [{
      ideDmDev: "FOLHA-2026-09",
      codCateg: 101,
      estabelecimentos: [{
        tpInsc: 1,
        nrInsc: "12345678000195",
        codLotacao: "LOT01",
        remuneracoes: [{ matricula: "EMP0001", grauExp: 1, rubricas: [rubrica()] }],
      }],
    }],
    ...GERACAO,
  };
}

function ordemTags(xml, tags) {
  const posicoes = tags.map((t) => xml.indexOf(`<${t}>`));
  for (const [i, p] of posicoes.entries()) assert.ok(p >= 0, `tag <${tags[i]}> ausente`);
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes, `ordem esperada: ${tags.join(", ")}`);
}

function lancaCom(fn, regex) {
  assert.throws(fn, (err) => err instanceof ErroXmlESocial && regex.test(err.message));
}

describe("gerarXmlS2299 — desligamento", () => {
  it("gera envelope com namespace evtDeslig S-1.3, Id e ideVinculo", () => {
    const xml = gerarXmlS2299(desligamentoCLT());
    assert.match(xml, /xmlns="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/evtDeslig\/v_S_01_03_00"/);
    assert.match(xml, /<evtDeslig Id="ID1123456780000002026101209000000001">/);
    assert.match(xml, /<nrInsc>12345678<\/nrInsc>/);
    assert.match(xml, /<cpfTrab>12345678909<\/cpfTrab>/);
    assert.match(xml, /<matricula>EMP0001<\/matricula>/);
    assert.match(xml, /<mtvDeslig>02<\/mtvDeslig>/);
  });

  it("segue a ordem do xs:sequence de infoDeslig", () => {
    const xml = gerarXmlS2299(desligamentoCLT());
    ordemTags(xml, ["ideEvento", "ideEmpregador", "ideVinculo", "infoDeslig"]);
    ordemTags(xml, ["mtvDeslig", "dtDeslig", "dtAvPrv", "indPagtoAPI", "dtProjFimAPI", "pensAlim", "observacoes", "verbasResc"]);
    ordemTags(xml, ["codRubr", "ideTabRubr", "vrRubr", "indApurIR"]);
    ordemTags(xml, ["tpInsc", "nrInsc", "codLotacao", "detVerbas", "infoAgNocivo"]);
  });

  it("formata valores e decimais das rubricas", () => {
    const xml = gerarXmlS2299(desligamentoCLT());
    assert.match(xml, /<vrRubr>3500\.50<\/vrRubr>/);
    assert.match(xml, /<vrRubr>1234\.56<\/vrRubr>/);
    assert.match(xml, /<qtdRubr>30\.00<\/qtdRubr>/);
    assert.match(xml, /<fatorRubr>50\.00<\/fatorRubr>/);
  });

  it("é despachado por gerarXmlEvento com um argumento só (dadosFormulario)", () => {
    assert.ok(eventoSuportado("S-2299"));
    assert.match(gerarXmlEvento("S-2299", desligamentoCLT()), /<evtDeslig /);
  });

  it("exige os campos obrigatórios", () => {
    assert.throws(
      () => gerarXmlS2299({ empregador: EMPREGADOR }),
      (err) => err instanceof ErroXmlESocial
        && ["cpf", "matricula", "tpRegTrab", "desligamento.motivo", "desligamento.data", "desligamento.indPagtoAPI"]
          .every((c) => err.camposFaltando.includes(c)),
    );
  });

  it("indPagtoAPI=S exige dataProjFimAPI >= dtDeslig", () => {
    const d = desligamentoCLT();
    delete d.desligamento.dataProjFimAPI;
    lancaCom(() => gerarXmlS2299(d), /dataProjFimAPI/);
    d.desligamento.dataProjFimAPI = "2026-10-01";
    lancaCom(() => gerarXmlS2299(d), /igual ou posterior/);
  });

  it("aviso prévio posterior ao desligamento é recusado", () => {
    const d = desligamentoCLT();
    d.desligamento.dataAvisoPrevio = "2026-10-06";
    lancaCom(() => gerarXmlS2299(d), /dataAvisoPrevio/);
  });

  it("pensAlim é obrigatório para celetista e proibido para estatutário", () => {
    const clt = desligamentoCLT();
    delete clt.desligamento.pensaoAlimenticia;
    lancaCom(() => gerarXmlS2299(clt), /pensaoAlimenticia/);

    const est = desligamentoCLT();
    est.tpRegTrab = 2;
    delete est.verbasRescisorias;
    lancaCom(() => gerarXmlS2299(est), /só pode ser informada para celetista/);
    delete est.desligamento.pensaoAlimenticia;
    assert.doesNotMatch(gerarXmlS2299(est), /<pensAlim>/);
  });

  it("percentual/valor de pensão seguem o tipo", () => {
    const d = desligamentoCLT();
    d.desligamento.pensaoAlimenticia = { tipo: 3, percentual: 30 };
    lancaCom(() => gerarXmlS2299(d), /valor/);
    d.desligamento.pensaoAlimenticia = { tipo: 3, percentual: 30, valor: 800 };
    const xml = gerarXmlS2299(d);
    ordemTags(xml, ["pensAlim", "percAliment", "vrAlim"]);
    assert.match(xml, /<percAliment>30\.00<\/percAliment>/);
    d.desligamento.pensaoAlimenticia = { tipo: 0, valor: 800 };
    lancaCom(() => gerarXmlS2299(d), /só pode ser informado quando tipo=2 ou 3/);
  });

  it("sucessaoVinc obrigatório nos motivos de sucessão e proibido nos demais", () => {
    const d = desligamentoCLT();
    d.desligamento.motivo = 11;
    delete d.verbasRescisorias; // motivo 11 proíbe verbasResc
    lancaCom(() => gerarXmlS2299(d), /sucessaoVinc é obrigatório/);
    d.desligamento.sucessaoVinc = { tpInsc: 1, nrInsc: "98.765.432/0001-10" };
    assert.match(gerarXmlS2299(d), /<sucessaoVinc>/);

    const outro = desligamentoCLT();
    outro.desligamento.sucessaoVinc = { tpInsc: 1, nrInsc: "98765432000110" };
    lancaCom(() => gerarXmlS2299(outro), /sucessaoVinc não pode ser informado/);
  });

  it("transfTit (34) e mudancaCPF (36) amarrados ao motivo", () => {
    const t = desligamentoCLT();
    t.desligamento.motivo = 34;
    delete t.verbasRescisorias;
    lancaCom(() => gerarXmlS2299(t), /transfTit é obrigatório/);
    t.desligamento.transfTit = { cpfSubstituto: "98765432100", dataNascimento: "1970-01-02" };
    assert.match(gerarXmlS2299(t), /<cpfSubstituto>98765432100<\/cpfSubstituto>/);

    const m = desligamentoCLT();
    m.desligamento.motivo = 36;
    delete m.verbasRescisorias;
    m.desligamento.mudancaCPF = { novoCPF: "98765432100" };
    assert.match(gerarXmlS2299(m), /<novoCPF>98765432100<\/novoCPF>/);
    m.desligamento.motivo = 2;
    lancaCom(() => gerarXmlS2299(m), /mudancaCPF não pode ser informado/);
  });

  it("verbasResc proibido para estatutário e para motivos sem verbas", () => {
    const d = desligamentoCLT();
    d.desligamento.motivo = 25;
    lancaCom(() => gerarXmlS2299(d), /verbasRescisorias não pode ser informado para o motivo 25/);
  });

  it("indPDV só vai como S e não em motivos proibidos", () => {
    const d = desligamentoCLT();
    d.desligamento.indPDV = true;
    assert.match(gerarXmlS2299(d), /<indPDV>S<\/indPDV>/);
    d.desligamento.indPDV = false;
    assert.doesNotMatch(gerarXmlS2299(d), /<indPDV>/);
    d.desligamento.indPDV = true;
    d.desligamento.motivo = 10;
    delete d.verbasRescisorias;
    lancaCom(() => gerarXmlS2299(d), /indPDV/);
  });

  it("intermitente (111) exige infoInterm; outras categorias recusam", () => {
    const d = desligamentoCLT();
    d.codCateg = 111;
    lancaCom(() => gerarXmlS2299(d), /infoInterm/);
    d.infoInterm = [{ dia: 3, horasTrabalhadas: "0800" }];
    assert.match(gerarXmlS2299(d), /<infoInterm>\s*<dia>3<\/dia>\s*<hrsTrab>0800<\/hrsTrab>/);
    d.codCateg = 101;
    lancaCom(() => gerarXmlS2299(d), /codCateg=111/);
  });

  it("rubricas: vrRubr > 0, indApurIR obrigatório a partir de 2021-07, ideDmDev único", () => {
    const zero = desligamentoCLT();
    zero.verbasRescisorias.demonstrativos[0].estabelecimentos[0].rubricas = [rubrica({ valor: 0 })];
    lancaCom(() => gerarXmlS2299(zero), /maior que 0/);

    const semIR = desligamentoCLT();
    semIR.verbasRescisorias.demonstrativos[0].estabelecimentos[0].rubricas = [rubrica({ indApurIR: undefined })];
    lancaCom(() => gerarXmlS2299(semIR), /indApurIR/);

    const dup = desligamentoCLT();
    dup.verbasRescisorias.demonstrativos.push(structuredClone(dup.verbasRescisorias.demonstrativos[0]));
    lancaCom(() => gerarXmlS2299(dup), /repetido/);
  });

  it("grauExp obrigatório para RGPS e proibido fora dele", () => {
    const d = desligamentoCLT();
    delete d.verbasRescisorias.demonstrativos[0].estabelecimentos[0].grauExp;
    lancaCom(() => gerarXmlS2299(d), /grauExp é obrigatório/);
    d.tpRegPrev = 2;
    assert.doesNotMatch(gerarXmlS2299(d), /<infoAgNocivo>/);
  });

  it("remunAposDeslig exige indRemun após 2023-01-16 e dataFim posterior", () => {
    const d = desligamentoCLT();
    d.desligamento.remunAposDeslig = { dataFim: "2027-01-05" };
    lancaCom(() => gerarXmlS2299(d), /indRemun/);
    d.desligamento.remunAposDeslig = { indRemun: 1, dataFim: "2026-10-05" };
    lancaCom(() => gerarXmlS2299(d), /posterior/);
    d.desligamento.remunAposDeslig = { indRemun: 1, dataFim: "2027-01-05" };
    ordemTags(gerarXmlS2299(d), ["verbasResc", "remunAposDeslig", "indRemun", "dtFimRemun"]);
  });

  it("observação não pode começar com espaço (TS_texto_255)", () => {
    const d = desligamentoCLT();
    d.desligamento.observacoes = [" começa com espaço"];
    lancaCom(() => gerarXmlS2299(d), /não pode começar com espaço/);
  });

  it("motivo fora do formato da Tabela 19 é recusado", () => {
    const d = desligamentoCLT();
    d.desligamento.motivo = "123";
    lancaCom(() => gerarXmlS2299(d), /Tabela 19/);
  });
});

describe("gerarXmlS1200 — remuneração", () => {
  it("gera envelope evtRemun com ideEvento de folha", () => {
    const xml = gerarXmlS1200(remuneracaoMensal());
    assert.match(xml, /xmlns="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/evtRemun\/v_S_01_03_00"/);
    ordemTags(xml, ["indRetif", "indApuracao", "perApur", "tpAmb", "procEmi", "verProc"]);
    assert.match(xml, /<perApur>2026-09<\/perApur>/);
    ordemTags(xml, ["ideEvento", "ideEmpregador", "ideTrabalhador", "dmDev"]);
    ordemTags(xml, ["ideDmDev", "codCateg", "infoPerApur", "ideEstabLot", "codLotacao", "remunPerApur", "matricula", "itensRemun", "infoAgNocivo"]);
  });

  it("é despachado por gerarXmlEvento", () => {
    assert.ok(eventoSuportado("S-1200"));
    assert.match(gerarXmlEvento("S-1200", remuneracaoMensal()), /<evtRemun /);
  });

  it("perApur segue o indApuracao (mensal AAAA-MM / anual AAAA)", () => {
    const anual = remuneracaoMensal();
    anual.indApuracao = 2;
    lancaCom(() => gerarXmlS1200(anual), /"AAAA" quando indApuracao=2/);
    anual.perApur = "2026";
    assert.match(gerarXmlS1200(anual), /<perApur>2026<\/perApur>/);

    const mensal = remuneracaoMensal();
    mensal.perApur = "2026-13";
    lancaCom(() => gerarXmlS1200(mensal), /inexistente/);
  });

  it("indApurIR obrigatório a partir de 2021-07 e proibido antes", () => {
    const antigo = remuneracaoMensal();
    antigo.perApur = "2021-06";
    lancaCom(() => gerarXmlS1200(antigo), /só pode ser informado a partir/);
    antigo.demonstrativos[0].estabelecimentos[0].remuneracoes[0].rubricas = [rubrica({ indApurIR: undefined })];
    assert.doesNotMatch(gerarXmlS1200(antigo), /<indApurIR>/);
  });

  it("infoAgNocivo por categoria: 1XX obrigatório, 7XX proibido, 4XX opcional", () => {
    const d = remuneracaoMensal();
    delete d.demonstrativos[0].estabelecimentos[0].remuneracoes[0].grauExp;
    lancaCom(() => gerarXmlS1200(d), /grauExp é obrigatório/);
    d.demonstrativos[0].codCateg = 401;
    assert.doesNotMatch(gerarXmlS1200(d), /<infoAgNocivo>/);
    d.demonstrativos[0].codCateg = 701;
    d.demonstrativos[0].estabelecimentos[0].remuneracoes[0].grauExp = 1;
    lancaCom(() => gerarXmlS1200(d), /não pode ser informado para esta categoria/);
  });

  it("intermitente mensal exige infoInterm; demais recusam", () => {
    const d = remuneracaoMensal();
    d.demonstrativos[0].codCateg = 111;
    lancaCom(() => gerarXmlS1200(d), /infoInterm/);
    d.infoInterm = [{ dia: 10 }];
    ordemTags(gerarXmlS1200(d), ["cpfTrab", "infoInterm", "dmDev"]);
    d.demonstrativos[0].codCateg = 101;
    lancaCom(() => gerarXmlS1200(d), /codCateg=111/);
  });

  it("infoComplem e infoComplCont opcionais na ordem do XSD", () => {
    const d = remuneracaoMensal();
    d.infoComplementar = { nome: "Maria", dataNascimento: "1990-05-14" };
    d.demonstrativos[0].codCateg = 701;
    delete d.demonstrativos[0].estabelecimentos[0].remuneracoes[0].grauExp;
    delete d.demonstrativos[0].estabelecimentos[0].remuneracoes[0].matricula;
    d.demonstrativos[0].infoComplCont = { codCBO: "2522-10" };
    const xml = gerarXmlS1200(d);
    ordemTags(xml, ["cpfTrab", "infoComplem", "nmTrab", "dtNascto", "dmDev"]);
    ordemTags(xml, ["infoPerApur", "infoComplCont", "codCBO"]);
    d.infoComplementar.nome = "M";
    lancaCom(() => gerarXmlS1200(d), /de 2 a 70 caracteres/);
  });

  it("valida listas, ideDmDev único e estabelecimento", () => {
    const vazio = remuneracaoMensal();
    vazio.demonstrativos = [];
    lancaCom(() => gerarXmlS1200(vazio), /demonstrativos deve ser uma lista/);

    const dup = remuneracaoMensal();
    dup.demonstrativos.push(structuredClone(dup.demonstrativos[0]));
    lancaCom(() => gerarXmlS1200(dup), /repetido/);

    const estab = remuneracaoMensal();
    estab.demonstrativos[0].estabelecimentos[0].tpInsc = 2;
    lancaCom(() => gerarXmlS1200(estab), /tpInsc/);

    const muitas = remuneracaoMensal();
    muitas.demonstrativos[0].estabelecimentos[0].remuneracoes = Array.from({ length: 9 }, () => ({ grauExp: 1, rubricas: [rubrica()] }));
    lancaCom(() => gerarXmlS1200(muitas), /1 a 8 itens/);
  });
});
