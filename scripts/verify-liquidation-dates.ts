// Creates and removes isolated fixtures only in development.
// npx tsx scripts/verify-liquidation-dates.ts --development
import assert from "node:assert/strict";
import pg from "pg";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(process.env.DATABASE_URL && process.env.REPLIT_DEV_DOMAIN);
assert.notEqual(process.env.DATABASE_URL, process.env.NEON_DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const ids: number[] = [];
try {
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const patch = (id: number, body: object) => fetch(`${base}/api/repairs/${id}/payment-status`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  for (const status of ["No Pagada", "Pagada"]) {
    const row = await pool.query(
      "INSERT INTO repairs (repair_number,equipment,payment_status) VALUES ($1,$2,$3) RETURNING id",
      [`TEST-LIQ-${Date.now()}-${status}`, "Liquidation verification", status],
    );
    ids.push(row.rows[0].id);
  }
  const saved = await patch(ids[0], { paymentStatus: "Pagada" });
  assert.equal(saved.status, 200);
  const paid = await saved.json();
  assert(Math.abs(Date.now() - Date.parse(paid.liquidatedAt)) < 60000);
  const repeated = await (await patch(ids[0], { paymentStatus: "Pagada" })).json();
  assert.equal(repeated.liquidatedAt, paid.liquidatedAt);
  const legacy = await (await patch(ids[1], { paymentStatus: "Pagada" })).json();
  assert.equal(legacy.liquidatedAt, null, "Do not invent dates on historical paid repairs");
  for (const invalid of ["2025-02-30", "2999-01-01", null]) {
    assert.equal((await patch(ids[1], { paymentStatus: "Pagada", liquidatedAt: invalid })).status, 400);
  }
  const correction = await patch(ids[1], { paymentStatus: "Pagada", liquidatedAt: "2025-03-10" });
  assert.equal(correction.status, 200);
  const corrected = await correction.json();
  assert.equal(corrected.liquidatedAt, "2025-03-10T12:00:00.000Z");
  const reopened = await (await patch(ids[1], { paymentStatus: "No Pagada" })).json();
  assert.equal(reopened.liquidatedAt, null);
  assert.equal((await patch(ids[1], { paymentStatus: "Pagada", liquidatedAt: "2025-03-10" })).status, 400);
  console.log("PASS: server timestamp, repeated payment, historical missing date, date validation, correction and reopening.");
} finally {
  if (ids.length) await pool.query("DELETE FROM repairs WHERE id = ANY($1::int[])", [ids]);
  await pool.end();
}