import { after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import supabase from "../src/config/database.js";
import {
  criarCertificado,
  editarCertificado,
  iniciarRenovacaoCertificado,
  atualizarRenovacaoCertificado,
} from "../src/controllers/certificados.controller.js";

const CLIENTE = "11111111-1111-1111-1111-111111111111";
const ID = "33333333-3333-3333-3333-333333333333";
const originalFrom = supabase.from;
let registros;
let proximoId;
let aposInserir;
const copiar = (valor) => structuredClone(valor);

// O armazenamento aplica filtros à versão atual da linha. As leituras devolvem
// snapshots independentes, permitindo reproduzir duas requisições concorrentes.
supabase.from = (tabela) => {
  assert.equal(tabela, "certificados_digitais");
  let operacao = "select";
  let valores;
  const filtros = [];
  function executar() {
    if (operacao === "insert") {
      const registro = { id: `novo-${++proximoId}`, status: "ativo", ...copiar(valores) };
      registros.set(registro.id, registro);
      aposInserir?.();
      return { data: copiar(registro), error: null };
    }
    const registro = [...registros.values()].find((linha) => filtros.every(([campo, valor]) =>
      isDeepStrictEqual(linha[campo], campo === "renovacao_checklist" && typeof valor === "string" ? JSON.parse(valor) : valor),
    ));
    if (!registro) return { data: null, error: null };
    if (operacao === "update") {
      Object.assign(registro, copiar(valores));
      registro.atualizado_em = new Date(Date.parse(registro.atualizado_em) + 1).toISOString();
    }
    if (operacao === "delete") registros.delete(registro.id);
    return { data: copiar(registro), error: null };
  }
  const query = {
    select() { return query; },
    eq(campo, valor) { filtros.push([campo, valor]); return query; },
    insert(dados) { operacao = "insert"; valores = dados; return query; },
    update(dados) { operacao = "update"; valores = dados; return query; },
    delete() { operacao = "delete"; return query; },
    maybeSingle() { return Promise.resolve(executar()); },
    then(resolve, reject) { return Promise.resolve(executar()).then(resolve, reject); },
  };
  return query;
};

function certificado(overrides = {}) {
  return {
    id: ID, cliente_id: CLIENTE, tipo: "A1", titular: "Cliente de teste",
    validade: "2027-06-01", status: "renovacao_iniciada", caminho_local: null,
    atualizado_em: "2026-09-01T00:00:00.000Z",
    renovacao_checklist: { tipo: "A1", validade_nova: null, itens: [
      { id: "confirmar_dados", descricao: "Confirmar dados do titular", concluido: false },
      { id: "gerar_novo", descricao: "Gerar novo certificado", concluido: false },
    ] },
    ...overrides,
  };
}

async function chamar(handler, body = {}) {
  const req = { params: { id: ID }, body, usuario: { perfil: "admin_cliente", cliente_id: CLIENTE } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler(req, res);
  return res;
}

beforeEach(() => { registros = new Map([[ID, certificado()]]); proximoId = 0; aposInserir = null; });
after(() => { supabase.from = originalFrom; });

describe("certificados — concorrência e integridade da renovação", () => {
  it("edições simultâneas do cadastro não perdem uma alteração silenciosamente", async () => {
    registros.set(ID, certificado({ status: "ativo", renovacao_checklist: null }));
    const respostas = await Promise.all([
      chamar(editarCertificado, { serial: "SERIAL-A" }),
      chamar(editarCertificado, { serial: "SERIAL-B" }),
    ]);
    assert.deepEqual(respostas.map(r => r.statusCode).sort(), [200, 409]);
  });

  it("duas solicitações para iniciar renovação não reinicializam o mesmo checklist", async () => {
    registros.set(ID, certificado({ status: "ativo", renovacao_checklist: null }));
    const respostas = await Promise.all([chamar(iniciarRenovacaoCertificado), chamar(iniciarRenovacaoCertificado)]);
    assert.deepEqual(respostas.map(r => r.statusCode).sort(), [200, 409]);
  });

  it("edições simultâneas de itens não sobrescrevem silenciosamente o progresso", async () => {
    const respostas = await Promise.all([
      chamar(atualizarRenovacaoCertificado, { itemId: "confirmar_dados", concluido: true }),
      chamar(atualizarRenovacaoCertificado, { itemId: "gerar_novo", concluido: true }),
    ]);
    assert.deepEqual(respostas.map(r => r.statusCode).sort(), [200, 409]);
    const pendente = registros.get(ID).renovacao_checklist.itens.find(item => !item.concluido);
    assert.equal((await chamar(atualizarRenovacaoCertificado, { itemId: pendente.id, concluido: true })).statusCode, 200);
    assert(registros.get(ID).renovacao_checklist.itens.every(item => item.concluido));
  });

  it("duas finalizações concorrentes deixam apenas um certificado substituto", async () => {
    for (const item of registros.get(ID).renovacao_checklist.itens) item.concluido = true;
    const body = { itemId: "confirmar_dados", concluido: true, validade_nova: "2028-06-01" };
    const respostas = await Promise.all([chamar(atualizarRenovacaoCertificado, body), chamar(atualizarRenovacaoCertificado, body)]);
    assert.deepEqual(respostas.map(r => r.statusCode).sort(), [200, 409]);
    assert.equal(registros.size, 2);
    assert.equal([...registros.values()].filter(r => r.status === "ativo").length, 1);
    assert.equal(registros.get(ID).status, "substituido");
  });

  it("compensa a inserção quando a linha original desaparece antes da substituição", async () => {
    for (const item of registros.get(ID).renovacao_checklist.itens) item.concluido = true;
    aposInserir = () => registros.delete(ID);
    const resposta = await chamar(atualizarRenovacaoCertificado, { itemId: "confirmar_dados", concluido: true, validade_nova: "2028-06-01" });
    assert.equal(resposta.statusCode, 409);
    assert.equal(registros.size, 0);
  });

  it("rejeita concluido textual sem marcar o item como concluído", async () => {
    const resposta = await chamar(atualizarRenovacaoCertificado, { itemId: "confirmar_dados", concluido: "false" });
    assert.equal(resposta.statusCode, 400);
    assert.equal(registros.get(ID).renovacao_checklist.itens[0].concluido, false);
  });

  it("revalida a validade armazenada antes de gerar o substituto", async () => {
    const registro = registros.get(ID);
    registro.renovacao_checklist.validade_nova = "2026-06-01";
    registro.renovacao_checklist.itens[0].concluido = true;
    const resposta = await chamar(atualizarRenovacaoCertificado, { itemId: "gerar_novo", concluido: true });
    assert.equal(resposta.statusCode, 400);
    assert.equal(registros.size, 1);
  });

  it("não descarta silenciosamente campos de cadastro com tipos inválidos", async () => {
    const resposta = await chamar(criarCertificado, { tipo: "A1", validade: "2027-06-01", titular: { nome: "Cliente" } });
    assert.equal(resposta.statusCode, 400);
    assert.equal(registros.size, 1);
  });

  it("permite remover explicitamente a data de um agendamento ainda não concluído", async () => {
    const registro = registros.get(ID);
    registro.tipo = "A3";
    registro.renovacao_checklist.itens.push({ id: "agendar_comparecimento", concluido: false, data: "2027-05-01" });
    const resposta = await chamar(atualizarRenovacaoCertificado, { itemId: "agendar_comparecimento", concluido: false, data: null });
    assert.equal(resposta.statusCode, 200);
    assert.equal(registros.get(ID).renovacao_checklist.itens[2].data, null);
  });
});
