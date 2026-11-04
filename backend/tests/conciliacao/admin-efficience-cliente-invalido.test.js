// TEST-9 (#686): admin_efficience escolhe o escritório por cliente_id (query, body ou formulário).
// Um cliente_id que não existe, ou que não é UUID, tem de dar resposta de cliente (404/400/lista
// vazia), nunca 500 de banco. admin_cliente e funcionario não passam por aqui: o escritório deles
// vem do token. Mesma classe do PRB-C-48 (POST /lancamentos-contabeis, em lancamentos-contabeis.test.js).
//
// Decisões do teste (o produto pode trocá-las, o invariante "nunca 500, banco intacto" vale sempre):
//  - cliente_id que não existe: escrita dá 404 "Cliente não encontrado"; leitura dá 200 vazio
//    (é o que GET /lancamentos-contabeis e GET /conciliacoes/extrato já fazem hoje);
//  - cliente_id que não é UUID: 400 (como GET /lancamentos-contabeis: "clienteId deve ser um UUID").
// Os casos que hoje dão 500 ficam com `conhecido` (PRB-C-48); os que já respondem certo rodam.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  iniciarBateria, fotografar, chamar, ator, formularioOfx, montarOfx, OFX_NOVEMBRO, conhecido, UUID_INEXISTENTE, PERFIL,
} from "../helpers/conciliacao-http.js";

const MOTIVO = "BUG PRB-C-48 (achado novo, sem issue; precisa de issue `bug`): admin_efficience com cliente_id inválido chega ao banco e a resposta é 500";

