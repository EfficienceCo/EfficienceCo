import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { criarMassaDominio680 } from "../fixtures/massa-680-dominio.js";
import { cpfValido, cnpjValido } from "../../src/utils/comum.util.js";

const esperadas = {
  clientes: 2, usuarios: 6, lancamentos_contabeis: 32, extratos_bancarios: 8,
  transacoes_extrato: 46, conciliacoes: 4, pares_conciliacao: 46,
  lancamentos_fiscais: 6, lancamentos_fiscais_itens: 6, obrigacoes: 6,
};
const estados = (linhas, campo = "status") => [...new Set(linhas.map(linha => linha[campo]))].sort();

test("#680: massa de domínio mantém contagens explícitas e determinismo", () => {
  const massa = criarMassaDominio680();
  assert.deepEqual(massa, criarMassaDominio680());
  for (const [tabela, quantidade] of Object.entries(esperadas)) assert.equal(massa.tabelas[tabela].length, quantidade, tabela);
  assert.equal(massa.entradasNfe.length, 10);
});

test("#680: cada contexto tem os estados de Conciliação, NF-e e Obrigações", () => {
  const { tabelas } = criarMassaDominio680();
  for (const cliente of tabelas.clientes) {
    const doCliente = tabela => tabelas[tabela].filter(linha => linha.cliente_id === cliente.id);
    assert.deepEqual(estados(doCliente("extratos_bancarios")), ["aguardando", "erro", "processado"]);
    assert.deepEqual(estados(doCliente("conciliacoes")), ["concluida", "em_andamento"]);
    assert.deepEqual(estados(doCliente("lancamentos_fiscais")), ["ativa", "cancelada"]);
    assert.deepEqual(estados(doCliente("lancamentos_fiscais"), "tipo"), ["entrada", "saida"]);
    const obrigacoes = doCliente("obrigacoes");
    assert.deepEqual(estados(obrigacoes), ["atrasada", "concluida", "pendente"]);
    assert.ok(obrigacoes.find(item => item.status === "concluida").comprovante_path);
    assert.ok(obrigacoes.find(item => item.status === "atrasada").data_vencimento < "2026-10-15");
    assert.ok(obrigacoes.find(item => item.status === "pendente").data_vencimento > "2026-10-15");
  }
});

test("#680: vínculos e totais da Conciliação pertencem ao mesmo contexto", () => {
  const { tabelas } = criarMassaDominio680();
  for (const sessao of tabelas.conciliacoes) {
    const extrato = tabelas.extratos_bancarios.find(item => item.id === sessao.extrato_id);
    assert.equal(extrato.cliente_id, sessao.cliente_id);
    const pares = tabelas.pares_conciliacao.filter(par => par.conciliacao_id === sessao.id);
    const transacoes = tabelas.transacoes_extrato.filter(item => item.extrato_id === sessao.extrato_id);
    assert.equal(transacoes.length, sessao.total_transacoes);
    assert.equal(pares.length, transacoes.length);
    const casados = pares.filter(par => par.confianca === "automatico" || (par.confianca === "provavel" && par.confirmado_em));
    assert.equal(casados.length, sessao.total_conciliadas);
    assert.equal(sessao.total_conciliadas + sessao.total_pendentes, sessao.total_transacoes);
    for (const par of pares) {
      const transacao = transacoes.find(item => item.id === par.transacao_id);
      assert.ok(transacao);
      assert.equal(transacao.cliente_id, sessao.cliente_id);
      if (par.lancamento_id) {
        assert.equal(tabelas.lancamentos_contabeis.find(item => item.id === par.lancamento_id).cliente_id, sessao.cliente_id);
      }
      assert.equal(par.confirmado_por === null, par.confirmado_em === null);
    }
  }
  assert.deepEqual(estados(tabelas.pares_conciliacao, "confianca"), ["automatico", "provavel", "sem_par"]);
  assert.ok(tabelas.pares_conciliacao.some(par => par.confirmado_em));
  assert.ok(tabelas.pares_conciliacao.some(par => !par.confirmado_em));
});

test("#680: XMLs assinados preservam documentos e protocolos dos casos de entrada", () => {
  const ns = "http://www.portalfiscal.inf.br/nfe";
  const texto = (no, tag) => no.getElementsByTagNameNS(ns, tag)[0]?.textContent ?? null;
  const massa = criarMassaDominio680();
  for (const entrada of massa.entradasNfe) {
    assert.ok(entrada.emitente.length === 11 ? cpfValido(entrada.emitente) : cnpjValido(entrada.emitente));
    assert.ok(cnpjValido(entrada.destinatario));
    assert.match(entrada.chave, /^\d{44}$/);
    const xml = fs.readFileSync(new URL(`../fixtures/${entrada.arquivo}`, import.meta.url), "utf8");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    assert.equal(doc.getElementsByTagNameNS(ns, "infNFe")[0].getAttribute("Id"), `NFe${entrada.chave}`);
    const emit = doc.getElementsByTagNameNS(ns, "emit")[0];
    assert.equal(texto(emit, entrada.emitente.length === 11 ? "CPF" : "CNPJ"), entrada.emitente);
    assert.equal(texto(doc, "nProt"), entrada.protocolo);
    assert.equal(doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature").length, 1);
  }
  assert.equal(massa.entradasNfe.filter(item => !item.protocolo).length, 2);
  assert.equal(massa.entradasNfe.filter(item => item.emitente.length === 11).length, 2);
  assert.ok(massa.entradasNfe.filter(item => item.persistivel).every(item => item.protocolo && item.emitente.length === 14));
});

test("#680: arquivos sintéticos têm hashes fixos e comprovantes PDF reais", () => {
  const manifesto = JSON.parse(fs.readFileSync(new URL("../fixtures/massa-680/manifesto.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(manifesto).length, 12);
  for (const [arquivo, hash] of Object.entries(manifesto)) {
    const bytes = fs.readFileSync(new URL(`../fixtures/${arquivo}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, arquivo);
    if (arquivo.endsWith(".pdf")) assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  }
  for (const obrigacao of criarMassaDominio680().tabelas.obrigacoes.filter(item => item.status === "concluida")) {
    assert.ok(manifesto[obrigacao.comprovante_path]);
  }
});
