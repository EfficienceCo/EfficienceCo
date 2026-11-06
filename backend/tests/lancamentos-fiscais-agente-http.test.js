// TEST-11 (#688): as rotas que o agente usa no caminho da NF-e, com requisição HTTP de verdade e
// banco descartável de verdade (massa #680, dois escritórios). O agente se identifica pelo
// x-licenca-token, não por JWT de usuário. Cobre: POST /lancamentos-fiscais, POST /lancamentos-fiscais/cancelar,
// GET /clientes/por-cnpj (a consulta que o agente faz antes de postar) e POST /eventos (o aviso de
// cancelamento órfão). Em cada recusa o banco dos DOIS escritórios tem de ficar igual.
//
// Os números esperados saem da massa #680 (cnpj e ids dos clientes) e de conta feita à mão neste
// arquivo (chave de acesso: módulo 11 da NT 2012.002, ver helpers/agente-nfe.js). O backend decide
// o que é 401/403/404/409/422; este arquivo só confere. Entre escritórios a regra do time é 404, nunca
// 403 (comentário do Vitinho, PR #723). Hoje o controller devolve 403 "cliente_id não corresponde ao
// token" para token de outro escritório, e o mesmo 403 para cliente_id inexistente: bug conhecido, com skip.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarApiTeste } from "./helpers/http.js";
import { recriarMassa680 } from "./helpers/massa-680.js";
import { lerTabela, resetarBanco } from "./helpers/banco.js";
import { chaveNfe } from "./fixtures/massa-680-dominio.js";
import {
  CNPJ_TERCEIRO, fotografarNfe, lerItens, lerLancamentos, payloadLancamento,
} from "./helpers/agente-nfe.js";
import { alterarLicenca, cabecalhoLicenca, criarLicenca } from "./helpers/licenca-agente.js";
import { conhecido } from "./helpers/bug-conhecido.js";

