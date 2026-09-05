import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gerarXmlS2200,
  gerarXmlEvento,
  eventoSuportado,
  ErroXmlESocial,
  soDigitos,
  formatarData,
  formatarCompetencia,
  formatarValor,
  sn,
  gerarIdEvento,
  exigir,
  podarVazios,
  VERSAO_LEIAUTE,
} from "../src/utils/esocial-xml.util.js";

// --- fixtures: montadas aqui, nunca dentro do gerador (regra da task) --------

function funcionarioCLT() {
  return {
    cpf: "123.456.789-09",
    nome: "Maria Aparecida de Souza",
    sexo: "F",
    racaCor: 1,
    grauInstr: "07",
    dataNascimento: "1990-05-14",
    estadoCivil: 1,
    naturalidade: { codMunicipio: "3550308", uf: "SP" },
    endereco: {
      tipoLogradouro: "Rua",
      logradouro: "das Acácias",
      numero: "120",
      bairro: "Centro",
      cep: "01311-000",
      codMunicipio: "3550308",
      uf: "SP",
    },
    contato: { telefone: "(11) 98888-7777", email: "maria@example.com" },
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
    // fgts omitido de propósito: dtAdm=2026-08-01 é posterior à
    // obrigatoriedade do FGTS (1988-10-05) — o grupo <FGTS> é PROIBIDO aqui.
    cargo: { nome: "Analista Contábil", cbo: "2522-10" },
    remuneracao: { valorSalarioFixo: 3500.5, unidadeSalarioFixo: 5 },
    duracao: { tpContr: 1 },
    localTrabalho: { tpInsc: 1, nrInsc: "12.345.678/0001-95" },
    horContratual: {
      qtdHrsSem: 44,
      tpJornada: 5,
      tmpParc: 0,
      horarioNoturno: false,
      descricaoJornada: "Segunda a sexta, 08h-18h",
    },
    ambiente: "homologacao",
    dataHoraGeracao: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
    sequencial: 1,
  };
}

function funcionarioAprendiz() {
  return {
    cpf: "98765432100",
    nome: "João Pedro Lima",
    sexo: "M",
    racaCor: 3,
    grauInstr: "05",
    dataNascimento: "2008-02-20",
    naturalidade: { codMunicipio: "3304557", uf: "RJ" },
    endereco: {
      logradouro: "Av. Brasil",
      numero: "S/N",
      cep: "20000-000",
      codMunicipio: "3304557",
      uf: "RJ",
    },
  };
}

function admissaoAprendiz() {
  return {
    empregador: { tpInsc: 1, nrInsc: "12345678000195" },
    matricula: "APR0007",
    codCateg: 103,
    dataAdmissao: "2026-08-15",
    tpRegTrab: 1,
    tpRegPrev: 1,
    cadIni: false,
    tpAdmissao: 1,
    tpRegJor: 1,
    natAtividade: 1,
    aprendiz: { indAprend: 1, cnpjEntQual: "11.111.111/0001-11", tpInsc: 1, nrInsc: "22222222000122" },
    cargo: { nome: "Aprendiz Administrativo", cbo: "4110-05" },
    remuneracao: { valorSalarioFixo: 700, unidadeSalarioFixo: 5 },
    duracao: { tpContr: 2, dataTermino: "2028-08-14", clausulaAssecuratoria: false },
    localTrabalho: { tpInsc: 1, nrInsc: "12345678000195" },
    horContratual: {
      qtdHrsSem: 20,
      tpJornada: 2,
      tmpParc: 2,
      horarioNoturno: false,
      descricaoJornada: "Meio período",
    },
    dataHoraGeracao: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
  };
}

function admissaoEstatutario() {
  return {
    empregador: { tpInsc: 1, nrInsc: "12345678000195" },
    matricula: "SERV0001",
    codCateg: 301,
    dataAdmissao: "2026-08-01",
    tpRegTrab: 2,
    tpRegPrev: 2,
    cadIni: false,
    estatutario: {
      tpProv: 1,
      dataExercicio: "2026-08-01",
      tpPlanRP: 0,
      indTetoRGPS: false,
      indAbonoPerm: false,
    },
    cargo: { nome: "Auditor Fiscal", cbo: "2544-05" },
    localTrabalho: { tpInsc: 1, nrInsc: "12345678000195" },
    dataHoraGeracao: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
  };
}

