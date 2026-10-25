// Read-only API/database verification in development. No fixtures or mutations.
// npx tsx scripts/verify-repair-dashboard.ts --development
import assert from "node:assert/strict";
import pg from "pg";
import { buildRepairDashboardSnapshot, selectRepairDashboard, type RepairDashboardResponse } from "../shared/repair-dashboard";
import { summarizeAccountStatement } from "../shared/account-statement";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(process.env.DATABASE_URL && process.env.REPLIT_DEV_DOMAIN);
assert.notEqual(process.env.DATABASE_URL, process.env.NEON_DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
try {
  const anonymous = await fetch(`${base}/api/repairs-dashboard`);
  assert.equal(anonymous.status, 401, "The snapshot must require a session");
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const response = await fetch(`${base}/api/repairs-dashboard`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const data = await response.json() as RepairDashboardResponse;
  assert.ok(Number.isFinite(Date.parse(data.asOf)));
  const raw = await pool.query(`
    SELECT r.id, r.repair_number AS "repairNumber", r.client_id AS "clientId",
      json_build_object('name', c.name) AS client, r.equipment,
      r.repair_manager AS "repairManager", r.status, r.payment_status AS "paymentStatus",
      r.total, r.review_only AS "reviewOnly", r.review_amount AS "reviewAmount",
      r.include_iva AS "includeIVA",
      r.received_date AT TIME ZONE 'UTC' AS "receivedDate",
      r.delivery_date AT TIME ZONE 'UTC' AS "deliveryDate",
      r.liquidated_at AT TIME ZONE 'UTC' AS "liquidatedAt"
    FROM repairs r LEFT JOIN clients c ON c.id = r.client_id ORDER BY r.id DESC
  `);
  const expected = buildRepairDashboardSnapshot(raw.rows, new Date(data.asOf));
  // Avoid dumping client information into assertion failures.
  assert.ok(JSON.stringify(data.entries) === JSON.stringify(expected.entries),
    "Every repair must be included with unchanged accounting");
  for (const entry of data.entries) {
    for (const field of ["image1", "image2", "image3", "items", "clientEmail"]) {
      assert.ok(!(field in entry), `Summary must not return ${field}`);
    }
  }
  const { summary } = selectRepairDashboard(data.entries);
  const statement = summarizeAccountStatement([], raw.rows);
  assert.equal(summary.pendingAmount, Math.round(statement.totalPendingAmount * 100) / 100);
  assert.equal(summary.paidAmount, Math.round(statement.totalPaidAmount * 100) / 100);
  console.log(`PASS: authenticated complete lightweight snapshot (${data.entries.length} repairs), shared account totals, no data writes.`);
} finally {
  await pool.end();
}
