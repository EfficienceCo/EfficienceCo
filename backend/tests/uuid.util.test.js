import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ehUuid, ehUuidV4 } from "../src/utils/uuid.util.js";

describe("ehUuid", () => {
  it("aceita UUID hex com hífens, em qualquer caixa", () => {
    assert.equal(ehUuid("11111111-1111-1111-1111-111111111111"), true);
    assert.equal(ehUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"), true);
  });

  it("recusa texto, UUID sem hífen e valor que não é string", () => {
    assert.equal(ehUuid("abc"), false);
    assert.equal(ehUuid("11111111111111111111111111111111"), false);
    assert.equal(ehUuid(""), false);
    assert.equal(ehUuid(null), false);
    assert.equal(ehUuid(undefined), false);
  });
});

describe("ehUuidV4", () => {
  it("aceita só versão 4 com variante RFC", () => {
    assert.equal(ehUuidV4("550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(ehUuidV4("11111111-1111-4111-8111-111111111111"), true);
  });

  it("recusa UUID genérico que o Postgres aceitaria", () => {
    assert.equal(ehUuid("11111111-1111-1111-1111-111111111111"), true);
    assert.equal(ehUuidV4("11111111-1111-1111-1111-111111111111"), false);
    assert.equal(ehUuidV4("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), false);
  });
});
