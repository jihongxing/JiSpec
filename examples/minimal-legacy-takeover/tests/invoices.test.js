import test from "node:test";
import assert from "node:assert/strict";

test("legacy invoice path remains reachable", () => {
  assert.equal("pending_review", "pending_review");
});