// --- helpers ---------------------------------------------------------------

describe("helpers de formatação", () => {
  it("soDigitos remove pontuação de CPF/CNPJ/CEP", () => {
    assert.equal(soDigitos("123.456.789-09"), "12345678909");
    assert.equal(soDigitos("12.345.678/0001-95"), "12345678000195");
    assert.equal(soDigitos(null), "");
  });

  it("formatarData aceita ISO, BR e Date (UTC) sem deslocar o dia", () => {
    assert.equal(formatarData("2026-08-01"), "2026-08-01");
    assert.equal(formatarData("01/08/2026"), "2026-08-01");
    assert.equal(formatarData(new Date(Date.UTC(2026, 7, 1))), "2026-08-01");
    assert.equal(formatarData(new Date("2026-08-01")), "2026-08-01");
    assert.equal(formatarData(""), "");
  });

  it("formatarData rejeita formato desconhecido, lixo no fim e data impossível", () => {
    assert.throws(() => formatarData("ago/2026"), ErroXmlESocial);
    assert.throws(() => formatarData("2026-08-01lixo"), ErroXmlESocial);
    assert.throws(() => formatarData("99/13/2026"), /calendário/);
    assert.throws(() => formatarData("2026-02-30"), /calendário/);
  });

  it("formatarCompetencia devolve AAAA-MM", () => {
    assert.equal(formatarCompetencia("2026-08"), "2026-08");
    assert.equal(formatarCompetencia("2026-08-31"), "2026-08");
  });

  it("formatarValor usa ponto decimal e 2 casas, rejeita não-número e negativo", () => {
    assert.equal(formatarValor(3500.5), "3500.50");
    assert.equal(formatarValor("1234,7"), "1234.70");
    assert.equal(formatarValor("3.500,00"), "3500.00");
    assert.equal(formatarValor("R$ 3.500,00"), "3500.00");
    assert.throws(() => formatarValor("abc"), ErroXmlESocial);
    assert.throws(() => formatarValor(-500), /negativo/);
  });

  it("formatarValor rejeita string pt-BR ambígua ('3.500') em vez de virar 3.50", () => {
    assert.throws(() => formatarValor("3.500"), /ambíguo/);
    assert.throws(() => formatarValor("1.234.567"), ErroXmlESocial);
    assert.equal(formatarValor("3500.5"), "3500.50");
  });

  it("formatarCompetencia lança ErroXmlESocial (não TypeError cru) para null/número", () => {
    assert.throws(() => formatarCompetencia(null), ErroXmlESocial);
    assert.throws(() => formatarCompetencia(202608), ErroXmlESocial);
  });

  it("sn() coage 'true'/'false'/'S'/'N'/'1'/'0' e lança em string ambígua", () => {
    assert.equal(sn(true), "S");
    assert.equal(sn(false), "N");
    assert.equal(sn("false"), "N");
    assert.equal(sn("S"), "S");
    assert.equal(sn("0"), "N");
    assert.equal(sn(undefined), "N");
    assert.throws(() => sn("talvez"), ErroXmlESocial);
  });

  it("gerarIdEvento rejeita sequencial fora de 1..99999 em vez de truncar", () => {
    const base = { tpInsc: 1, nrInsc: "12345678000195", dataHora: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)) };
    assert.throws(() => gerarIdEvento({ ...base, sequencial: 123456 }), /1 a 99999/);
    assert.throws(() => gerarIdEvento({ ...base, sequencial: 0 }), /1 a 99999/);
  });

  it("gerarIdEvento monta os 36 caracteres na regra do eSocial", () => {
    const id = gerarIdEvento({
      tpInsc: 1,
      nrInsc: "12.345.678/0001-95",
      dataHora: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
      sequencial: 1,
    });
    assert.equal(id.length, 36);
    assert.match(id, /^ID1\d{14}20260827090000\d{5}$/);
    assert.ok(id.endsWith("00001"));
    // CNPJ: raiz de 8 dígitos completada com zeros à direita até 14.
    assert.equal(id, "ID11234567800000020260827090000" + "00001");
  });

  it("gerarIdEvento com CPF (tpInsc=2) usa 11 dígitos + zeros à direita", () => {
    const id = gerarIdEvento({
      tpInsc: 2,
      nrInsc: "123.456.789-09",
      dataHora: new Date(Date.UTC(2026, 7, 27, 9, 0, 0)),
      sequencial: 3,
    });
    assert.equal(id, "ID21234567890900020260827090000" + "00003");
  });

  it("exigir junta todos os campos faltando numa exceção só", () => {
    try {
      exigir({ a: 1, b: "" }, ["a", "b", "c.d"], "teste");
      assert.fail("deveria ter lançado");
    } catch (err) {
      assert.ok(err instanceof ErroXmlESocial);
      assert.deepEqual(err.camposFaltando, ["b", "c.d"]);
    }
  });

  it("podarVazios remove chaves vazias e grupos que ficaram vazios", () => {
    const podado = podarVazios({ a: 1, b: "", c: null, d: { e: "" }, f: { g: 2 }, h: [] });
    assert.deepEqual(podado, { a: 1, f: { g: 2 } });
  });
});

