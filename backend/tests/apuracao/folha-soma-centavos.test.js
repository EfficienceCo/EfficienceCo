// DAS-3: a FS12 de uma apuração não pode depender de qual carga trouxe a folha.
// A criação, o GET e a aprovação carregam só a janela da apuração; a lista
// carrega a união das janelas do cliente. Com a soma em ponto flutuante feita
// em ordens diferentes, as duas davam 1 centavo de diferença (sonda da revisão)
// e a lista dizia "pendente" numa apuração aprovável. Teste puro, sem banco.
//
// Início de atividade em 01/2026, apuração de 09/2026: 8 meses de folha (01 a
// 08/2026). Soma dos 8 meses = 7.390.325 centavos = R$ 73.903,25. FS12
// proporcional aos meses de atividade (LC 123/2006, art. 18 §2º; Res. CGSN
// 140/2018, art. 26): 73.903,25 / 8 × 12 = 110.854,875 → R$ 110.854,88.
import { test } from "node:test";
import assert from "node:assert/strict";
import { folhaDaJanela, montarCargaFolha } from "../../src/controllers/apuracoes.controller.js";
import { LINHAS_FLOAT } from "../fixtures/folha-soma-float.js";

const mesRef = (indice) => `2026-${String(indice + 1).padStart(2, "0")}`;
// Processamentos em criado_em decrescente (01/2026 é o mais recente), e as
// linhas na ordem dos ids (agrupadas por mês), como o banco devolve.
const processamentos = LINHAS_FLOAT.map((_, indice) => ({ id: `p-${mesRef(indice)}`, mes_referencia: `${mesRef(indice)}-01`, status: "concluido" }));
const linhas = LINHAS_FLOAT.flatMap((mes, indice) =>
  mes.map(([base_calculo, fgts]) => ({ processamento_id: `p-${mesRef(indice)}`, base_calculo, fgts })));

test("DAS-3 FS12 em centavos: a carga só da janela e a carga da união das janelas dão a mesma FS12", () => {
  const janela = new Set(LINHAS_FLOAT.slice(0, 8).map((_, indice) => mesRef(indice)));
  const uniao = new Set(LINHAS_FLOAT.map((_, indice) => mesRef(indice)));
  const daJanela = (p) => janela.has(p.mes_referencia.slice(0, 7));

  const so = folhaDaJanela(janela, 8, montarCargaFolha(janela, processamentos.filter(daJanela),
    linhas.filter((l) => janela.has(l.processamento_id.slice(2)))));
  const lista = folhaDaJanela(janela, 8, montarCargaFolha(uniao, processamentos, linhas));

  assert.equal(so.folhaPeriodo, 73903.25);
  assert.equal(so.folha12, 110854.88, "criação, GET e aprovação");
  assert.equal(lista.folha12, 110854.88, "lista");
  assert.equal(lista.folhaPeriodo, so.folhaPeriodo);
});