describe("TEST-11: rotas da NF-e do agente (HTTP, licença e banco reais)", { timeout: 300_000 }, () => {
  let api;
  let banco;
  let massa;
  let A;
  let B;
  let tokenA;
  let tokenB;

  before(async () => { api = await iniciarApiTeste(); });
  after(async () => {
    try { await api.fechar(); } finally { await resetarBanco(); }
  });
  beforeEach(async () => {
    ({ massa, banco } = await recriarMassa680());
    [A, B] = massa.tabelas.clientes;
    tokenA = await criarLicenca(banco, A.id);
    tokenB = await criarLicenca(banco, B.id);
  });

  const postar = (corpo, token) => api.requisitar("/lancamentos-fiscais", {
    metodo: "POST", corpo, cabecalhos: cabecalhoLicenca(token),
  });
  const cancelar = (corpo, token) => api.requisitar("/lancamentos-fiscais/cancelar", {
    metodo: "POST", corpo, cabecalhos: cabecalhoLicenca(token),
  });
  const CLIENTE_ID_INEXISTENTE = "99999999-9999-4999-8999-999999999999";
  const chaveComDvErrado = chave => `${chave.slice(0, 43)}${(Number(chave[43]) + 1) % 10}`;

  describe("POST /lancamentos-fiscais: autenticação e isolamento", () => {
    it("sem token: 401 e nada é gravado", async () => {
      const antes = await fotografarNfe(banco);
      const resposta = await postar(payloadLancamento(A));
      assert.equal(resposta.status, 401);
      assert.deepEqual(resposta.corpo, { erro: "Token de licença inválido ou expirado" });
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("token que não existe: 401 e nada é gravado", async () => {
      const antes = await fotografarNfe(banco);
      const resposta = await postar(payloadLancamento(A), "token-que-nao-existe");
      assert.equal(resposta.status, 401);
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("licença desligada e licença vencida: 401 e nada é gravado", async () => {
      // Há uma licença por cliente (licencas_cliente_id_unique): o teste muda a do A duas vezes.
      const mudarLicenca = campos => alterarLicenca(banco, tokenA, campos);
      const antes = await fotografarNfe(banco);
      await mudarLicenca({ ativa: false });
      assert.equal((await postar(payloadLancamento(A), tokenA)).status, 401);
      await mudarLicenca({ ativa: true, validade: "2020-01-01T00:00:00Z" });
      assert.equal((await postar(payloadLancamento(A), tokenA)).status, 401);
      assert.deepEqual(await fotografarNfe(banco), antes);
      // Controle: com a licença de volta o mesmo corpo é aceito (o 401 acima era da licença).
      await mudarLicenca({ validade: null });
      assert.equal((await postar(payloadLancamento(A), tokenA)).status, 201);
    });

    it("token de outro escritório com o cliente_id do A: não é 201, o erro cita o cliente_id/token e nada é gravado (o 404 certo está no skip de bug conhecido)", async () => {
      // Invariante que vale hoje: a recusa acontece pelo motivo do token e o banco dos dois escritórios
      // fica igual. O status certo (404) está no teste de bug conhecido mais abaixo.
      const antes = await fotografarNfe(banco);
      const resposta = await postar(payloadLancamento(A), tokenB);
      assert.notEqual(resposta.status, 201);
      assert.match(resposta.corpo.erro, /cliente_id|token/i);
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("CNPJ do cliente que não é o emitente/destinatário do tipo informado: 403 e nada é gravado", async () => {
      // Nota de entrada de A (emitente terceiro, destinatário A) mandada como saída: o emitente não é A.
      const antes = await fotografarNfe(banco);
      const resposta = await postar({ ...payloadLancamento(A), tipo: "saida" }, tokenA);
      assert.equal(resposta.status, 403);
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("cliente_id que não existe: não é 201, o erro cita o cliente_id/token e nada é gravado (o 404 certo está no skip de bug conhecido)", async () => {
      const antes = await fotografarNfe(banco);
      const resposta = await postar(payloadLancamento(A, { cliente_id: CLIENTE_ID_INEXISTENTE }), tokenA);
      assert.notEqual(resposta.status, 201);
      assert.match(resposta.corpo.erro, /cliente_id|token/i);
      assert.deepEqual(await fotografarNfe(banco), antes);
    });
  });

  describe("POST /lancamentos-fiscais: grava nota e itens (duas tabelas)", () => {
    it("201: confere as linhas de lancamentos_fiscais e de lancamentos_fiscais_itens depois", async () => {
      const antes = await fotografarNfe(banco);
      const corpo = payloadLancamento(A, {
        numero: 90001,
        itens: [
          { n_item: 2, cfop: "1102", ncm: "01012100" },
          { n_item: 1, cfop: "1556", ncm: "01012100" },
        ],
      });
      const resposta = await postar(corpo, tokenA);
      assert.equal(resposta.status, 201);
      assert.equal(resposta.corpo.chave_nfe, corpo.chave_nfe);
      assert.deepEqual(resposta.corpo.itens, [
        { n_item: 1, cfop: "1556", ncm: "01012100" },
        { n_item: 2, cfop: "1102", ncm: "01012100" },
      ]);

      const linhas = await lerLancamentos(banco, { chave_nfe: corpo.chave_nfe });
      assert.equal(linhas.length, 1);
      const [nota] = linhas;
      assert.equal(nota.cliente_id, A.id);
      assert.equal(nota.tipo, "entrada");
      assert.equal(nota.cnpj_emitente, CNPJ_TERCEIRO);
      assert.equal(nota.cnpj_destinatario, A.cnpj);
      assert.equal(Number(nota.valor_total), 1234.56);
      assert.equal(Number(nota.icms), 12.34);
      assert.equal(Number(nota.pis), 1.5);
      assert.equal(Number(nota.cofins), 6.9);
      assert.equal(Number(nota.ipi), 0);
      assert.equal(nota.data_emissao, "2026-10-20");
      assert.equal(nota.arquivo_xml, corpo.arquivo_xml);
      assert.equal(nota.tp_nf, 0);
      assert.equal(nota.status, "ativa");
      assert.equal(nota.cancelado_em, null);

      const itens = await lerItens(banco, { lancamento_id: nota.id });
      assert.deepEqual(
        itens.map(({ n_item, cfop, ncm, cliente_id, lancamento_id }) => ({ n_item, cfop, ncm, cliente_id, lancamento_id })),
        [
          { n_item: 1, cfop: "1556", ncm: "01012100", cliente_id: A.id, lancamento_id: nota.id },
          { n_item: 2, cfop: "1102", ncm: "01012100", cliente_id: A.id, lancamento_id: nota.id },
        ],
      );

      // Só a nota nova entrou: as demais linhas (massa #680, os dois escritórios) seguem iguais.
      const depois = await fotografarNfe(banco);
      assert.equal(depois.lancamentos_fiscais.length, antes.lancamentos_fiscais.length + 1);
      assert.equal(depois.lancamentos_fiscais_itens.length, antes.lancamentos_fiscais_itens.length + 2);
    });

    it("nota de saída do B: grava com o CNPJ do cliente como emitente e o item na outra tabela", async () => {
      const corpo = payloadLancamento(B, { tipo: "saida", numero: 90002 });
      const resposta = await postar(corpo, tokenB);
      assert.equal(resposta.status, 201);
      const [nota] = await lerLancamentos(banco, { chave_nfe: corpo.chave_nfe });
      assert.equal(nota.cliente_id, B.id);
      assert.equal(nota.tipo, "saida");
      assert.equal(nota.cnpj_emitente, B.cnpj);
      assert.equal(nota.cnpj_destinatario, CNPJ_TERCEIRO);
      assert.equal(nota.tp_nf, 1);
      assert.equal((await lerItens(banco, { lancamento_id: nota.id })).length, 1);
    });

    it("itens recusados pelo banco: 500 e a nota não fica (nota sem itens não existe)", async () => {
      // n_item passa na validação da API (inteiro positivo), mas estoura o integer da coluna: o INSERT
      // dos itens falha depois de a nota já ter sido gravada, e o controller tem de desfazer a nota.
      // Sem isso a chave ficaria ocupada sem itens e o reenvio do agente daria 409.
      const antes = await fotografarNfe(banco);
      const corpo = payloadLancamento(A, { numero: 90005, itens: [{ n_item: 3000000000, cfop: "1102", ncm: "01012100" }] });
      const resposta = await postar(corpo, tokenA);
      assert.equal(resposta.status, 500);
      assert.deepEqual(resposta.corpo, { erro: "Erro ao registrar lançamento fiscal" });
      assert.deepEqual(await fotografarNfe(banco), antes);
      assert.deepEqual(await lerLancamentos(banco, { chave_nfe: corpo.chave_nfe }), []);
    });

    it("mesma nota enviada de novo: 409 e continua uma nota e um item (arquivo repetido não duplica)", async () => {
      const corpo = payloadLancamento(A, { numero: 90003 });
      assert.equal((await postar(corpo, tokenA)).status, 201);
      const depoisDoPrimeiro = await fotografarNfe(banco);

      const repetido = await postar(corpo, tokenA);
      assert.equal(repetido.status, 409);
      assert.deepEqual(repetido.corpo, { erro: "Já existe um lançamento fiscal para esta chave de NFe" });
      assert.deepEqual(await fotografarNfe(banco), depoisDoPrimeiro);
      assert.equal((await lerLancamentos(banco, { chave_nfe: corpo.chave_nfe })).length, 1);
    });

    it("nota entre os dois escritórios (A destinatário, B emitente): cada um grava a sua, mesma chave nos dois (PRB-E-23)", async () => {
      // A chave é uma só (a nota é uma só); o livro de cada escritório tem a sua linha.
      const chave = chaveNfe(B.cnpj, 90004);
      const comum = { chave_nfe: chave, cnpj_emitente: B.cnpj, cnpj_destinatario: A.cnpj };
      const entradaDeA = payloadLancamento(A, { ...comum, tipo: "entrada" });
      const saidaDeB = payloadLancamento(B, { ...comum, tipo: "saida" });
      assert.equal((await postar(entradaDeA, tokenA)).status, 201);
      assert.equal((await postar(saidaDeB, tokenB)).status, 201);

      const linhas = await lerLancamentos(banco, { chave_nfe: chave });
      assert.deepEqual(linhas.map(linha => [linha.cliente_id, linha.tipo]).sort(), [[A.id, "entrada"], [B.id, "saida"]].sort());
      const itens = await lerItens(banco);
      for (const linha of linhas) {
        assert.equal(itens.filter(item => item.lancamento_id === linha.id && item.cliente_id === linha.cliente_id).length, 1);
      }
    });
  });

  describe("POST /lancamentos-fiscais: entrada inválida não grava nada", () => {
    const CASOS = [
      ["sem itens (campo obrigatório faltando)", corpo => { delete corpo.itens; return corpo; }, 400],
      ["sem chave_nfe", corpo => { delete corpo.chave_nfe; return corpo; }, 400],
      ["chave com dígito verificador errado", corpo => ({ ...corpo, chave_nfe: chaveComDvErrado(corpo.chave_nfe) }), 422],
      ["chave com menos de 44 dígitos", corpo => ({ ...corpo, chave_nfe: corpo.chave_nfe.slice(0, 43) }), 422],
      ["valor negativo", corpo => ({ ...corpo, valor_total: "-10.00" }), 422],
      ["valor com três casas decimais", corpo => ({ ...corpo, valor_total: "10.001" }), 422],
      ["data de emissão futura", corpo => ({ ...corpo, data_emissao: "2999-01-01" }), 422],
      ["lista de itens vazia", corpo => ({ ...corpo, itens: [] }), 422],
      ["item com NCM de 7 dígitos", corpo => ({ ...corpo, itens: [{ n_item: 1, cfop: "1102", ncm: "0101210" }] }), 422],
      ["itens com n_item repetido", corpo => ({ ...corpo, itens: [{ n_item: 1, cfop: "1102", ncm: "01012100" }, { n_item: 1, cfop: "1102", ncm: "01012100" }] }), 422],
      ["emitente com CNPJ de dígito verificador errado", corpo => ({ ...corpo, cnpj_emitente: "11111111000100" }), 422],
      ["arquivo_xml com caminho absoluto", corpo => ({ ...corpo, arquivo_xml: "C:/Clientes/nota.xml" }), 422],
      ["tp_nf fora de 0 e 1", corpo => ({ ...corpo, tp_nf: 2 }), 422],
    ];
    for (const [nome, alterar, esperado] of CASOS) {
      it(`${nome}: ${esperado} e nenhuma linha em nenhuma das duas tabelas`, async () => {
        const antes = await fotografarNfe(banco);
        const resposta = await postar(alterar(payloadLancamento(A)), tokenA);
        assert.equal(resposta.status, esperado, JSON.stringify(resposta.corpo));
        assert.deepEqual(await fotografarNfe(banco), antes);
      });
    }
  });

  describe("POST /lancamentos-fiscais/cancelar", () => {
    async function escriturar(cliente, token, opcoes) {
      const corpo = payloadLancamento(cliente, opcoes);
      assert.equal((await postar(corpo, token)).status, 201);
      return corpo;
    }

    it("sem token e token inválido: 401 e a nota não muda", async () => {
      const nota = await escriturar(A, tokenA);
      const antes = await fotografarNfe(banco);
      for (const token of [undefined, "token-que-nao-existe"]) {
        const resposta = await cancelar({ chave_nfe: nota.chave_nfe }, token);
        assert.equal(resposta.status, 401);
      }
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("token de outro escritório: 404 igual ao de nota que não existe, e a nota do A segue ativa", async () => {
      const nota = await escriturar(A, tokenA);
      const antes = await fotografarNfe(banco);
      const deOutro = await cancelar({ chave_nfe: nota.chave_nfe, motivo: "tentativa do B" }, tokenB);
      const inexistente = await cancelar({ chave_nfe: chaveNfe(CNPJ_TERCEIRO, 90999) }, tokenB);
      assert.equal(deOutro.status, 404);
      assert.deepEqual(deOutro.corpo, inexistente.corpo);
      assert.deepEqual(await fotografarNfe(banco), antes);
      const [linha] = await lerLancamentos(banco, { chave_nfe: nota.chave_nfe });
      assert.equal(linha.status, "ativa");
    });

    it("nota existente: 200 e a linha vira cancelada com data, motivo e protocolo; nota e itens continuam lá", async () => {
      const nota = await escriturar(A, tokenA, { numero: 90010 });
      const resposta = await cancelar({
        chave_nfe: nota.chave_nfe, motivo: "Operação não realizada", protocolo: "135260000000010",
        data_evento: "2026-10-21T10:00:01-03:00",
      }, tokenA);
      assert.equal(resposta.status, 200);

      const [linha] = await lerLancamentos(banco, { chave_nfe: nota.chave_nfe });
      assert.equal(linha.status, "cancelada");
      // 10:00:01 em -03:00 são 13:00:01 em UTC (conta feita à mão).
      assert.equal(new Date(linha.cancelado_em).toISOString(), "2026-10-21T13:00:01.000Z");
      assert.equal(linha.motivo_cancelamento, "Operação não realizada");
      assert.equal(linha.protocolo_cancelamento, "135260000000010");
      assert.equal(Number(linha.valor_total), 1234.56);
      assert.equal((await lerItens(banco, { lancamento_id: linha.id })).length, 1);
    });

    it("nota que o sistema nunca recebeu: 404 e nada muda (o agente espera e depois dá como órfã)", async () => {
      const antes = await fotografarNfe(banco);
      const resposta = await cancelar({ chave_nfe: chaveNfe(CNPJ_TERCEIRO, 90998) }, tokenA);
      assert.equal(resposta.status, 404);
      assert.deepEqual(resposta.corpo, { erro: "Lançamento fiscal não encontrado para esta licença" });
      assert.deepEqual(await fotografarNfe(banco), antes);
    });

    it("chave malformada, com DV errado e data_evento inválida: 400 e nada muda", async () => {
      const nota = await escriturar(A, tokenA, { numero: 90013 });
      const antes = await fotografarNfe(banco);
      for (const corpo of [
        {}, { chave_nfe: "123" }, { chave_nfe: chaveComDvErrado(nota.chave_nfe) }, { chave_nfe: nota.chave_nfe, data_evento: "ontem" },
      ]) {
        const resposta = await cancelar(corpo, tokenA);
        assert.equal(resposta.status, 400, JSON.stringify(corpo));
      }
      assert.deepEqual(await fotografarNfe(banco), antes);
    });
  });

  describe("GET /clientes/por-cnpj: a consulta que o agente faz antes de postar", () => {
    const consultar = (cnpj, token) => api.requisitar(`/clientes/por-cnpj?cnpj=${cnpj}`, {
      cabecalhos: cabecalhoLicenca(token),
    });

    it("token do A resolve o CNPJ do A; o CNPJ do B (outro escritório) dá o mesmo 404 de CNPJ não cadastrado", async () => {
      const proprio = await consultar(A.cnpj, tokenA);
      assert.equal(proprio.status, 200);
      assert.deepEqual(proprio.corpo, { id: A.id, nome: A.nome });
      const doOutro = await consultar(B.cnpj, tokenA);
      const naoCadastrado = await consultar(CNPJ_TERCEIRO, tokenA);
      assert.equal(doOutro.status, 404);
      assert.deepEqual(doOutro.corpo, naoCadastrado.corpo);
    });

    it("sem token, token inválido e CNPJ com tamanho errado", async () => {
      assert.equal((await consultar(A.cnpj)).status, 401);
      assert.equal((await consultar(A.cnpj, "token-que-nao-existe")).status, 401);
      assert.equal((await consultar("123", tokenA)).status, 400);
    });
  });

  describe("POST /eventos: o aviso do agente (grava eventos e notificacoes)", () => {
    const avisar = (corpo, token) => api.requisitar("/eventos", {
      metodo: "POST", corpo, cabecalhos: cabecalhoLicenca(token),
    });
    const corpoAviso = cliente => ({ cliente_id: cliente.id, descricao: "[NF-e] aviso de teste", sucesso: false });

    it("201: confere as linhas das duas tabelas (evento e notificação de erro do escritório certo)", async () => {
      const resposta = await avisar(corpoAviso(A), tokenA);
      assert.equal(resposta.status, 201);
      const eventos = await lerTabela(banco, "eventos");
      assert.equal(eventos.length, 1);
      assert.equal(eventos[0].cliente_id, A.id);
      assert.equal(eventos[0].descricao, "[NF-e] aviso de teste");
      assert.equal(eventos[0].sucesso, false);
      const notificacoes = await lerTabela(banco, "notificacoes");
      assert.equal(notificacoes.length, 1);
      assert.equal(notificacoes[0].cliente_id, A.id);
      assert.equal(notificacoes[0].tipo, "arquivo_erro");
      assert.equal(notificacoes[0].mensagem, "[NF-e] aviso de teste");
    });

    it("sem token, token inválido, token de outro escritório e corpo incompleto: nada é gravado", async () => {
      const antes = await fotografarNfe(banco);
      assert.equal((await avisar(corpoAviso(A))).status, 401);
      assert.equal((await avisar(corpoAviso(A), "token-que-nao-existe")).status, 401);
      // Token de outro escritório: não é 201 e o erro cita o token; o 404 certo está no skip de bug conhecido.
      const deOutro = await avisar(corpoAviso(A), tokenB);
      assert.notEqual(deOutro.status, 201);
      assert.match(deOutro.corpo.erro, /token/i);
      assert.equal((await avisar({ cliente_id: A.id }, tokenA)).status, 400);
      assert.deepEqual(await fotografarNfe(banco), antes);
    });
  });

  describe("bugs conhecidos: o teste do comportamento certo fica com skip até a correção", () => {
    const REGRA = "a regra do time é 404 entre escritórios, sem revelar que o cliente existe (comentário do Vitinho, PR #723). Ao corrigir, tirar este skip e ajustar o `match` do erro nos testes ativos correspondentes.";
    const MOTIVO_LANCAMENTO = `BUG (sem issue; precisa de issue \`bug\`): POST /lancamentos-fiscais com token de licença de outro escritório recebe 403 'cliente_id não corresponde ao token de licença' (backend/src/controllers/lancamentos-fiscais.controller.js:104, compara cliente_id com a licença antes de consultar o banco); ${REGRA}`;
    const MOTIVO_EVENTOS = `BUG (sem issue; precisa de issue \`bug\`): POST /eventos com token de licença de outro escritório recebe 403 'Token não pertence a este cliente' (backend/src/controllers/eventos.controller.js:100); ${REGRA}`;
    const MOTIVO_INEXISTENTE = `BUG (sem issue; precisa de issue \`bug\`): POST /lancamentos-fiscais com cliente_id que não existe recebe o mesmo 403 'cliente_id não corresponde ao token de licença' (lancamentos-fiscais.controller.js:104); inexistente e de outro escritório têm de ser indistinguíveis (404). ${REGRA}`;

    it("POST /lancamentos-fiscais com token de outro escritório: 404",
      conhecido(MOTIVO_LANCAMENTO), async () => {
        const antes = await fotografarNfe(banco);
        const resposta = await postar(payloadLancamento(A), tokenB);
        assert.equal(resposta.status, 404);
        assert.deepEqual(await fotografarNfe(banco), antes);
      });

    it("POST /eventos com token de outro escritório: 404",
      conhecido(MOTIVO_EVENTOS), async () => {
        const antes = await fotografarNfe(banco);
        const resposta = await api.requisitar("/eventos", {
          metodo: "POST", corpo: { cliente_id: A.id, descricao: "[NF-e] aviso de teste", sucesso: false }, cabecalhos: cabecalhoLicenca(tokenB),
        });
        assert.equal(resposta.status, 404);
        assert.deepEqual(await fotografarNfe(banco), antes);
      });

    it("POST /lancamentos-fiscais com cliente_id que não existe (token do A): 404",
      conhecido(MOTIVO_INEXISTENTE), async () => {
        const antes = await fotografarNfe(banco);
        const resposta = await postar(payloadLancamento(A, { cliente_id: CLIENTE_ID_INEXISTENTE }), tokenA);
        assert.equal(resposta.status, 404);
        assert.deepEqual(await fotografarNfe(banco), antes);
      });
  });
});
