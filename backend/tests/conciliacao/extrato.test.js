// TEST-9 (#686): upload do OFX, extrato atual do período e transações do extrato, com requisição
// HTTP, token de usuário e banco descartável reais (nada de banco falso).
//
// Origem dos números esperados: o OFX é escrito aqui e a conta é feita à mão a partir dele
// (valor sempre em módulo, sinal do TRNAMT vira débito/crédito, CONTA = 4 últimos dígitos do
// ACCTID, período = mês da maioria das transações). A massa #680 vem de massa-680-dominio.js:
// sessão aberta de 21 transações (data 2026-10-(i+1), valor (i+1)*10, crédito se i é par).
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, atoresDe, buscarLinha, buscarLinhas, criarExtratoProcessado,
  montarOfx, OFX_NOVEMBRO, formularioOfx, hashDoArquivo, provarOutroEscritorio404, conhecido,
  UUID_INEXISTENTE, PERFIL, paraEpoch,
} from "../helpers/conciliacao-http.js";

describe("TEST-9: POST /conciliacoes/extrato (upload do OFX)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const enviar = (a, conteudo, opcoes) => chamar(api, a, { metodo: "POST", caminho: "/conciliacoes/extrato", formulario: formularioOfx(conteudo, opcoes) });

  describe("caminho feliz: 201 e o banco conferido depois", () => {
    for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO, PERFIL.EFFICIENCE]) {
      it(`${perfil}: grava extrato processado e as 2 transações do OFX`, async () => {
        const conteudo = montarOfx(OFX_NOVEMBRO);
        const quem = ator(A, perfil);
        const antesDoB = await fotografar(banco, B.cliente.id);
        const antesDoA = await fotografar(banco, A.cliente.id);

        const resposta = await enviar(quem, conteudo, { nome: "novembro.ofx" });

        assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
        // BANKID 0341; ACCTID 1234567890 -> conta guarda os 4 últimos dígitos (7890); 2 de 2 em 11/2026.
        assert.deepEqual(
          { ...resposta.corpo, extrato_id: undefined },
          {
            extrato_id: undefined,
            total_transacoes: 2,
            banco: "0341",
            conta: "7890",
            mes: 11,
            ano: 2026,
            ignoradas: { ja_importadas: 0, valor_zero: 0 },
          },
        );
        const extrato = await buscarLinha(banco, "extratos_bancarios", resposta.corpo.extrato_id);
        assert.equal(extrato.cliente_id, A.cliente.id);
        assert.equal(extrato.status, "processado");
        assert.equal(extrato.banco, "0341");
        assert.equal(extrato.conta, "7890");
        assert.equal(extrato.mes, 11);
        assert.equal(extrato.ano, 2026);
        assert.equal(extrato.arquivo_nome, "novembro.ofx");
        assert.equal(extrato.arquivo_hash, hashDoArquivo(conteudo));
        assert.ok(extrato.processado_em, "processado_em preenchido");

        const transacoes = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: extrato.id });
        const porFitid = Object.fromEntries(transacoes.map(t => [t.id_banco, t]));
        assert.equal(transacoes.length, 2);
        assert.deepEqual(
          { data: porFitid["NOV-1"].data_lancamento, valor: Number(porFitid["NOV-1"].valor), tipo: porFitid["NOV-1"].tipo, descricao: porFitid["NOV-1"].descricao, conciliado: porFitid["NOV-1"].conciliado, cliente_id: porFitid["NOV-1"].cliente_id },
          { data: "2026-11-05", valor: 150, tipo: "debito", descricao: "PAGAMENTO BOLETO", conciliado: false, cliente_id: A.cliente.id },
        );
        assert.deepEqual(
          { data: porFitid["NOV-2"].data_lancamento, valor: Number(porFitid["NOV-2"].valor), tipo: porFitid["NOV-2"].tipo, descricao: porFitid["NOV-2"].descricao, conciliado: porFitid["NOV-2"].conciliado, cliente_id: porFitid["NOV-2"].cliente_id },
          { data: "2026-11-10", valor: 1500, tipo: "credito", descricao: "DEPOSITO", conciliado: false, cliente_id: A.cliente.id },
        );

        // O que já existia no A continua igual (só ganhou o extrato e as 2 transações) e o B nem foi tocado.
        const depoisDoA = await fotografar(banco, A.cliente.id);
        assert.equal(depoisDoA.extratos_bancarios.length, antesDoA.extratos_bancarios.length + 1);
        assert.equal(depoisDoA.transacoes_extrato.length, antesDoA.transacoes_extrato.length + 2);
        assert.deepEqual(depoisDoA.conciliacoes, antesDoA.conciliacoes);
        assert.deepEqual(depoisDoA.pares_conciliacao, antesDoA.pares_conciliacao);
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
      });
    }

    it("arquivo que cobre dois meses: vale o mês da maioria (3 de novembro x 1 de dezembro = 11/2026)", async () => {
      const conteudo = montarOfx({ transacoes: [
        { data: "20261102", valor: "-10.00", fitid: "M1" }, { data: "20261103", valor: "-20.00", fitid: "M2" },
        { data: "20261104", valor: "30.00", fitid: "M3" }, { data: "20261201", valor: "40.00", fitid: "M4" },
      ] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo);
      assert.equal(resposta.status, 201);
      assert.equal(resposta.corpo.mes, 11);
      assert.equal(resposta.corpo.ano, 2026);
      assert.equal(resposta.corpo.total_transacoes, 4, "as 4 transações são gravadas, inclusive a de dezembro");
    });

    it("mes/ano informados e iguais ao do arquivo: 201", async () => {
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), montarOfx(OFX_NOVEMBRO), { campos: { mes: " 11", ano: "2026" } });
      assert.equal(resposta.status, 201);
      assert.deepEqual([resposta.corpo.mes, resposta.corpo.ano], [11, 2026]);
    });

    it("acento no MEMO de um OFX Windows-1252 chega inteiro ao banco", async () => {
      const conteudo = montarOfx({ transacoes: [{ data: "20261105", valor: "-10.00", fitid: "AC1", memo: "AÇÃO JURÍDICA" }] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo);
      assert.equal(resposta.status, 201);
      const [transacao] = await buscarLinhas(banco, "transacoes_extrato", { extrato_id: resposta.corpo.extrato_id });
      assert.equal(transacao.descricao, "AÇÃO JURÍDICA");
    });
  });

  describe("reenvio do mesmo arquivo: 409 e nada duplica", () => {
    it("mesmo conteúdo, mesmo nome e depois outro nome: 409 nas duas vezes", async () => {
      const conteudo = montarOfx(OFX_NOVEMBRO);
      const quem = ator(A, PERFIL.CLIENTE);
      const primeira = await enviar(quem, conteudo, { nome: "novembro.ofx" });
      assert.equal(primeira.status, 201);
      const depoisDaPrimeira = await fotografar(banco);

      for (const nome of ["novembro.ofx", "outro-nome.ofx"]) {
        const repetida = await enviar(quem, conteudo, { nome });
        assert.equal(repetida.status, 409, nome);
        assert.deepEqual(repetida.corpo, { erro: "Este arquivo OFX já foi importado para este cliente" });
        assert.deepEqual(await fotografar(banco), depoisDaPrimeira, `${nome}: nenhum extrato ou transação a mais`);
      }
    });

    it("o arquivo que o escritório B já importou NÃO conflita com o do A: cada um grava o seu", async () => {
      const conteudo = montarOfx(OFX_NOVEMBRO);
      const doB = await enviar(ator(B, PERFIL.CLIENTE), conteudo);
      assert.equal(doB.status, 201);
      const depoisDoB = await fotografar(banco, B.cliente.id);

      const doA = await enviar(ator(A, PERFIL.CLIENTE), conteudo);
      assert.equal(doA.status, 201, "o hash é por cliente: 409 aqui seria vazar que o B tem o arquivo");
      assert.notEqual(doA.corpo.extrato_id, doB.corpo.extrato_id);
      assert.equal((await buscarLinha(banco, "extratos_bancarios", doA.corpo.extrato_id)).cliente_id, A.cliente.id);
      assert.deepEqual(await fotografar(banco, B.cliente.id), depoisDoB);
    });
  });

  describe("outro escritório: nada é gravado fora do escritório do token", () => {
    it("admin_cliente e funcionario do A mandando cliente_id do B no formulário gravam no A; B não muda", async () => {
      for (const perfil of [PERFIL.CLIENTE, PERFIL.FUNCIONARIO]) {
        await bateria.recriar().then(r => { banco = r.banco; A = r.A; B = r.B; });
        const antesDoB = await fotografar(banco, B.cliente.id);
        const resposta = await api.requisitar("/conciliacoes/extrato", {
          usuario: A.usuario(perfil), metodo: "POST",
          formulario: formularioOfx(montarOfx(OFX_NOVEMBRO), { campos: { cliente_id: B.cliente.id, clienteId: B.cliente.id } }),
        });
        assert.equal(resposta.status, 201, perfil);
        assert.equal((await buscarLinha(banco, "extratos_bancarios", resposta.corpo.extrato_id)).cliente_id, A.cliente.id, perfil);
        assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB, perfil);
      }
    });

    it("admin_efficience escolhe o escritório por cliente_id: o extrato vai para o escolhido e o outro não muda", async () => {
      const antesDoB = await fotografar(banco, B.cliente.id);
      const resposta = await enviar(ator(A, PERFIL.EFFICIENCE), montarOfx(OFX_NOVEMBRO));
      assert.equal(resposta.status, 201);
      assert.equal((await buscarLinha(banco, "extratos_bancarios", resposta.corpo.extrato_id)).cliente_id, A.cliente.id);
      assert.deepEqual(await fotografar(banco, B.cliente.id), antesDoB);
    });
  });

  describe("entrada inválida: 400 e nenhum extrato novo fica no banco", () => {
    it("sem arquivo: 400 'Arquivo OFX é obrigatório'", async () => {
      const antes = await fotografar(banco);
      const resposta = await api.requisitar("/conciliacoes/extrato", { usuario: A.usuario(PERFIL.CLIENTE), metodo: "POST", formulario: new FormData() });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "Arquivo OFX é obrigatório (campo 'arquivo')" });
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("arquivo que não é .ofx: 400 'Tipo de arquivo não permitido'", async () => {
      const antes = await fotografar(banco);
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), montarOfx(OFX_NOVEMBRO), { nome: "extrato.txt" });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "Tipo de arquivo não permitido. Envie um arquivo .ofx." });
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
      const antes = await fotografar(banco);
      const resposta = await api.requisitar("/conciliacoes/extrato", {
        usuario: A.usuario(PERFIL.EFFICIENCE), metodo: "POST", formulario: formularioOfx(montarOfx(OFX_NOVEMBRO)),
      });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
      assert.deepEqual(await fotografar(banco), antes);
    });

    // Faixa do código: mês 1..12, ano 2020..9999 (decisão de 2026-10-30, #693).
    const FAIXAS = [
      ["mes=13", { mes: 13, ano: 2026 }, "mes", "mes deve ser um inteiro entre 1 e 12"],
      ["mes=0", { mes: 0, ano: 2026 }, "mes", "mes deve ser um inteiro entre 1 e 12"],
      ["mes=abc", { mes: "abc", ano: 2026 }, "mes", "mes deve ser um inteiro entre 1 e 12"],
      ["ano=1800", { mes: 11, ano: 1800 }, "ano", "ano deve ser um inteiro entre 2020 e 9999"],
      ["ano=2019", { mes: 11, ano: 2019 }, "ano", "ano deve ser um inteiro entre 2020 e 9999"],
      ["ano=10000", { mes: 11, ano: 10000 }, "ano", "ano deve ser um inteiro entre 2020 e 9999"],
      ["só o ano", { ano: 2026 }, "mes", "mes é obrigatório quando ano é informado"],
      ["só o mês", { mes: 11 }, "ano", "ano é obrigatório quando mes é informado"],
    ];
    for (const [nome, campos, campo, mensagem] of FAIXAS) {
      it(`${nome}: 400 com a mensagem no campo ${campo}, sem gravar extrato`, async () => {
        const antes = await fotografar(banco);
        const resposta = await enviar(ator(A, PERFIL.CLIENTE), montarOfx(OFX_NOVEMBRO), { campos });
        assert.equal(resposta.status, 400);
        assert.equal(resposta.corpo.campos[campo], mensagem);
        assert.match(resposta.corpo.erro, new RegExp(mensagem));
        assert.deepEqual(await fotografar(banco), antes);
      });
    }

    it("período informado que não é o das datas (abril para um OFX de novembro): 400 por campo e o extrato fica em erro, sem transações e sem travar o arquivo", async () => {
      const conteudo = montarOfx(OFX_NOVEMBRO);
      const antes = await fotografar(banco, A.cliente.id);
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "recusado.ofx", campos: { mes: 4, ano: 2026 } });
      assert.equal(resposta.status, 400);
      assert.match(resposta.corpo.erro, /mes\/ano informados não correspondem às datas do extrato \(período do arquivo: 11\/2026\)/);
      assert.deepEqual(Object.keys(resposta.corpo.campos).sort(), ["ano", "mes"]);

      const novos = (await buscarLinhas(banco, "extratos_bancarios", { cliente_id: A.cliente.id, arquivo_nome: "recusado.ofx" }));
      assert.equal(novos.length, 1);
      assert.equal(novos[0].status, "erro");
      assert.equal(novos[0].arquivo_hash, null, "hash zerado: o contador pode reenviar com o período certo");
      assert.deepEqual(await buscarLinhas(banco, "transacoes_extrato", { extrato_id: novos[0].id }), []);
      const depois = await fotografar(banco, A.cliente.id);
      assert.deepEqual(depois.transacoes_extrato, antes.transacoes_extrato);

      const reenvio = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "recusado.ofx", campos: { mes: 11, ano: 2026 } });
      assert.equal(reenvio.status, 201, "reenviar com o período certo funciona");
    });
  });

  describe("período informado em arquivos que cobrem mais de um mês", () => {
    const transacoesDe = (mes, quantidade, prefixo) => Array.from({ length: quantidade }, (_, i) => (
      { data: `2026${mes}10`, valor: "-10.00", fitid: `${prefixo}${i}` }
    ));

    it("trimestre com janeiro (4), fevereiro (3) e março (2): pedir março é recusado nomeando os meses, e o extrato fica em erro", async () => {
      const conteudo = montarOfx({ transacoes: [...transacoesDe("01", 4, "J"), ...transacoesDe("02", 3, "F"), ...transacoesDe("03", 2, "M")] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "trimestre.ofx", campos: { mes: 3, ano: 2026 } });
      assert.equal(resposta.status, 400);
      assert.match(resposta.corpo.erro, /1\/2026, o mês com mais transações/);
      assert.match(resposta.corpo.erro, /o arquivo cobre mais de um mês: 1\/2026 \(4\), 2\/2026 \(3\), 3\/2026 \(2\)/);
      const [extrato] = await buscarLinhas(banco, "extratos_bancarios", { cliente_id: A.cliente.id, arquivo_nome: "trimestre.ofx" });
      assert.deepEqual([extrato.status, extrato.arquivo_hash], ["erro", null]);
    });

    it("empate entre janeiro (2) e fevereiro (2): vale o primeiro mês do arquivo e o outro é recusado dizendo isso", async () => {
      const conteudo = montarOfx({ transacoes: [...transacoesDe("01", 2, "J"), ...transacoesDe("02", 2, "F")] });
      const recusado = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "empate.ofx", campos: { mes: 2, ano: 2026 } });
      assert.equal(recusado.status, 400);
      assert.match(recusado.corpo.erro, /1\/2026, o primeiro mês do arquivo entre os que empatam/);
      assert.match(recusado.corpo.erro, /o arquivo cobre mais de um mês: 1\/2026 \(2\), 2\/2026 \(2\)/);
      const aceito = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "empate.ofx", campos: { mes: 1, ano: 2026 } });
      assert.equal(aceito.status, 201);
      assert.equal(aceito.corpo.mes, 1);
    });

    it("ano 2020 (o piso da faixa) é aceito quando o arquivo é desse ano", async () => {
      const conteudo = montarOfx({ transacoes: [{ data: "20200705", valor: "-150.00", fitid: "V1" }, { data: "20200710", valor: "1500.00", fitid: "V2" }] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { campos: { mes: 7, ano: 2020 } });
      assert.equal(resposta.status, 201);
      assert.deepEqual([resposta.corpo.mes, resposta.corpo.ano], [7, 2020]);
    });

    it("mes com espaço, zero à esquerda e decimal .0 são aceitos quando o período bate", async () => {
      for (const [indice, mes] of [" 11", "011", "11.0"].entries()) {
        const conteudo = montarOfx({ transacoes: [{ data: "20261105", valor: "-10.00", fitid: `F${indice}` }] });
        const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { campos: { mes, ano: 2026 } });
        assert.equal(resposta.status, 201, JSON.stringify(mes));
        assert.deepEqual([resposta.corpo.mes, resposta.corpo.ano], [11, 2026]);
      }
    });
  });

  describe("OFX inválido: 422 e o arquivo não fica travado", () => {
    for (const [nome, conteudo, trecho] of [
      ["texto que não é OFX", "isto não é um extrato", /OFX/],
      ["DTPOSTED 20261345 (mês 13 não existe)", montarOfx({ transacoes: [{ data: "20261345", valor: "-10.00", fitid: "X1" }] }), /DTPOSTED/],
      ["TRNAMT fora da faixa do banco (1e15)", montarOfx({ transacoes: [{ data: "20261105", valor: "1000000000000000.00", fitid: "X2" }] }), /TRNAMT/],
      ["MEMO de 5.000 caracteres (PRB-C-07, #697)", montarOfx({
        transacoes: [
          { data: "20261105", valor: "10.00", fitid: "OK" },
          { data: "20261106", valor: "20.00", fitid: "LONGO", memo: "x".repeat(5_000) },
        ],
      }), /MEMO/],
    ]) {
      it(`${nome}: 422, extrato em erro, sem transação, hash zerado`, async () => {
        const antes = await fotografar(banco, A.cliente.id);
        const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "ruim.ofx" });
        assert.equal(resposta.status, 422, JSON.stringify(resposta.corpo));
        assert.equal(resposta.corpo.erro, "Arquivo OFX inválido ou malformado");
        assert.match(resposta.corpo.detalhe, trecho);

        const [extrato] = await buscarLinhas(banco, "extratos_bancarios", { cliente_id: A.cliente.id, arquivo_nome: "ruim.ofx" });
        assert.equal(extrato.status, "erro");
        assert.equal(extrato.arquivo_hash, null);
        const depois = await fotografar(banco, A.cliente.id);
        assert.deepEqual(depois.transacoes_extrato, antes.transacoes_extrato);

        const outra = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "ruim.ofx" });
        assert.equal(outra.status, 422, "o mesmo arquivo ruim reenviado dá 422 de novo, não 409");
      });
    }
  });

  describe("entrada inválida: arquivo acima do limite", () => {
    it("arquivo de 10 MB + 1 byte: 413 em português citando 10 MB, sem gravar nada (PRB-C-27, #698)", async () => {
      const grande = "OFXHEADER:100\n" + "A".repeat(10 * 1024 * 1024 + 1 - 14);
      const antes = await fotografar(banco);
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), grande, { nome: "grande.ofx" });
      assert.equal(resposta.status, 413);
      assert.match(resposta.corpo.erro, /10 MB/);
      assert.doesNotMatch(resposta.corpo.erro, /File too large/);
      assert.deepEqual(await fotografar(banco), antes);
    });
  });

  it("conta com hífen guarda os quatro últimos dígitos e preserva o BANKID (#700)", async () => {
    const resposta = await enviar(ator(A, PERFIL.CLIENTE), montarOfx({
      banco: "0237", conta: "98765-4",
      transacoes: [{ data: "20261105", valor: "10.00", fitid: "CONTA-HIFEN" }],
    }));
    assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
    assert.deepEqual([resposta.corpo.banco, resposta.corpo.conta], ["0237", "7654"]);
    const extrato = await buscarLinha(banco, "extratos_bancarios", resposta.corpo.extrato_id);
    assert.deepEqual([extrato.banco, extrato.conta], ["0237", "7654"]);
  });

  describe("FITID e valor zero (PRB-C-12, #692)", () => {
    it("FITID repetido dentro do mesmo arquivo: 422 e nenhuma transação gravada", async () => {
      const antes = await fotografar(banco, A.cliente.id);
      const conteudo = montarOfx({ transacoes: [
        { data: "20261105", valor: "-10.00", fitid: "DUP1" }, { data: "20261106", valor: "-10.00", fitid: "DUP1" },
      ] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo, { nome: "dup.ofx" });
      assert.equal(resposta.status, 422);
      assert.match(resposta.corpo.detalhe, /FITID repetido/);
      const gravadas = await buscarLinhas(banco, "transacoes_extrato", { cliente_id: A.cliente.id, id_banco: "DUP1" });
      assert.equal(gravadas.length, 0);
      assert.deepEqual((await fotografar(banco, A.cliente.id)).transacoes_extrato, antes.transacoes_extrato);
    });

    it("segundo OFX com FITID que o cliente já importou não duplica a transação", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const primeiro = await enviar(quem, montarOfx({ transacoes: [{ data: "20261105", valor: "-10.00", fitid: "SOBRE1" }, { data: "20261106", valor: "-20.00", fitid: "SOBRE2" }] }), { nome: "a.ofx" });
      assert.equal(primeiro.status, 201);
      // Mesmo FITID SOBRE1 com o valor mudado: arquivo diferente (hash diferente), mesma movimentação.
      const segundo = await enviar(quem, montarOfx({ transacoes: [{ data: "20261105", valor: "-11.00", fitid: "SOBRE1" }, { data: "20261107", valor: "-30.00", fitid: "SOBRE3" }] }), { nome: "b.ofx" });
      assert.equal(segundo.status, 201);
      assert.equal(segundo.corpo.ignoradas?.ja_importadas, 1);
      const gravadas = await buscarLinhas(banco, "transacoes_extrato", { cliente_id: A.cliente.id, id_banco: "SOBRE1" });
      assert.equal(gravadas.length, 1);
      assert.equal(Number(gravadas[0].valor), 10);
    });

    it("transação de R$ 0,00 não é gravada como crédito de valor 0", async () => {
      const conteudo = montarOfx({ transacoes: [{ data: "20261105", valor: "0.00", fitid: "ZERO1" }, { data: "20261106", valor: "-10.00", fitid: "ZERO2" }] });
      const resposta = await enviar(ator(A, PERFIL.CLIENTE), conteudo);
      assert.equal(resposta.status, 201);
      assert.equal(resposta.corpo.ignoradas?.valor_zero, 1);
      const gravadas = await buscarLinhas(banco, "transacoes_extrato", { cliente_id: A.cliente.id, id_banco: "ZERO1" });
      assert.equal(gravadas.length, 0);
    });
  });

  describe("auditoria: criado_por (PRB-C-24, #695)", () => {
    it("o extrato guarda quem o enviou: criado_por = id do token", async () => {
      const quem = ator(A, PERFIL.CLIENTE);
      const resposta = await enviar(quem, montarOfx(OFX_NOVEMBRO), { campos: { criado_por: UUID_INEXISTENTE } });
      assert.equal(resposta.status, 201);
      const extrato = await buscarLinha(banco, "extratos_bancarios", resposta.corpo.extrato_id);
      assert.equal(extrato.criado_por, quem.usuario.id);
    });
  });
});

