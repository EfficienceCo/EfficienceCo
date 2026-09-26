import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ehUuid } from "../src/utils/uuid.util.js";

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
