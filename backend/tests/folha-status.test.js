// Lógica pura dos helpers de status/download da Folha (sem banco, sem Express): nome de exibição sem CPF,
// lista de arquivos com id opaco, resolução do download, descrição e totais. As rotas e o banco (status,
// download, evento e notificação de conclusão) são testados com HTTP e banco real em tests/folha/ (TEST-FOLHA-2, #750).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nomeArquivoDePath,
  montarListaArquivos,
  arquivosParaResposta,
  resolverArquivoDownload,
  nomeExibicaoHolerite,
  montarDescricaoConclusao,
  calcularTotaisProcessamento,
} from "../src/services/folha-status.helpers.js";

const CPF_EXEMPLO = "529.982.247-25";
const REGEX_CPF = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}|\d{11}/;

describe("folha-status helpers", () => {
  it("extrai basename do path de storage", () => {
    assert.equal(
      nomeArquivoDePath("clientes/x/2026-07/p/holerites/holerite_a.pdf"),
      "holerite_a.pdf",
    );
    assert.equal(nomeArquivoDePath(null), null);
  });

  it("nome de exibição do holerite não carrega CPF (LGPD)", () => {
    const nome = nomeExibicaoHolerite({
      empresa: "Padaria do Zé",
      funcionario: "João da Silva",
      cpf: CPF_EXEMPLO,
    });

    assert.equal(nome, "holerite_padaria_do_ze_joao_da_silva.pdf");
    assert.doesNotMatch(nome, REGEX_CPF);
  });

  it("monta lista com id opaco + nome sem CPF e omite path na resposta pública", () => {
    const arquivos = montarListaArquivos(
      [
        {
          id: "calc-1",
          empresa: "Padaria",
          funcionario: "João",
          holerite_path: `a/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`,
        },
        { id: "calc-2", holerite_path: null },
      ],
      [{ id: "rel-1", arquivo_path: "a/relatorios/relatorio_fechamento_padaria_2026-07.pdf" }],
    );

    const resposta = arquivosParaResposta(arquivos);

    assert.deepEqual(resposta, [
      { id: "calc-1", nome: "holerite_padaria_joao.pdf", tipo: "holerite" },
      { id: "rel-1", nome: "relatorio_fechamento_padaria_2026-07.pdf", tipo: "relatorio" },
    ]);
    // Nada na resposta pública pode conter CPF nem o path de storage.
    assert.doesNotMatch(JSON.stringify(resposta), REGEX_CPF);
    assert.ok(resposta.every((a) => a.path === undefined));
  });

  it("resolve download só pelo id opaco, escopo do processamento, e rejeita traversal/CPF", () => {
    const path = `clientes/c/p/holerites/holerite_padaria_joao_${CPF_EXEMPLO}_2026-07.pdf`;
    const arquivos = montarListaArquivos(
      [{ id: "calc-1", empresa: "Padaria", funcionario: "João", holerite_path: path }],
      [],
    );

    assert.deepEqual(resolverArquivoDownload("calc-1", arquivos), {
      id: "calc-1",
      nome: "holerite_padaria_joao.pdf",
      tipo: "holerite",
      path,
    });
    // O nome do arquivo / CPF não são mais aceitos como identificador.
    assert.equal(resolverArquivoDownload("holerite_padaria_joao.pdf", arquivos), null);
    assert.equal(resolverArquivoDownload(CPF_EXEMPLO, arquivos), null);
    assert.equal(resolverArquivoDownload("../calc-1", arquivos), null);
    assert.equal(resolverArquivoDownload("holerites/calc-1", arquivos), null);
    assert.equal(resolverArquivoDownload("calc-2", arquivos), null);
  });

  it("monta descrição e totais de funcionários/empresas", () => {
    assert.equal(
      montarDescricaoConclusao(12, 3),
      "Folha processada — 12 funcionários, 3 empresas",
    );

    assert.deepEqual(
      calcularTotaisProcessamento([
        { empresa: "A" },
        { empresa: "A" },
        { empresa: "B" },
      ]),
      { total_funcionarios: 3, total_empresas: 2 },
    );
  });
});
