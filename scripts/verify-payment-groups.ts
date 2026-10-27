// Development-only API integration test. Creates isolated fixtures and deletes
// only those fixtures in finally. Never runs against the external live database.
// npx tsx scripts/verify-payment-groups.ts --development
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import { getStatementPaymentGroups } from "../client/src/lib/statement-payment-groups";
import { getReportAccountAmounts } from "../shared/account-statement";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(process.env.DATABASE_URL && process.env.REPLIT_DEV_DOMAIN);
assert.notEqual(process.env.DATABASE_URL, process.env.NEON_DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const marker = `TEST-PAYMENT-GROUP-${crypto.randomUUID()}`;
let clientId: number | undefined;
try {
  const client = await pool.query("INSERT INTO clients(name) VALUES($1) RETURNING id", [marker]);
  clientId = client.rows[0].id;
  const project = await pool.query(
    "INSERT INTO client_projects(client_id,name) VALUES($1,$2) RETURNING id", [clientId, marker]);
  const reportIds: number[] = [];
  for (const total of ["9450.00", "8100.00"]) {
    const index = reportIds.length + 21;
    const result = await pool.query(`
      INSERT INTO reports(report_number,folio_reporte,client_id,client_name,project_id,
        dias_uso,nombre_obra,fecha_reporte,total)
      VALUES($1,$2,$3,$4,$5,'1','Prueba de integración',now(),$6) RETURNING id`,
    [`${marker}-${index}`, `FOL-${index}`, clientId, marker, project.rows[0].id, total]);
    reportIds.push(result.rows[0].id);
  }
  await pool.query(`
    INSERT INTO report_payments(report_id,amount,payment_date,payment_method,created_by)
    VALUES($1,3750,'2026-10-20 18:00:00','transferencia','integration-test')`, [reportIds[0]]);

  const body = {
    paymentDate: "2026-10-26", paymentMethod: "efectivo", totalAmount: 12000,
    allocations: [
      { reportId: reportIds[0], amount: 5700 },
      { reportId: reportIds[1], amount: 6300 },
    ],
  };
  const path = `/api/clients/${clientId}/partial-payment`;
  const anonymous = await fetch(`${base}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(anonymous.status, 401);
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const request = (path: string, method = "GET", data?: unknown) => fetch(`${base}${path}`, {
    method, headers: { Cookie: cookie, "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });

  const created = await request(path, "POST", body);
  assert.equal(created.status, 201);
  const { payments } = await created.json();
  assert.equal(payments.length, 2);
  const groupId = payments[0].paymentGroupId;
  assert.match(groupId, /^[0-9a-f-]{36}$/);
  assert.equal(payments[1].paymentGroupId, groupId);

  const detail = await request(`/api/clients/${clientId}`);
  assert.equal(detail.status, 200);
  const { reports } = await detail.json();
  assert.equal(reports.length, 2);
  assert.equal(getStatementPaymentGroups(reports)[0].total, 12000);
  const paid = reports.find((report: any) => report.id === reportIds[0]);
  const pending = reports.find((report: any) => report.id === reportIds[1]);
  assert.equal(paid.paymentStatus, "pagado");
  assert.equal(paid.payments.length, 2);
  assert.equal(paid.payments.find((payment: any) => Number(payment.amount) === 3750).paymentGroupId, null);
  assert.equal(getReportAccountAmounts(paid).pending, 0);
  assert.equal(getReportAccountAmounts(pending).pending, 1800);

  // A separate receipt on the same day must get a different identity.
  const second = await request(path, "POST", {
    ...body, totalAmount: 100, allocations: [{ reportId: reportIds[1], amount: 100 }],
  });
  assert.equal(second.status, 201);
  const secondPayments = (await second.json()).payments;
  assert.notEqual(secondPayments[0].paymentGroupId, groupId);

  // Individual edits preserve the original relationship; forged identity is rejected.
  const editPath = `/api/reports/${reportIds[1]}/payments/${payments[1].id}`;
  const forged = await request(editPath, "PATCH", { paymentGroupId: crypto.randomUUID() });
  assert.equal(forged.status, 400);
  const edit = await request(editPath, "PATCH", { notes: "Prueba sin modificar importes" });
  assert.equal(edit.status, 200);
  assert.equal((await edit.json()).paymentGroupId, groupId);

  // Reject overspending without leaving any partial allocation behind.
  const before = await pool.query(
    "SELECT count(*)::int AS n FROM report_payments WHERE report_id=ANY($1)", [reportIds]);
  const rejected = await request(path, "POST", {
    ...body, totalAmount: 5000, allocations: [{ reportId: reportIds[1], amount: 5000 }],
  });
  assert.equal(rejected.status, 400);
  const after = await pool.query(
    "SELECT count(*)::int AS n FROM report_payments WHERE report_id=ANY($1)", [reportIds]);
  assert.equal(after.rows[0].n, before.rows[0].n);
  console.log("PASS: authenticated atomic allocation, shared group identity, historical null, unchanged balances, distinct receipts, immutable identity, rollback.");
} finally {
  // ON DELETE CASCADE removes only this isolated client's projects/reports/payments.
  if (clientId !== undefined) {
    await pool.query("DELETE FROM clients WHERE id=$1 AND name=$2", [clientId, marker]);
  }
  await pool.end();
}
