import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairDashboardSnapshot, selectRepairDashboard, type RepairDashboardSource } from "./repair-dashboard";
import { summarizeAccountStatement } from "./account-statement";

const now = new Date("2026-10-25T18:00:00Z");
const base: RepairDashboardSource = {
  id: 1, repairNumber: "R-1", equipment: "Generador",
  clientId: 1, client: { name: "Cliente A" }, repairManager: "Técnico A",
  status: "En Proceso", paymentStatus: "No Pagada", total: "1160.00",
  receivedDate: "2026-08-05T00:00:00Z", includeIVA: true,
};
function snapshot(overrides: Partial<RepairDashboardSource>[]) {
  return buildRepairDashboardSnapshot(overrides.map((entry, index) =>
    ({ ...base, id: index + 1, ...entry })), now);
}

test("snapshot amounts match the client account statement, quotes never become debt", () => {
  const sources = [
    base,
    { ...base, id: 2, paymentStatus: "Pagada" },
    { ...base, id: 3, paymentStatus: "Cotización", total: "9000.00" },
    { ...base, id: 4, status: "Taller" },
    { ...base, id: 5, status: "No autorizado" },
    { ...base, id: 6, status: "Taller", reviewOnly: true, total: "232.00", reviewAmount: "200.00" },
  ];
  const { entries } = buildRepairDashboardSnapshot(sources, now);
  const dashboard = selectRepairDashboard(entries);
  const account = summarizeAccountStatement([], sources);
  assert.equal(dashboard.summary.pendingAmount, account.totalPendingAmount);
  assert.equal(dashboard.summary.paidAmount, account.totalPaidAmount);
  assert.equal(dashboard.summary.pendingCount, 2);
  assert.equal(dashboard.summary.quoteAmount, 9000);
  assert.equal(dashboard.groups.quotes[0].pending, 0);
  assert.equal(dashboard.groups.quotes[0].paid, 0);
});

test("date filters affect actual activity dates but never hide an old current receivable", () => {
  const { entries } = snapshot([
    {},
    { paymentStatus: "Pagada", liquidatedAt: "2026-10-19T18:00:00Z" },
    { paymentStatus: "Pagada", liquidatedAt: null },
    { status: "Entregada", deliveryDate: "2026-10-22T00:00:00Z" },
  ]);
  const result = selectRepairDashboard(entries, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(result.summary.receivedCount, 0);
  assert.equal(result.summary.deliveredCount, 1);
  assert.equal(result.summary.liquidatedCount, 1);
  assert.equal(result.summary.undatedCount, 1);
  assert.equal(result.summary.pendingAmount, 2320);
  assert.equal(result.summary.paidAmount, 2320);
  assert.equal(result.summary.deliveredUnpaidCount, 1);
  assert.equal(result.groups.ready.length, 0);
});

test("review fee is included once, not added to the order total", () => {
  const { entries } = snapshot([
    { total: "232.00", reviewOnly: true, reviewAmount: "200.00", status: "Taller" },
    { total: "1392.00", reviewAmount: "200.00" },
    { total: "1200.00", reviewAmount: "200.00", includeIVA: false },
  ]);
  const { summary } = selectRepairDashboard(entries);
  assert.equal(summary.pendingAmount, 2824);
  assert.equal(summary.reviewAmount, 664);
  assert.equal(summary.reviewCount, 3);
});

test("client, responsible and status filters apply consistently to every group", () => {
  const { entries } = snapshot([
    { clientId: 1, status: "Terminada" },
    { clientId: 2, client: { name: "Cliente B" }, repairManager: "Técnico B" },
    { clientId: null, client: null, repairManager: null },
  ]);
  assert.equal(selectRepairDashboard(entries, { clientId: "1" }).summary.totalCount, 1);
  assert.equal(selectRepairDashboard(entries, { manager: "Técnico B" }).summary.totalCount, 1);
  assert.equal(selectRepairDashboard(entries, { status: "Terminada" }).summary.readyCount, 1);
  const unassigned = selectRepairDashboard(entries, { clientId: "unassigned", manager: "unassigned" });
  assert.equal(unassigned.summary.unassignedPendingCount, 1);
  assert.equal(unassigned.groups.all[0].clientName, "Sin cliente vinculado");
});

test("legacy workshop display normalization never rewrites account eligibility", () => {
  const { entries } = snapshot([
    { status: "Diagnóstico" },
    { status: "No Entregada" },
    { status: "Taller" },
  ]);
  assert.ok(entries.every((entry) => entry.status === "Taller"));
  assert.deepEqual(entries.map((entry) => entry.billable), [false, true, false]);
  assert.equal(selectRepairDashboard(entries).operations.find((entry) => entry.status === "Taller")!.count, 3);
});

test("business dates stay UTC while liquidation dates follow Mexico and missing dates stay missing", () => {
  const { entries } = snapshot([
    { paymentStatus: "Pagada", receivedDate: "2026-08-05T00:00:00Z", liquidatedAt: "2026-10-20T02:00:00Z" },
    { paymentStatus: "Pagada", receivedDate: null, liquidatedAt: null },
  ]);
  assert.equal(entries[0].receivedDay, "2026-08-05");
  assert.equal(entries[0].liquidationDay, "2026-10-19");
  assert.equal(entries[0].ageDays, 81);
  assert.equal(entries[1].receivedDay, null);
  assert.equal(entries[1].liquidationDay, null);
  assert.equal(entries[1].ageDays, null);
  const filtered = selectRepairDashboard(entries, { from: "2026-10-19", to: "2026-10-19" });
  assert.equal(filtered.summary.liquidatedCount, 1);
});

test("more than 500 repairs contribute to totals; no truncation from order-list pagination", () => {
  const { entries } = snapshot(Array.from({ length: 620 }, () => ({ total: "0.10" })));
  const { summary } = selectRepairDashboard(entries);
  assert.equal(summary.totalCount, 620);
  assert.equal(summary.pendingCount, 620);
  assert.equal(summary.pendingAmount, 62);
});

test("oldest unfinished equipment first; closed or rejected orders are not open work", () => {
  const { entries } = snapshot([
    { receivedDate: "2026-10-01", status: "Terminada" },
    { receivedDate: "2026-09-01", status: "En Proceso" },
    { receivedDate: "2026-08-01", status: "Entregada" },
    { receivedDate: "2026-07-01", status: "No autorizado" },
    { receivedDate: "2026-10-30", status: "Taller" },
  ]);
  const { groups } = selectRepairDashboard(entries);
  assert.deepEqual(groups.older.map((entry) => entry.id), [2, 1, 5]);
  assert.equal(entries[4].ageDays, 0);
});

test("empty dashboard is explicit zero without fake activity", () => {
  const { summary, groups } = selectRepairDashboard([]);
  assert.equal(summary.pendingAmount, 0);
  assert.equal(summary.liquidatedCount, 0);
  assert.equal(groups.all.length, 0);
});
