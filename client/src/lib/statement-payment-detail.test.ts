import assert from "node:assert/strict";
import test from "node:test";
import { getStatementPaymentDetail } from "./statement-payment-detail";

test("FOL-17 preserves both payment amounts and dates in chronological order", () => {
  const result = getStatementPaymentDetail([
    { id: 2, amount: "6276.00", paymentDate: "2026-10-19T18:00:00.000Z" },
    { id: 1, amount: "4152.00", paymentDate: "2026-08-05T18:00:00.000Z" },
  ], 10428);
  assert.equal(result.tableText,
    "$4,152.00 — 05/08/2026\n$6,276.00 — 19/10/2026\nTotal: $10,428.00");
  assert.match(result.noteText, /\$4,152\.00 — 05\/08\/2026; \$6,276\.00 — 19\/10\/2026/);
  assert.doesNotMatch(result.noteText, /recibió un abono de \$10,428/);
});

test("uses paymentDate, never the creation date or report date", () => {
  const payment = {
    amount: "4152.00",
    paymentDate: "2026-08-05",
    createdAt: "2026-10-19T18:00:00Z",
  };
  const result = getStatementPaymentDetail([payment], 4152);
  assert.match(result.tableText, /05\/08\/2026/);
  assert.doesNotMatch(result.tableText, /19\/10\/2026/);
});

test("payment timestamps use Mexico date regardless of the browser timezone", () => {
  const result = getStatementPaymentDetail([
    { amount: 10, paymentDate: "2026-08-06T02:00:00Z" },
  ], 10);
  assert.match(result.tableText, /05\/08\/2026/);
});

test("missing or invalid dates are explicit and do not hide a payment", () => {
  for (const value of [null, undefined, "invalid", "2026-02-31", "2026-02-31T12:00:00Z"]) {
    const result = getStatementPaymentDetail([{ amount: "15.00", paymentDate: value }], 15);
    assert.match(result.tableText, /\$15\.00 — Fecha no registrada/);
  }
});

test("missing payment ledger does not invent dated payments", () => {
  assert.equal(getStatementPaymentDetail(undefined, 0).tableText, "$0.00");
  assert.equal(getStatementPaymentDetail([], 150).tableText,
    "$150.00\nSin desglose registrado");
});

test("same-date payments remain separate and cent sums stay exact", () => {
  const result = getStatementPaymentDetail([
    { amount: "0.10", paymentDate: "2026-08-05" },
    { amount: "0.20", paymentDate: "2026-08-05" },
  ], 0.30);
  assert.equal(result.tableText.split("\n").length, 3);
  assert.doesNotMatch(result.tableText, /no coincide/);
});

test("a summary discrepancy is disclosed, not used to recalculate financial totals", () => {
  const result = getStatementPaymentDetail([
    { amount: 50, paymentDate: "2026-08-05" },
  ], 100);
  assert.match(result.tableText, /Total: \$100\.00/);
  assert.match(result.noteText, /no coincide/);
});
