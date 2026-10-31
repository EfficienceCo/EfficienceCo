import test from "node:test";
import assert from "node:assert/strict";
import { classificarLinha, decidir, ehDocumentacao, lerLinhas, lerStatus } from "../lib/pre-push.mjs";

const ZERO = "0".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

function linha(sobrescrever = {}) {
  return { refLocal: "refs/heads/feat", shaLocal: A, refRemoto: "refs/heads/feat", shaRemoto: B, ...sobrescrever };
}

function decidirUma({ l = linha(), dados = { remotoExiste: true, arquivos: ["backend/src/a.js"] }, head = A, sujos = [] } = {}) {
  return decidir({ linhas: [l], dados: [dados], head, sujos });
}

test("lerLinhas interpreta as linhas do stdin e ignora vazias", () => {
  const texto = `refs/heads/x ${A} refs/heads/x ${ZERO}\r\n\nrefs/tags/v1 ${B} refs/tags/v1 ${ZERO}\n`;
  assert.deepEqual(lerLinhas(texto), [
    { refLocal: "refs/heads/x", shaLocal: A, refRemoto: "refs/heads/x", shaRemoto: ZERO },
    { refLocal: "refs/tags/v1", shaLocal: B, refRemoto: "refs/tags/v1", shaRemoto: ZERO },
  ]);
  assert.throws(() => lerLinhas("lixo"), /Linha inesperada/);
});

test("classificarLinha separa exclusao, tag, branch novo e atualizacao", () => {
  assert.equal(classificarLinha(linha({ refLocal: "(delete)", shaLocal: ZERO })), "exclusao");
  assert.equal(classificarLinha(linha({ refLocal: "refs/tags/v1", refRemoto: "refs/tags/v1" })), "tag");
  assert.equal(classificarLinha(linha({ shaRemoto: ZERO })), "novo");
  assert.equal(classificarLinha(linha()), "atualizacao");
  assert.equal(classificarLinha(linha({ refRemoto: "refs/notes/x" })), "outra-ref");
});

test("ehDocumentacao: *.md, docs/ na raiz e LICENSE; nada mais", () => {
  for (const ok of ["README.md", "backend/LEIAME.md", "docs/arq/foto.png", "LICENSE", "x/Y.MD"]) {
    assert.equal(ehDocumentacao(ok), true, ok);
  }
  for (const nao of ["backend/src/a.js", "frontend/docs/x.js", "docs.js", "LICENSE.js", "a.md.js", "agente/docs"]) {
    assert.equal(ehDocumentacao(nao), false, nao);
  }
});

test("lerStatus lista modificados, nao rastreados e os dois lados de uma renomeacao", () => {
  const saida = [" M backend/a.js", "?? novo.txt", "R  docs/b.md", "backend/b.js", "A  c.js"].join("\0") + "\0";
  assert.deepEqual(lerStatus(saida), ["backend/a.js", "novo.txt", "docs/b.md", "backend/b.js", "c.js"]);
  assert.deepEqual(lerStatus(""), []);
});

test("alteracao de codigo com pasta limpa e no commit enviado: roda", () => {
  const d = decidirUma();
  assert.equal(d.acao, "rodar");
  assert.equal(d.motivo, "codigo-alterado");
});

test("exclusao de branch nao roda nada, mesmo com pasta suja e HEAD diferente", () => {
  const d = decidirUma({ l: linha({ refLocal: "(delete)", shaLocal: ZERO }), dados: {}, head: C, sujos: ["x.js"] });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "nada-a-testar");
});

test("envio de tag nao roda nada", () => {
  const d = decidirUma({ l: linha({ refLocal: "refs/tags/v1", refRemoto: "refs/tags/v1", shaRemoto: ZERO }), dados: {}, head: C });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "nada-a-testar");
});

test("push so de documentacao pula", () => {
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: ["README.md", "docs/a.md", "docs/img/b.png"] } });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "so-documentacao");
});

test("documentacao misturada com codigo roda", () => {
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: ["README.md", "backend/src/a.js"] } });
  assert.equal(d.acao, "rodar");
});

test("renomear ou apagar codigo para dentro de docs nao e 'so docs'", () => {
  // git diff --no-renames lista os dois lados: o caminho antigo de codigo e o novo em docs.
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: ["backend/src/a.js", "docs/a.md"] } });
  assert.equal(d.acao, "rodar");
  assert.equal(decidirUma({ dados: { remotoExiste: true, arquivos: ["backend/src/a.js"] } }).acao, "rodar");
});

test("push sem nenhuma alteracao pula", () => {
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: [] } });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "sem-alteracoes");
});

test("pasta suja recusa e lista os arquivos, inclusive nao rastreados", () => {
  const d = decidirUma({ sujos: ["backend/src/a.js", "novo.test.js"] });
  assert.equal(d.acao, "recusar");
  assert.equal(d.motivo, "pasta-suja");
  assert.match(d.mensagem, /backend\/src\/a\.js/);
  assert.match(d.mensagem, /novo\.test\.js/);
  assert.match(d.mensagem, /--no-verify/);
});

test("lista de arquivos sujos e truncada com a contagem do resto", () => {
  const sujos = Array.from({ length: 25 }, (_, i) => `f${i}.js`);
  const d = decidirUma({ sujos });
  assert.match(d.mensagem, /25 arquivo/);
  assert.match(d.mensagem, /e mais 5/);
  assert.doesNotMatch(d.mensagem, /f24\.js/);
});

