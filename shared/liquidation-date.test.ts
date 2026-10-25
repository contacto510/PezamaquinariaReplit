import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportLiquidationDate,
  repairLiquidationDate,
  UNRECORDED_LIQUIDATION_DATE,
} from "./liquidation-date";

test("partial payments only date the entry that first completes the total, ordered by createdAt then id", () => {
  assert.equal(reportLiquidationDate({
    total: "100.01",
    payments: [
      { id: 4, amount: "0.01", createdAt: "2026-09-03T12:00:00Z" },
      { id: 3, amount: "60.00", createdAt: "2026-09-02T12:00:00Z" },
      { id: 2, amount: "40.00", createdAt: "2026-09-02T12:00:00Z" },
    ],
  }), "03/09/2026");
});

test("zero, insufficient, absent and nontrusted records never manufacture a date", () => {
  const payment = { id: 1, amount: "99.99", createdAt: "2026-09-02T12:00:00Z" };
  const manuallyPaid = { total: "100", paymentStatus: "pagado", payments: [payment] };
  assert.equal(reportLiquidationDate(manuallyPaid), UNRECORDED_LIQUIDATION_DATE);
  for (const report of [
    { total: "0", payments: [payment] },
    { total: "100", payments: [payment] },
    { total: "100", payments: [] },
    { total: "100" },
    { total: "100", payments: [payment, { id: 2, amount: "0.01", createdAt: null }] },
    { total: "100", payments: [{ ...payment, amount: "100", createdAt: "2026-09-02" }] },
    { total: "100", payments: [{ ...payment, amount: "100" }, { ...payment, id: 2, amount: "-1" }] },
  ]) {
    assert.equal(reportLiquidationDate(report), UNRECORDED_LIQUIDATION_DATE);
  }
});

test("final payment wins over a later overpayment; declared paymentDate is irrelevant", () => {
  const entries = [
    { id: 3, amount: "200", createdAt: "2026-09-05T18:00:00Z" },
    { id: 2, amount: "30", createdAt: "2026-09-03T18:00:00Z", paymentDate: "2025-01-01T12:00:00Z" },
    { id: 1, amount: "50", createdAt: "2026-09-01T18:00:00Z" },
  ];
  assert.equal(reportLiquidationDate({
    total: "80",
    payments: entries,
  }), "03/09/2026");
});

test("Mexico City calendar day is used across UTC midnight", () => {
  assert.equal(reportLiquidationDate({
    total: "0.01",
    payments: [{ id: 1, amount: "0.01", createdAt: "2026-09-02T02:00:00Z" }],
  }), "01/09/2026");
  assert.equal(repairLiquidationDate("2026-09-02T18:00:00Z"), "02/09/2026");
});

test("repairs without a trustworthy liquidation timestamp keep the unknown label", () => {
  assert.equal(repairLiquidationDate(null), UNRECORDED_LIQUIDATION_DATE);
  assert.equal(repairLiquidationDate(""), UNRECORDED_LIQUIDATION_DATE);
  assert.equal(repairLiquidationDate("2026-09-02"), UNRECORDED_LIQUIDATION_DATE);
});