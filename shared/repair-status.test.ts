import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRepairStatus, migrateRepairTabOrder } from "./repair-status";
import { isBillableRepair } from "./account-statement";

test("retired statuses and current Taller group together", () => {
  for (const status of ["Diagnóstico", "No Entregada", "Taller"]) {
    assert.equal(normalizeRepairStatus(status), "Taller");
  }
  assert.equal(normalizeRepairStatus("Entregada"), "Entregada");
});
test("saved tab order merges old tabs once and retains other tabs", () => {
  const defaults = ["all", "Taller", "Pagada", "Revisión"];
  assert.deepEqual(migrateRepairTabOrder(["all", "No Entregada", "Pagada", "Diagnóstico"], defaults), defaults);
  assert.deepEqual(migrateRepairTabOrder(null, defaults), defaults);
  assert.deepEqual(migrateRepairTabOrder([null, 1, "missing", "Taller", "Taller"], defaults), ["Taller", "all", "Pagada", "Revisión"]);
});
test("renamed diagnosis retains statement behavior including billable review", () => {
  for (const reviewOnly of [true, false]) {
    const repair = { status: "Diagnóstico", reviewOnly, paymentStatus: "No Pagada", total: "100" };
    assert.equal(isBillableRepair(repair), isBillableRepair({...repair, status:"Taller"}));
  }
});