test("pasta suja nao importa quando os testes seriam pulados", () => {
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: ["README.md"] }, sujos: ["x.js"] });
  assert.equal(d.acao, "pular");
});

test("commit enviado diferente do HEAD recusa e explica o checkout", () => {
  const d = decidirUma({ l: linha({ refLocal: "refs/heads/feat-ruim", refRemoto: "refs/heads/feat-ruim" }), head: C });
  assert.equal(d.acao, "recusar");
  assert.equal(d.motivo, "commit-diferente-do-head");
  assert.match(d.mensagem, /feat-ruim/);
  assert.match(d.mensagem, /git switch feat-ruim/);
});

test("HEAD diferente tem precedencia sobre pasta suja", () => {
  const d = decidirUma({ head: C, sujos: ["x.js"] });
  assert.equal(d.motivo, "commit-diferente-do-head");
});

test("commit enviado diferente do HEAD nao importa se so ha documentacao", () => {
  const d = decidirUma({ dados: { remotoExiste: true, arquivos: ["docs/a.md"] }, head: C });
  assert.equal(d.acao, "pular");
});

test("branch novo sem origin/main: roda tudo com aviso claro", () => {
  const d = decidirUma({ l: linha({ shaRemoto: ZERO }), dados: { origemMainExiste: false, arquivos: null } });
  assert.equal(d.acao, "rodar");
  assert.equal(d.motivo, "origin-main-ausente");
  assert.match(d.avisos[0], /origin\/main/);
});

test("branch novo comparado com origin/main: so docs pula, codigo roda", () => {
  const novo = linha({ shaRemoto: ZERO });
  assert.equal(decidirUma({ l: novo, dados: { origemMainExiste: true, arquivos: ["README.md"] } }).acao, "pular");
  assert.equal(decidirUma({ l: novo, dados: { origemMainExiste: true, arquivos: ["a.js"] } }).acao, "rodar");
});

test("sha remoto inexistente localmente: roda tudo e explica (nunca 'bad object')", () => {
  const d = decidirUma({ dados: { remotoExiste: false, arquivos: null } });
  assert.equal(d.acao, "rodar");
  assert.equal(d.motivo, "base-remota-desconhecida");
  assert.match(d.avisos[0], /git fetch/);
  assert.match(d.avisos[0], /bbbbbbb/);
});

test("sha remoto inexistente nao deixa pular, mesmo que a pasta esteja suja ou no commit errado", () => {
  assert.equal(decidirUma({ dados: { remotoExiste: false }, sujos: ["x.js"] }).acao, "recusar");
  assert.equal(decidirUma({ dados: { remotoExiste: false }, head: C }).acao, "recusar");
});

test("diff impossivel (sem ancestral comum) roda tudo em vez de pular", () => {
  const d = decidirUma({ l: linha({ shaRemoto: ZERO }), dados: { origemMainExiste: true, arquivos: null } });
  assert.equal(d.acao, "rodar");
  assert.equal(d.motivo, "base-indeterminada");
});

test("varias refs: exclusao + branch do HEAD com codigo roda", () => {
  const d = decidir({
    linhas: [linha({ refLocal: "(delete)", shaLocal: ZERO, refRemoto: "refs/heads/velho" }), linha()],
    dados: [{}, { remotoExiste: true, arquivos: ["a.js"] }],
    head: A,
    sujos: [],
  });
  assert.equal(d.acao, "rodar");
});

test("varias refs (--all): dois branches de codigo em commits diferentes recusam", () => {
  const d = decidir({
    linhas: [linha(), linha({ refLocal: "refs/heads/outra", refRemoto: "refs/heads/outra", shaLocal: C })],
    dados: [{ remotoExiste: true, arquivos: ["a.js"] }, { remotoExiste: true, arquivos: ["b.js"] }],
    head: A,
    sujos: [],
  });
  assert.equal(d.acao, "recusar");
  assert.equal(d.motivo, "commit-diferente-do-head");
  assert.match(d.mensagem, /outra \(ccccccc\)/);
});

test("varias refs: docs em um branch e codigo em outro roda pelo de codigo", () => {
  const d = decidir({
    linhas: [linha({ refLocal: "refs/heads/docs", refRemoto: "refs/heads/docs", shaLocal: C }), linha()],
    dados: [{ remotoExiste: true, arquivos: ["README.md"] }, { remotoExiste: true, arquivos: ["a.js"] }],
    head: A,
    sujos: [],
  });
  assert.equal(d.acao, "rodar");
});

test("varias refs: avisos de todas as refs sao reunidos", () => {
  const d = decidir({
    linhas: [linha(), linha({ refLocal: "refs/heads/b", refRemoto: "refs/heads/b", shaRemoto: ZERO })],
    dados: [{ remotoExiste: false }, { origemMainExiste: false }],
    head: A,
    sujos: [],
  });
  assert.equal(d.avisos.length, 2);
});

test("ref que nao e branch nem tag (refs/notes) e ignorada: pula sem exigir pasta limpa nem HEAD", () => {
  const d = decidirUma({ l: linha({ refLocal: "refs/notes/x", refRemoto: "refs/notes/x" }), dados: {}, head: C, sujos: ["x.js"] });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "nada-a-testar");
  assert.match(d.mensagem, /outra ref/);
});

test("stdin vazio (git push 'Everything up-to-date') pula com mensagem generica", () => {
  const d = decidir({ linhas: [], dados: [], head: A, sujos: ["x.js"] });
  assert.equal(d.acao, "pular");
  assert.equal(d.motivo, "nada-a-testar");
  assert.match(d.mensagem, /nada a enviar/);
});
