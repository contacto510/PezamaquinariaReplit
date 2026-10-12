import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccountsReceivable } from "./accounts-receivable";
import { summarizeAccountStatement } from "./account-statement";

const now = Date.parse("2026-09-10T12:00:00Z");
const report = {
  id: 1, clientId: 1, clientName: "Test client", reportNumber: "REP-1",
  folioReporte: "1", projectId: 1, nombreObra: "RENTA",
  fechaReporte: "2026-09-01T12:00:00Z", total: "1400",
  paymentStatus: "pendiente", payments: [] as { amount: string }[],
};
const repair = {
  id: 1, clientId: 1, client: { name: "Test client" },
  repairNumber: "R-1", equipment: "Generador",
  receivedDate: "2026-08-01T12:00:00Z", total: "900",
  status: "Entregada", paymentStatus: "No Pagada",
};

test("combines 1400 rental + 900 repair; includes details, counts and aging", () => {
  const result = buildAccountsReceivable([report], [repair], now);
  assert.equal(result.summary.totalBalance, 2300);
  assert.equal(result.summary.pendingReportsCount, 2);
  assert.equal(result.summary.clientsCount, 1);
  assert.equal(result.summary.overdueClientsCount, 1);
  const client = result.clients[0];
  assert.equal(client.totalBilled, 2300);
  assert.equal(client.totalPaid, 0);
  assert.equal(client.balance, 2300);
  assert.equal(client.oldestDays, 40);
  assert.deepEqual(client.reports.map(r => [r.type, r.id]), [["report", 1], ["repair", 1]]);
  assert.equal(client.reports[1].reportNumber, "R-1");
  assert.equal(client.reports[1].nombreObra, "Generador");
});

test("paid overrides, partial payments, overpayments and repair payment edits", () => {
  assert.equal(buildAccountsReceivable([{ ...report, payments: [{ amount: "400" }] }], [repair], now).summary.totalBalance, 1900);
  assert.equal(buildAccountsReceivable([{ ...report, paymentStatus: "pagado" }], [repair], now).summary.totalBalance, 900);
  assert.equal(buildAccountsReceivable([{ ...report, payments: [{ amount: "1500" }] }], [{ ...repair, paymentStatus: "Pagada" }], now).summary.totalBalance, 0);
  assert.equal(buildAccountsReceivable([report], [], now).summary.totalBalance, 1400);
  assert.equal(buildAccountsReceivable([report], [{ ...repair, paymentStatus: "Pagada" }], now).summary.totalBalance, 1400);
});

test("excludes duplicate repair reports including accents and whitespace", () => {
  for (const nombreObra of ["REPARACION", " reparación de generador", "Reparaciones"]) {
    const result = buildAccountsReceivable([{ ...report, nombreObra }], [repair], now);
    assert.equal(result.summary.totalBalance, 900);
    assert.equal(result.summary.pendingReportsCount, 1);
  }
});

test("excludes nonbillable repairs and includes repair-only clients", () => {
  for (const override of [
    { status: "No autorizado" }, { status: "Espera de confirmación" },
    { status: "Diagnóstico" }, { status: "Taller" }, { paymentStatus: "Cotización" },
    { total: "0" }, { total: "-1" }, { paymentStatus: "Pagada" },
    { clientId: null },
  ]) {
    assert.equal(buildAccountsReceivable([], [{ ...repair, ...override }], now).clients.length, 0);
  }
  const result = buildAccountsReceivable([], [repair], now);
  assert.equal(result.clients[0].balance, 900);
  assert.equal(result.clients[0].reportsCount, 1);
});

test("all client totals match account statement and sort by balance", () => {
  const reports = [
    report,
    { ...report, id: 2, total: "16704", payments: [{ amount: "4152" }], clientId: 2 },
    { ...report, id: 3, total: "9396", clientId: 2 },
  ];
  const repairs = [repair, { ...repair, id: 2, total: "3828", clientId: 2 }];
  const result = buildAccountsReceivable(reports, repairs, now);
  assert.equal(result.clients[0].balance, 25776);
  assert.equal(result.summary.totalBalance, 28076);
  for (const client of result.clients) {
    assert.equal(client.balance, summarizeAccountStatement(
      reports.filter(r => r.clientId === client.clientId),
      repairs.filter(r => r.clientId === client.clientId),
    ).totalPendingAmount);
  }
});