// --- S-2200: CLT ---------------------------------------------------------

describe("gerarXmlS2200 — CLT (categoria 101)", () => {
  const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());

  it("tem declaração XML e envelope eSocial com namespace da versão S-1.3", () => {
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(
      xml,
      /<eSocial xmlns="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/evtAdmissao\/v_S_01_03_00">/,
    );
    assert.ok(VERSAO_LEIAUTE === "S_01_03_00");
  });

  it("evtAdmissao tem Id de 36 caracteres começando com ID + tpInsc", () => {
    const m = xml.match(/<evtAdmissao Id="([^"]+)">/);
    assert.ok(m, "Id ausente");
    assert.equal(m[1].length, 36);
    assert.match(m[1], /^ID1/);
  });

  it("ideEvento usa produção restrita (tpAmb=2) e procEmi=1", () => {
    assert.match(xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(xml, /<procEmi>1<\/procEmi>/);
    assert.match(xml, /<verProc>EfficienceCo-1\.0<\/verProc>/);
  });

  it("ideEmpregador usa a raiz de 8 dígitos do CNPJ", () => {
    assert.match(xml, /<ideEmpregador>\s*<tpInsc>1<\/tpInsc>\s*<nrInsc>12345678<\/nrInsc>\s*<\/ideEmpregador>/);
  });

  it("trabalhador traz CPF sem pontuação e dados pessoais", () => {
    assert.match(xml, /<cpfTrab>12345678909<\/cpfTrab>/);
    assert.match(xml, /<nmTrab>Maria Aparecida de Souza<\/nmTrab>/);
    assert.match(xml, /<sexo>F<\/sexo>/);
    assert.match(xml, /<dtNascto>1990-05-14<\/dtNascto>/);
    assert.match(xml, /<paisNascto>105<\/paisNascto>/);
  });

  it("endereço vai dentro de brasil com CEP e município só dígitos", () => {
    assert.match(xml, /<endereco>\s*<brasil>/);
    assert.match(xml, /<cep>01311000<\/cep>/);
    assert.match(xml, /<codMunic>3550308<\/codMunic>/);
    assert.match(xml, /<uf>SP<\/uf>/);
  });

  it("usa infoCeletista (não infoEstatutario) e não traz FGTS (admissão moderna)", () => {
    assert.match(xml, /<infoRegimeTrab>\s*<infoCeletista>/);
    assert.doesNotMatch(xml, /infoEstatutario/);
    assert.match(xml, /<dtAdm>2026-08-01<\/dtAdm>/);
    // dtAdm 2026-08-01 é posterior a 1988-10-05: o grupo FGTS é proibido pelo XSD.
    assert.doesNotMatch(xml, /<FGTS>/);
  });

  it("infoContrato traz codCateg, CBO sem pontuação e remuneração com 2 casas", () => {
    assert.match(xml, /<codCateg>101<\/codCateg>/);
    assert.match(xml, /<CBOCargo>252210<\/CBOCargo>/);
    assert.match(xml, /<vrSalFx>3500\.50<\/vrSalFx>/);
    assert.match(xml, /<horNoturno>N<\/horNoturno>/);
  });

  it("não emite grupos opcionais ausentes (sem dependente, sem afastamento)", () => {
    assert.doesNotMatch(xml, /<dependente>/);
    assert.doesNotMatch(xml, /<afastamento>/);
    assert.doesNotMatch(xml, /<desligamento>/);
    assert.doesNotMatch(xml, /<aprend>/);
  });

  it("ordem das tags de topo segue o xs:sequence do XSD", () => {
    const ordem = ["ideEvento", "ideEmpregador", "trabalhador", "vinculo"].map((t) => xml.indexOf(`<${t}>`));
    assert.deepEqual([...ordem].sort((a, b) => a - b), ordem);
    const vinc = ["matricula", "tpRegTrab", "tpRegPrev", "cadIni", "infoRegimeTrab", "infoContrato"].map(
      (t) => xml.indexOf(`<${t}>`),
    );
    assert.deepEqual([...vinc].sort((a, b) => a - b), vinc);
  });
});

