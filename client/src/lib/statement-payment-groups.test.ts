import assert from "node:assert/strict";
import test from "node:test";
import { getStatementPaymentGroups, statementPaymentGroupRows } from "./statement-payment-groups";
import { getStatementPaymentDetail } from "./statement-payment-detail";
import { partialPaymentSchema, reportPaymentInsertSchema, reportPaymentUpdateSchema } from "../../../shared/schema";

const groupId = "53a1c6df-768f-4d1b-aacf-b76c6d5c5b5c";
const reports = [
  { id: 21, folioReporte: "FOL-21", payments: [
    { id: 789, amount: "3750.00", paymentDate: "2026-10-20", paymentMethod: "transferencia" },
    { id: 797, amount: "5700.00", paymentDate: "2026-10-26", paymentMethod: "efectivo", paymentGroupId: groupId },
  ] },
  { id: 22, folioReporte: "FOL-22", payments: [
    { id: 798, amount: "6300.00", paymentDate: "2026-10-26", paymentMethod: "efectivo", paymentGroupId: groupId },
  ] },
];

test("explicit identity links the allocations across paid and pending folios", () => {
  const groups = getStatementPaymentGroups(reports);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total, 12000);
  assert.deepEqual(groups[0].allocations.map((row) => row.folio), ["FOL-21", "FOL-22"]);
  assert.match(statementPaymentGroupRows(reports).flat().join("\n"), /FOL-21: \$5,700\.00 — 26\/10\/2026 — Efectivo/);
  assert.match(getStatementPaymentDetail(reports[0].payments, 9450).tableText, /PG-53a1c6df/);
});

test("same dates, timestamps, methods and references do not establish historical grouping", () => {
  const historical = reports.map((report) => ({
    ...report,
    payments: report.payments.map((payment) => ({
      ...payment, paymentGroupId: null,
      reference: "MISMA REFERENCIA", createdAt: "2026-10-26T18:08:17.190228Z",
    })),
  }));
  assert.deepEqual(getStatementPaymentGroups(historical), []);
  assert.match(getStatementPaymentDetail(historical[0].payments, 9450).tableText, /\$3,750\.00/);
  assert.doesNotMatch(getStatementPaymentDetail(historical[0].payments, 9450).tableText, /PG-/);
});

test("two receipts on the same date stay separate and malformed amounts are ignored", () => {
  const groups = getStatementPaymentGroups([{
    id: 1, folioReporte: "FOL-1", payments: [
      { id: 1, amount: ".10", paymentDate: "2026-10-26", paymentGroupId: "a" },
      { id: 2, amount: ".20", paymentDate: "2026-10-26", paymentGroupId: "a" },
      { id: 3, amount: "1", paymentDate: "2026-10-26", paymentGroupId: "b" },
      { id: 4, amount: "NaN", paymentGroupId: "a" },
    ],
  }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].total, .30);
  assert.equal(groups[0].allocations.length, 2);
});

test("repeated report inputs do not double count persisted payment rows", () => {
  assert.equal(getStatementPaymentGroups([...reports, ...reports])[0].total, 12000);
});

test("deleted applications are not reconstructed as original received money", () => {
  const groups = getStatementPaymentGroups([reports[1]]);
  assert.equal(groups[0].total, 6300);
  assert.equal(groups[0].allocations.length, 1);
  assert.match(statementPaymentGroupRows([reports[1]]).flat().join("\n"), /Total aplicado registrado: \$6,300\.00/);
});

test("a client cannot forge or edit the server-owned group identity", () => {
  const parsed = reportPaymentInsertSchema.parse({
    reportId: 1, amount: "10.00", paymentDate: new Date(),
    paymentMethod: "efectivo", createdBy: "test", paymentGroupId: groupId,
  });
  assert.ok(!("paymentGroupId" in parsed));
  assert.equal(reportPaymentUpdateSchema.safeParse({ paymentGroupId: groupId }).success, false);
  assert.equal(partialPaymentSchema.safeParse({
    paymentDate: "2026-10-26", paymentMethod: "efectivo", totalAmount: 10,
    allocations: [{ reportId: 1, amount: 10 }], paymentGroupId: groupId,
  }).success, false);
});