describe("TEST-9: GET /conciliacoes/extrato (extrato atual do período)", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const consultar = (a, mes, ano) => chamar(api, a, { caminho: `/conciliacoes/extrato?mes=${mes}&ano=${ano}` });
  const NOVEMBRO = { mes: 11, ano: 2026, transacoes: [
    { data: "2026-11-03", valor: 10, tipo: "credito" }, { data: "2026-11-04", valor: 20, tipo: "debito" },
    { data: "2026-11-05", valor: 30, tipo: "credito" }, { data: "2026-11-06", valor: 40, tipo: "debito" },
  ] };

  it("extrato processado do período sem conciliação: devolve id, banco, conta, total (4) e data de envio", async () => {
    for (const quem of atoresDe(A)) {
      const { extrato } = await criarExtratoProcessado(banco, A.cliente.id, { ...NOVEMBRO, nome: `n-${quem.perfil}.ofx` });
      const resposta = await consultar(quem, 11, 2026);
      assert.equal(resposta.status, 200, quem.perfil);
      assert.deepEqual({ ...resposta.corpo.extrato, enviado_em: undefined }, {
        extrato_id: extrato.id, banco: "0341", conta: "7890", total_transacoes: 4, enviado_em: undefined,
      }, quem.perfil);
      assert.equal(paraEpoch(resposta.corpo.extrato.enviado_em), paraEpoch(extrato.criado_em), quem.perfil);
      await banco.from("transacoes_extrato").delete().eq("extrato_id", extrato.id);
      await banco.from("extratos_bancarios").delete().eq("id", extrato.id);
    }
  });

  it("com dois extratos no período devolve o mais recente", async () => {
    await criarExtratoProcessado(banco, A.cliente.id, { ...NOVEMBRO, nome: "velho.ofx" });
    const { extrato: novo } = await criarExtratoProcessado(banco, A.cliente.id, { ...NOVEMBRO, transacoes: NOVEMBRO.transacoes.slice(0, 2), nome: "novo.ofx" });
    const resposta = await consultar(ator(A, PERFIL.CLIENTE), 11, 2026);
    assert.equal(resposta.corpo.extrato.extrato_id, novo.id);
    assert.equal(resposta.corpo.extrato.total_transacoes, 2);
  });

  it("período sem extrato: 200 com extrato null", async () => {
    for (const quem of atoresDe(A)) {
      const resposta = await consultar(quem, 12, 2026);
      assert.equal(resposta.status, 200, quem.perfil);
      assert.deepEqual(resposta.corpo, { extrato: null }, quem.perfil);
    }
  });

  it("extrato que já virou conciliação (em andamento em 10/2026, concluída em 09/2026): extrato null", async () => {
    for (const quem of atoresDe(A)) {
      for (const mes of [10, 9]) {
        const resposta = await consultar(quem, mes, 2026);
        assert.equal(resposta.status, 200);
        assert.deepEqual(resposta.corpo, { extrato: null }, `${quem.perfil} mês ${mes}`);
      }
    }
  });

  it("outro escritório: extrato do B no mesmo período não aparece para o A (nem para o admin_efficience escolhendo o A)", async () => {
    const { extrato: doB } = await criarExtratoProcessado(banco, B.cliente.id, { ...NOVEMBRO, nome: "do-b.ofx" });
    const antes = await fotografar(banco);
    for (const quem of atoresDe(A)) {
      const resposta = await consultar(quem, 11, 2026);
      assert.equal(resposta.status, 200, quem.perfil);
      assert.deepEqual(resposta.corpo, { extrato: null }, `${quem.perfil} do A não pode ver o extrato ${doB.id} do B`);
    }
    const doProprioB = await consultar(ator(B, PERFIL.CLIENTE), 11, 2026);
    assert.equal(doProprioB.corpo.extrato.extrato_id, doB.id, "controle: o B enxerga o próprio extrato");
    assert.deepEqual(await fotografar(banco), antes);
  });

  for (const [nome, consulta] of [
    ["sem mes e ano", ""], ["mes=0", "?mes=0&ano=2026"], ["mes=13", "?mes=13&ano=2026"], ["mes=abc", "?mes=abc&ano=2026"],
    ["ano=0", "?mes=11&ano=0"], ["ano=-1", "?mes=11&ano=-1"], ["ano=abc", "?mes=11&ano=abc"], ["só o mês", "?mes=11"], ["só o ano", "?ano=2026"],
  ]) {
    it(`${nome}: 400 'mes e ano são obrigatórios e devem ser válidos'`, async () => {
      const antes = await fotografar(banco);
      const resposta = await chamar(api, ator(A, PERFIL.CLIENTE), { caminho: `/conciliacoes/extrato${consulta}` });
      assert.equal(resposta.status, 400);
      assert.deepEqual(resposta.corpo, { erro: "mes e ano são obrigatórios e devem ser válidos" });
      assert.deepEqual(await fotografar(banco), antes);
    });
  }

  it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
    const resposta = await api.requisitar("/conciliacoes/extrato?mes=11&ano=2026", { usuario: A.usuario(PERFIL.EFFICIENCE) });
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
  });
});