// --- S-2200: aprendiz --------------------------------------------------

describe("gerarXmlS2200 — aprendiz (categoria 103, 2ª categoria trabalhista)", () => {
  const xml = gerarXmlS2200(funcionarioAprendiz(), admissaoAprendiz());

  it("gera o grupo aprend com indAprend e entidade qualificadora", () => {
    assert.match(xml, /<aprend>/);
    assert.match(xml, /<indAprend>1<\/indAprend>/);
    assert.match(xml, /<cnpjEntQual>11111111000111<\/cnpjEntQual>/);
  });

  it("contrato por prazo determinado traz dtTerm", () => {
    assert.match(xml, /<codCateg>103<\/codCateg>/);
    assert.match(xml, /<tpContr>2<\/tpContr>/);
    assert.match(xml, /<dtTerm>2028-08-14<\/dtTerm>/);
  });

  it("continua celetista; endereço presente, contato ausente (não informado)", () => {
    assert.match(xml, /<infoCeletista>/);
    assert.match(xml, /<endereco>\s*<brasil>/);
    assert.match(xml, /<nrLograd>S\/N<\/nrLograd>/);
    assert.doesNotMatch(xml, /<contato>/);
  });

  it("difere do XML de CLT (categorias produzem schemas diferentes)", () => {
    const xmlCLT = gerarXmlS2200(funcionarioCLT(), admissaoCLT());
    assert.notEqual(xml, xmlCLT);
  });
});

// --- S-2200: estatutário --------------------------------------------

describe("gerarXmlS2200 — estatutário (categoria 301)", () => {
  const xml = gerarXmlS2200(funcionarioCLT(), admissaoEstatutario());

  it("usa infoEstatutario em vez de infoCeletista", () => {
    assert.match(xml, /<infoRegimeTrab>\s*<infoEstatutario>/);
    assert.doesNotMatch(xml, /infoCeletista/);
    assert.match(xml, /<tpProv>1<\/tpProv>/);
    assert.match(xml, /<dtExercicio>2026-08-01<\/dtExercicio>/);
  });

  it("tpRegPrev=2 (RPPS): emite os campos estatutários obrigatórios", () => {
    assert.match(xml, /<tpPlanRP>0<\/tpPlanRP>/);
    assert.match(xml, /<indTetoRGPS>N<\/indTetoRGPS>/);
    assert.match(xml, /<indAbonoPerm>N<\/indAbonoPerm>/);
  });

  it("tpRegPrev=1 (RGPS): rejeita campos exclusivos do RPPS", () => {
    const semTeto = { ...admissaoEstatutario(), tpRegPrev: 1, estatutario: { tpProv: 1, dataExercicio: "2026-08-01" } };
    assert.doesNotThrow(() => gerarXmlS2200(funcionarioCLT(), semTeto));
    const comTeto = { ...semTeto, estatutario: { ...semTeto.estatutario, indTetoRGPS: true } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), comTeto), /RPPS/);
  });
});

// --- validação de entrada ------------------------------------------