describe("TEST-9: admin_efficience com cliente_id inexistente ou que não é UUID", { timeout: 300_000 }, () => {
  let bateria; let api; let banco; let A;
  before(async () => { bateria = await iniciarBateria(); api = bateria.api; });
  after(() => bateria.encerrar());
  beforeEach(async () => { ({ banco, A } = await bateria.recriar()); });

  // Ator admin_efficience "escolhendo" o cliente informado (chamar() acrescenta o cliente_id dele).
  const escolhendo = clienteId => ({ perfil: PERFIL.EFFICIENCE, usuario: A.usuario(PERFIL.EFFICIENCE), escritorio: { cliente: { id: clienteId } } });
  let INEXISTENTE; let NAO_UUID;
  beforeEach(() => { INEXISTENTE = escolhendo(UUID_INEXISTENTE); NAO_UUID = escolhendo("abc"); });

  const enviar = quem => chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes/extrato", formulario: formularioOfx(montarOfx(OFX_NOVEMBRO)) });

  describe("POST /conciliacoes/extrato", () => {
    it("cliente_id que não existe: 404 'Cliente não encontrado' e nada é gravado (PRB-C-48)", conhecido(MOTIVO), async () => {
      const antes = await fotografar(banco);
      const resposta = await enviar(INEXISTENTE);
      assert.equal(resposta.status, 404, `devolveu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
      assert.deepEqual(await fotografar(banco), antes);
    });

    it("cliente_id que não é UUID: 400 e nada é gravado (PRB-C-48)", conhecido(MOTIVO), async () => {
      const antes = await fotografar(banco);
      const resposta = await enviar(NAO_UUID);
      assert.equal(resposta.status, 400, `devolveu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
      assert.deepEqual(await fotografar(banco), antes);
    });
  });

  describe("GET /conciliacoes/extrato", () => {
    it("cliente_id que não existe: 200 com extrato null", async () => {
      const resposta = await chamar(api, INEXISTENTE, { caminho: "/conciliacoes/extrato?mes=11&ano=2026" });
      assert.deepEqual([resposta.status, resposta.corpo], [200, { extrato: null }]);
    });

    it("cliente_id que não é UUID: 400 (PRB-C-48)", conhecido(MOTIVO), async () => {
      const resposta = await chamar(api, NAO_UUID, { caminho: "/conciliacoes/extrato?mes=11&ano=2026" });
      assert.equal(resposta.status, 400, `devolveu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
    });
  });

  describe("GET /conciliacoes", () => {
    it("cliente_id que não existe: 200 com lista vazia", async () => {
      const resposta = await chamar(api, INEXISTENTE, { caminho: "/conciliacoes" });
      assert.deepEqual([resposta.status, resposta.corpo], [200, []]);
    });

    it("cliente_id que não é UUID: 400 (PRB-C-48)", conhecido(MOTIVO), async () => {
      const resposta = await chamar(api, NAO_UUID, { caminho: "/conciliacoes" });
      assert.equal(resposta.status, 400, `devolveu ${resposta.status}: ${JSON.stringify(resposta.corpo)}`);
    });
  });

  // As rotas abaixo já respondem sem 500: ficam como rede para a decisão não regredir.
  describe("rotas que já respondem certo", () => {
    for (const [nome, clienteId, esperado] of [
      ["cliente_id que não existe", UUID_INEXISTENTE, 404],
      ["cliente_id que não é UUID", "abc", 404],
    ]) {
      it(`POST /conciliacoes com ${nome}: 404 'Extrato bancário não encontrado', sem sessão nova`, async () => {
        const quem = escolhendo(clienteId);
        const antes = await fotografar(banco);
        const resposta = await chamar(api, quem, { metodo: "POST", caminho: "/conciliacoes", corpo: { extrato_id: A.extrato.processado, mes: 10, ano: 2026 } });
        assert.deepEqual([resposta.status, resposta.corpo], [esperado, { erro: "Extrato bancário não encontrado" }]);
        assert.deepEqual(await fotografar(banco), antes);
      });

      it(`GET /conciliacoes/extrato/:id/transacoes com ${nome}: 404 'Extrato bancário não encontrado'`, async () => {
        const quem = escolhendo(clienteId);
        const resposta = await chamar(api, quem, { caminho: `/conciliacoes/extrato/${A.extrato.processado}/transacoes` });
        assert.deepEqual([resposta.status, resposta.corpo], [esperado, { erro: "Extrato bancário não encontrado" }]);
      });

      it(`rotas de uma sessão do A com ${nome}: 404 'Conciliação não encontrada' e banco intacto`, async () => {
        const quem = escolhendo(clienteId);
        const antes = await fotografar(banco);
        for (const { metodo = "GET", caminho } of [
          { caminho: `/conciliacoes/${A.sessaoAberta}` },
          { caminho: `/conciliacoes/${A.sessaoConcluida}/relatorio` },
          { metodo: "PATCH", caminho: `/conciliacoes/${A.sessaoAberta}/pares/${A.parAberto(4)}/confirmar` },
          { metodo: "PATCH", caminho: `/conciliacoes/${A.sessaoAberta}/pares/${A.parAberto(4)}/rejeitar` },
          { metodo: "POST", caminho: `/conciliacoes/${A.sessaoAberta}/concluir` },
        ]) {
          const resposta = await chamar(api, quem, { metodo, caminho });
          assert.deepEqual([resposta.status, resposta.corpo], [404, { erro: "Conciliação não encontrada" }], `${metodo} ${caminho}`);
        }
        assert.deepEqual(await fotografar(banco), antes);
      });
    }

    it("GET /lancamentos-contabeis: cliente que não existe dá 200 vazio e o que não é UUID dá 400", async () => {
      const vazio = await chamar(api, INEXISTENTE, { caminho: "/lancamentos-contabeis", clienteIdCamelCase: true });
      assert.deepEqual([vazio.status, vazio.corpo], [200, []]);
      const naoUuid = await api.requisitar("/lancamentos-contabeis?clienteId=abc", { usuario: A.usuario(PERFIL.EFFICIENCE) });
      assert.deepEqual([naoUuid.status, naoUuid.corpo], [400, { erro: "clienteId deve ser um UUID" }]);
    });
  });
});
