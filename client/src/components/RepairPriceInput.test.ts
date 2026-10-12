import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepairPriceDraft } from "./RepairPriceInput";

test("clearing zero and typing a replacement does not lose intermediate decimals", () => {
  const sequence = ["0", "", "1", "1.", "1.5", "1.50"];
  assert.deepEqual(sequence.map(parseRepairPriceDraft), [0, 0, 1, 1, 1.5, 1.5]);
});
test("mobile comma decimals, empty and leading decimal are supported", () => {
  assert.equal(parseRepairPriceDraft("125,50"), 125.5);
  assert.equal(parseRepairPriceDraft(""), 0);
  assert.equal(parseRepairPriceDraft("."), 0);
  assert.equal(parseRepairPriceDraft(".5"), 0.5);
  assert.equal(parseRepairPriceDraft(",5"), 0.5);
});
test("negative, malformed and nonfinite prices are not accepted", () => {
  for (const text of ["-1", "abc", "1.2.3", "1,2,3", "1e3", "9".repeat(400)]) {
    assert.equal(parseRepairPriceDraft(text), null);
  }
});