describe("gerarXmlS2200 — validação de entrada", () => {
  it("exige funcionario e dadosAdmissao", () => {
    assert.throws(() => gerarXmlS2200(null, {}), ErroXmlESocial);
    assert.throws(() => gerarXmlS2200({}, null), ErroXmlESocial);
  });

  it("acumula campos obrigatórios faltando do funcionário", () => {
    try {
      gerarXmlS2200({ cpf: "1" }, admissaoCLT());
      assert.fail("deveria ter lançado");
    } catch (err) {
      assert.ok(err instanceof ErroXmlESocial);
      assert.ok(err.camposFaltando.includes("nome"));
      assert.ok(err.camposFaltando.includes("dataNascimento"));
    }
  });

  it("rejeita codCateg fora da lista válida do S-2200 (ex.: 999)", () => {
    const dados = { ...admissaoCLT(), codCateg: 999 };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /codCateg 999 não é válido/);
  });

  it("celetista sem tpRegJor/natAtividade falha com mensagem de contexto", () => {
    const dados = admissaoCLT();
    delete dados.tpRegJor;
    delete dados.natAtividade;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /celetista/);
  });

  it("exige cadIni (não deixa cair no default 'N' silencioso)", () => {
    const dados = admissaoCLT();
    delete dados.cadIni;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /cadIni/);
  });

  it("infoContrato sem grupos obrigatórios do XSD falha (não gera XML incompleto)", () => {
    const dados = admissaoCLT();
    delete dados.remuneracao;
    delete dados.localTrabalho;
    try {
      gerarXmlS2200(funcionarioCLT(), dados);
      assert.fail("deveria ter lançado");
    } catch (err) {
      assert.ok(err instanceof ErroXmlESocial);
      assert.ok(err.camposFaltando.includes("remuneracao"));
      assert.ok(err.camposFaltando.includes("localTrabalho"));
    }
  });

  it("categoria estatutária (301) com tpRegTrab=1 é rejeitada como inconsistente", () => {
    const dados = { ...admissaoEstatutario(), tpRegTrab: 1 };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /estatutária mas tpRegTrab/);
  });

  it("tpRegTrab=2 com categoria celetista (101) é rejeitado", () => {
    const dados = { ...admissaoCLT(), tpRegTrab: 2 };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /não é estatutária/);
  });

  it("estadoCivil = null não vira <estCiv>0</estCiv> (fica de fora do XML)", () => {
    const f = { ...funcionarioCLT(), estadoCivil: null };
    const xml = gerarXmlS2200(f, admissaoCLT());
    assert.doesNotMatch(xml, /<estCiv>/);
  });

  it("afastamento sem dataInicio falha (não gera grupo incompleto)", () => {
    const dados = { ...admissaoCLT(), afastamento: { codMotivo: 15 } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /afastamento/);
  });

  it("desligamento sem data falha", () => {
    const dados = { ...admissaoCLT(), desligamento: { motivo: 2 } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /desligamento/);
  });

  it("afastamento completo é emitido dentro de vinculo", () => {
    const dados = { ...admissaoCLT(), afastamento: { dataInicio: "2026-09-01", codMotivo: 15 } };
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.match(xml, /<afastamento>\s*<dtIniAfast>2026-09-01<\/dtIniAfast>\s*<codMotAfast>15<\/codMotAfast>\s*<\/afastamento>/);
  });

  it("funcionário sem endereço falha (endereco é obrigatório no S-2200)", () => {
    const f = { ...funcionarioCLT() };
    delete f.endereco;
    assert.throws(() => gerarXmlS2200(f, admissaoCLT()), ErroXmlESocial);
  });

  it("dependente sem depIRRF/depSF/incTrab falha (sem default 'N' silencioso)", () => {
    const f = { ...funcionarioCLT(), dependentes: [{ tipo: "03", nome: "Filho", dataNascimento: "2020-01-01" }] };
    assert.throws(() => gerarXmlS2200(f, admissaoCLT()), /dependentes/);
  });

  it("verProc acima de 20 caracteres é rejeitado", () => {
    const dados = { ...admissaoCLT(), verProc: "EfficienceCo-eSocial-versao-longa-1.0" };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /verProc/);
  });

  it("salário fixo igual a zero é rejeitado", () => {
    const dados = { ...admissaoCLT(), remuneracao: { valorSalarioFixo: 0, unidadeSalarioFixo: 5 } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /maior que zero/);
  });

  it("estatutário não exige horContratual", () => {
    const dados = admissaoEstatutario();
    delete dados.horContratual;
    assert.doesNotThrow(() => gerarXmlS2200(funcionarioCLT(), dados));
  });

  it("nascimento não emite codMunic/uf (não existem em T_nascimento no XSD S-1.3)", () => {
    const xml = gerarXmlS2200(funcionarioCLT(), admissaoCLT());
    const nascimento = xml.match(/<nascimento>[\s\S]*?<\/nascimento>/)[0];
    assert.doesNotMatch(nascimento, /<codMunic>/);
    assert.doesNotMatch(nascimento, /<uf>/);
  });

  it("cargo sem CBO falha (CBOCargo obrigatório com nmCargo)", () => {
    const dados = { ...admissaoCLT(), cargo: { nome: "Analista" } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /cargo/);
  });

  it("horContratual sem horarioNoturno falha (não cai no 'N' silencioso)", () => {
    const dados = admissaoCLT();
    dados.horContratual = { ...dados.horContratual };
    delete dados.horContratual.horarioNoturno;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /horContratual/);
  });
});

