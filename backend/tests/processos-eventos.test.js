import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  montarDescricaoEventoEtapa,
  registrarEventoEtapa,
} from "../src/services/processos-eventos.service.js";

describe("processos-eventos.service — montarDescricaoEventoEtapa (#489)", () => {
  it("sucesso criar_pastas", () => {
    assert.equal(
      montarDescricaoEventoEtapa({
        acao: "criar_pastas",
        nomeEmpresa: "Souza",
        sucesso: true,
      }),
      "Estrutura de pastas criada para Souza",
    );
  });

  it("sucesso gerar_contrato_social", () => {
    assert.equal(
      montarDescricaoEventoEtapa({
        acao: "gerar_contrato_social",
        nomeEmpresa: "Padaria",
        sucesso: true,
      }),
      "Contrato social gerado para Padaria",
    );
  });

  it("falha inclui ação, empresa e erro", () => {
    assert.equal(
      montarDescricaoEventoEtapa({
        acao: "criar_pastas",
        nomeEmpresa: "Souza",
        sucesso: false,
        erro: "Sem permissão",
      }),
      "Falha ao processar etapa criar_pastas (Souza): Sem permissão",
    );
  });
});

describe("processos-eventos.service — registrarEventoEtapa (#489)", () => {
  it("insere evento e dispara notificação", async () => {
    const inserts = [];
    const notificacoes = [];
    const supabase = {
      from(tabela) {
        assert.equal(tabela, "eventos");
        return {
          insert(row) {
            inserts.push(row);
            return Promise.resolve({ data: row, error: null });
          },
        };
      },
    };

    const resultado = await registrarEventoEtapa(
      supabase,
      {
        clienteId: "cli-1",
        acao: "criar_pastas",
        nomeEmpresa: "Souza",
        sucesso: true,
      },
      {
        criarNotificacao: async (clienteId, tipo, mensagem) => {
          notificacoes.push({ clienteId, tipo, mensagem });
        },
      },
    );

    assert.equal(resultado.registrado, true);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].sucesso, true);
    assert.equal(notificacoes[0].tipo, "arquivo_processado");
  });

  it("falha de insert não propaga e marca registrado=false", async () => {
    const supabase = {
      from() {
        return {
          insert() {
            return Promise.resolve({ data: null, error: { message: "db down" } });
          },
        };
      },
    };

    const resultado = await registrarEventoEtapa(supabase, {
      clienteId: "cli-1",
      acao: "criar_pastas",
      nomeEmpresa: "Souza",
      sucesso: true,
    });

    assert.equal(resultado.registrado, false);
  });
});