describe("TEST-9: GET /conciliacoes/extrato/:id/transacoes", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A; let B;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A, B } = await bateria.recriar()); });

  const listar = (a, id, consulta = "") => chamar(api, a, { caminho: `/conciliacoes/extrato/${id}/transacoes${consulta}` });

  it("sem paginação: 200 com 20 das 21 transações, da mais nova para a mais antiga, com todos os campos", async () => {
    for (const quem of atoresDe(A)) {
      const resposta = await listar(quem, A.extrato.processado);
      assert.equal(resposta.status, 200, quem.perfil);
      assert.equal(resposta.corpo.total, 21);
      assert.equal(resposta.corpo.limit, 20);
      assert.equal(resposta.corpo.offset, 0);
      assert.equal(resposta.corpo.data.length, 20);
      // i = 20 é a mais nova: data 2026-10-21, valor (20+1)*10 = 210, crédito porque 20 é par.
      const [primeira, segunda] = resposta.corpo.data;
      assert.deepEqual(
        { ...primeira, criado_em: undefined },
        {
          id: A.transacaoAberta(20), extrato_id: A.extrato.processado, cliente_id: A.cliente.id, data_lancamento: "2026-10-21",
          valor: 210, tipo: "credito", descricao: "Transação sintética a-0-20", id_banco: "680-a-0-20", conciliado: false, criado_em: undefined,
        }, quem.perfil,
      );
      assert.deepEqual([segunda.id, segunda.valor, segunda.tipo], [A.transacaoAberta(19), 200, "debito"], quem.perfil);
      const datas = resposta.corpo.data.map(t => t.data_lancamento);
      assert.deepEqual(datas, [...datas].sort().reverse());
    }
  });

  it("paginação 15 + 6 sem repetir nem perder nenhuma das 21", async () => {
    const quem = ator(A, PERFIL.CLIENTE);
    const primeira = await listar(quem, A.extrato.processado, "?limit=15&offset=0");
    const segunda = await listar(quem, A.extrato.processado, "?limit=15&offset=15");
    assert.equal(primeira.corpo.data.length, 15);
    assert.equal(segunda.corpo.data.length, 6);
    const ids = [...primeira.corpo.data, ...segunda.corpo.data].map(t => t.id);
    assert.equal(new Set(ids).size, 21);
    // A última página termina na mais antiga: i = 0, 2026-10-01, valor 10, crédito.
    assert.deepEqual(segunda.corpo.data.at(-1).id, A.transacaoAberta(0));
  });

  it("limit acima de 100 é cortado em 100 (contrato da rota)", async () => {
    const resposta = await listar(ator(A, PERFIL.CLIENTE), A.extrato.processado, "?limit=1000");
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.limit, 100);
    assert.equal(resposta.corpo.data.length, 21);
  });

  it("extrato sem transações: 200 com lista vazia e total 0", async () => {
    const resposta = await listar(ator(A, PERFIL.CLIENTE), A.extrato.aguardando);
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { data: [], total: 0, limit: 20, offset: 0 });
  });

  it("outro escritório e id inexistente têm o mesmo 404, com o extrato do B presente e o banco intacto", async () => {
    await provarOutroEscritorio404(api, banco, {
      alvo: { tabela: "extratos_bancarios", id: B.extrato.processado },
      atores: atoresDe(A),
      montar: id => ({ caminho: `/conciliacoes/extrato/${id}/transacoes` }),
      mensagem: "Extrato bancário não encontrado",
    });
  });

  it("o B recebe só transações do B (controle do isolamento nos dois sentidos)", async () => {
    const resposta = await listar(ator(B, PERFIL.FUNCIONARIO), B.extrato.processado, "?limit=100");
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.total, 21);
    assert.ok(resposta.corpo.data.every(t => t.cliente_id === B.cliente.id && t.extrato_id === B.extrato.processado));
  });

  it("id que não é UUID: 400 'id deve ser um UUID válido', sem consultar o banco", async () => {
    const resposta = await listar(ator(A, PERFIL.CLIENTE), "nao-e-uuid");
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "id deve ser um UUID válido" });
  });

  it("admin_efficience sem cliente_id: 400 'cliente_id é obrigatório'", async () => {
    const resposta = await api.requisitar(`/conciliacoes/extrato/${A.extrato.processado}/transacoes`, { usuario: A.usuario(PERFIL.EFFICIENCE) });
    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo, { erro: "cliente_id é obrigatório" });
  });

  for (const consulta of ["?limit=-1", "?limit=abc", "?offset=-1"]) {
    it(`${consulta}: 400 em vez de 500 ou de ignorar o valor (PRB-C-09, #696)`, async () => {
      const resposta = await listar(ator(A, PERFIL.CLIENTE), A.extrato.processado, consulta);
      assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
    });
  }

  it("UUID inexistente puro não vaza nada além do 404 (corpo idêntico ao do outro escritório)", async () => {
    const resposta = await listar(ator(A, PERFIL.CLIENTE), UUID_INEXISTENTE);
    assert.deepEqual(resposta.corpo, { erro: "Extrato bancário não encontrado" });
  });
});