// --- regras condicionais do leiaute S-1.3 ------------------------------

describe("gerarXmlS2200 - regra do grupo FGTS (CONDICAO_GRUPO do XSD)", () => {
  it("rejeita fgts informado em admissão moderna (dtAdm >= 1988-10-05)", () => {
    const dados = { ...admissaoCLT(), fgts: { dataOpcao: "2026-08-01" } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /fgts não pode ser informado/);
  });

  it("rejeita fgts informado com tpAdmissao=6 (mudança de CPF), mesmo com dtAdm antiga", () => {
    const dados = { ...admissaoCLT(), tpAdmissao: 6, dataAdmissao: "1980-01-01", fgts: { dataOpcao: "1980-01-01" } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /fgts não pode ser informado/);
  });

  it("exige fgts para admissão anterior a 1988-10-05 (regime de opção)", () => {
    const dados = { ...admissaoCLT(), dataAdmissao: "1985-01-01" };
    delete dados.fgts;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /fgts\.dataOpcao é obrigatório/);
  });

  it("aceita e emite fgts para admissão anterior a 1988-10-05", () => {
    const dados = { ...admissaoCLT(), dataAdmissao: "1985-01-01", fgts: { dataOpcao: "1985-01-01" } };
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.match(xml, /<FGTS>\s*<dtOpcFGTS>1985-01-01<\/dtOpcFGTS>\s*<\/FGTS>/);
  });

  it("doméstico (codCateg 104): limiar de obrigatoriedade é 2015-10-01, não 1988-10-05", () => {
    const domestico = () => ({
      ...admissaoCLT(),
      codCateg: 104,
      empregador: { tpInsc: 2, nrInsc: "12345678909" },
      localTrabalho: { endereco: funcionarioCLT().endereco },
      dataAdmissao: "2010-01-01",
    });
    // Antes de 2015-10-01: fgts ainda obrigatório para doméstico.
    const semFgts = domestico();
    delete semFgts.fgts;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), semFgts), /fgts\.dataOpcao é obrigatório/);
    // Depois de 2015-10-01: fgts vira proibido.
    const posLC150 = { ...domestico(), dataAdmissao: "2016-01-01", fgts: { dataOpcao: "2016-01-01" } };
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), posLC150), /fgts não pode ser informado/);
  });
});

