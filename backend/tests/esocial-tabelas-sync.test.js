import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TP_JORNADA as TP_JORNADA_BACK } from "../src/utils/esocial-xml.util.js";
import { TP_JORNADA as TP_JORNADA_FRONT } from "../../frontend/src/lib/esocial-tabelas.js";

// Bug #436 (reconciliação de tabelas de domínio): o formulário do wizard
// (frontend) e o gerador de XML (backend/src/utils/esocial-xml.util.js) mantêm
// listas de domínio próprias. Se o front oferecer um código que o back
// rejeita, o usuário só descobre no submit (ErroXmlESocial); se o back aceitar
// um código que o front nunca mostra, esse tipo de jornada fica inacessível
// no produto. Este teste garante que as duas fontes ficam sincronizadas.
describe("TP_JORNADA — sincronia front/back", () => {
  it("todo código oferecido pelo front é aceito pelo gerador de XML do back", () => {
    for (const opcao of TP_JORNADA_FRONT) {
      const codigo = Number(opcao.value);
      assert.ok(
        TP_JORNADA_BACK.has(codigo),
        `front oferece tpJornada=${opcao.value}, mas o back não aceita`,
      );
    }
  });

  it("todo código aceito pelo back está disponível como opção no front", () => {
    const codigosFront = new Set(TP_JORNADA_FRONT.map((o) => Number(o.value)));
    for (const codigo of TP_JORNADA_BACK) {
      assert.ok(
        codigosFront.has(codigo),
        `back aceita tpJornada=${codigo}, mas o front não oferece essa opção`,
      );
    }
  });
});