describe("gerarXmlS2200 - regras condicionais", () => {
  it("aceita estatutario sem remuneracao e sem duracao", () => {
    const dados = admissaoEstatutario();
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.doesNotMatch(xml, /<remuneracao>/);
    assert.doesNotMatch(xml, /<duracao>/);
  });

  it("nao exige horContratual para celetista fora do regime de horario", () => {
    const dados = admissaoCLT();
    dados.tpRegJor = 2;
    delete dados.horContratual;
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.doesNotMatch(xml, /<horContratual>/);
  });

  it("rejeita tpJornada fora do dominio", () => {
    const dados = admissaoCLT();
    dados.horContratual.tpJornada = 1;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), dados), /tpJornada/);
  });

  it("rejeita tmpParc fora do dominio e combinacoes invalidas", () => {
    const invalido = admissaoCLT();
    invalido.horContratual.tmpParc = 4;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), invalido), /tmpParc/);

    const categoria104 = admissaoCLT();
    categoria104.codCateg = 104;
    categoria104.empregador = { tpInsc: 2, nrInsc: "12345678909" };
    categoria104.localTrabalho = { endereco: funcionarioCLT().endereco };
    categoria104.horContratual.tmpParc = 2;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), categoria104), /tmpParc=2 ou 3/);
  });

  it("rejeita qtdHrsSem ausente ou invalida quando a categoria exige jornada", () => {
    const ausente = admissaoCLT();
    delete ausente.horContratual.qtdHrsSem;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), ausente), /qtdHrsSem/);

    const invalido = admissaoCLT();
    invalido.horContratual.qtdHrsSem = 0;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), invalido), /qtdHrsSem/);
  });

  it("gera localTempDom para categoria 104 sem localTrabGeral", () => {
    const dados = admissaoCLT();
    dados.codCateg = 104;
    dados.empregador = { tpInsc: 2, nrInsc: "12345678909" };
    dados.localTrabalho = { endereco: funcionarioCLT().endereco };
    dados.horContratual.tmpParc = 1;
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.match(xml, /<localTempDom>/);
    assert.doesNotMatch(xml, /<localTrabGeral>/);
    assert.match(xml, /<dscLograd>das Ac/);
  });

  it("gera trabalho temporario e localTempDom para categoria 106", () => {
    const dados = admissaoCLT();
    dados.codCateg = 106;
    dados.localTrabalho = {
      tpInsc: 1,
      nrInsc: "12345678000195",
      endereco: funcionarioCLT().endereco,
    };
    dados.trabalhadorTemporario = {
      hipoteseLegal: 2,
      justificativa: "Aumento excepcional de demanda",
      estabelecimentoVinculo: { tpInsc: 1, nrInsc: "22345678000195" },
    };
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.match(xml, /<trabTemporario>/);
    assert.match(xml, /<ideEstabVinc>/);
    assert.match(xml, /<localTrabGeral>/);
    assert.match(xml, /<localTempDom>/);
  });

  it("categoria 111 permite omitir qtdHrsSem e horNoturno", () => {
    const dados = admissaoCLT();
    dados.codCateg = 111;
    delete dados.horContratual.qtdHrsSem;
    delete dados.horContratual.horarioNoturno;
    const xml = gerarXmlS2200(funcionarioCLT(), dados);
    assert.match(xml, /<horContratual>/);
    assert.doesNotMatch(xml, /<qtdHrsSem>/);
    assert.doesNotMatch(xml, /<horNoturno>/);
  });

  it("rejeita tpInsc invalido no empregador, local e aprendizagem", () => {
    const empregador = admissaoCLT();
    empregador.empregador.tpInsc = 3;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), empregador), /empregador.tpInsc/);

    const local = admissaoCLT();
    local.localTrabalho.tpInsc = 2;
    assert.throws(() => gerarXmlS2200(funcionarioCLT(), local), /localTrabalho.tpInsc/);

    const aprendiz = admissaoAprendiz();
    aprendiz.aprendiz.tpInsc = 3;
    assert.throws(() => gerarXmlS2200(funcionarioAprendiz(), aprendiz), /aprendiz.tpInsc/);
  });
});

// --- dispatcher / registro -------------------------------------------

describe("gerarXmlEvento — dispatcher para ES-7", () => {
  it("S-2200 está suportado e delega para gerarXmlS2200", () => {
    assert.ok(eventoSuportado("S-2200"));
    const xml = gerarXmlEvento("S-2200", funcionarioCLT(), admissaoCLT());
    assert.match(xml, /<evtAdmissao /);
  });

  it("evento do catálogo ainda sem gerador lança erro claro (não é erro do usuário)", () => {
    assert.ok(!eventoSuportado("S-2299"));
    assert.throws(() => gerarXmlEvento("S-2299", {}, {}), /ainda não tem gerador/);
  });

  it("código fora do catálogo lança 'desconhecido'", () => {
    assert.throws(() => gerarXmlEvento("S-9999", {}, {}), /desconhecido/);
  });
});
