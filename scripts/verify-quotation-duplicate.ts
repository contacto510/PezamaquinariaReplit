// Opt-in integration test: creates and removes only its own development fixtures.
// Run: npx tsx scripts/verify-quotation-duplicate.ts --development
import assert from "node:assert/strict";
import pg from "pg";

assert(process.argv.includes("--development"), "Explicit --development is required");
assert(process.env.NODE_ENV !== "production");
assert(process.env.DATABASE_URL && process.env.REPLIT_DEV_DOMAIN);
assert.notEqual(process.env.DATABASE_URL, process.env.NEON_DATABASE_URL);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
let clientId: number | undefined;
let projectId: number | undefined;
try {
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const duplicate = (id: string | number, authenticated = true) =>
    fetch(`${base}/api/quotations/${id}/duplicate`, {
      method: "POST", headers: authenticated ? { Cookie: cookie } : {},
    });
  assert.equal((await duplicate(1, false)).status, 401);
  assert.equal((await duplicate("invalid")).status, 400);
  assert.equal((await duplicate(2147483647)).status, 404);

  const name = `Duplicate verification ${Date.now()}`;
  clientId = (await pool.query(
    "INSERT INTO clients (name,total_quotations,total_amount) VALUES ($1,1,116) RETURNING id", [name],
  )).rows[0].id;
  projectId = (await pool.query(
    "INSERT INTO client_projects (client_id,name,total_quotations,total_amount) VALUES ($1,$2,1,116) RETURNING id",
    [clientId, "Test project"],
  )).rows[0].id;
  const connection = await pool.connect();
  let original: any;
  try {
    await connection.query("BEGIN");
    await connection.query("LOCK TABLE quotations IN SHARE ROW EXCLUSIVE MODE");
    original = (await connection.query(`
      INSERT INTO quotations (quotation_number,client_id,project_id,client_name,client_email,
        project_name,rental_period,salesperson,include_iva,subtotal,iva,total,created_at)
      VALUES ((SELECT COALESCE(MAX(quotation_number),1000)+1 FROM quotations),
        $1,$2,$3,'N/A','Test project','7 días','Prueba',true,100,16,116,'2025-01-01')
      RETURNING *`, [clientId, projectId, name])).rows[0];
    await connection.query(`
      INSERT INTO quotation_items (quotation_id,concept,quantity,unit,unit_price,subtotal)
      VALUES ($1,'Equipo de prueba',2,'Día',50,100)`, [original.id]);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }

  const responses = await Promise.all([duplicate(original.id), duplicate(original.id)]);
  const copies: any[] = [];
  for (const response of responses) {
    assert.equal(response.status, 201);
    copies.push(await response.json());
  }
  assert.notEqual(copies[0].quotationNumber, copies[1].quotationNumber);
  for (const copy of copies) {
    assert.notEqual(copy.id, original.id);
    assert(copy.quotationNumber > original.quotation_number);
    assert.equal(copy.clientId, clientId);
    assert.equal(copy.projectId, projectId);
    assert.equal(copy.clientEmail, "N/A");
    assert.equal(copy.rentalPeriod, "7 días");
    assert.equal(copy.salesperson, "Prueba");
    assert.equal(copy.includeIVA, true);
    assert.equal(copy.total, "116.00");
    assert.equal(copy.subtotal, "100.00");
    assert.equal(copy.iva, "16.00");
    assert(new Date(copy.createdAt) > new Date(original.created_at));
    assert.equal(copy.items.length, 1);
    assert.equal(copy.items[0].quotationId, copy.id);
    assert.equal(copy.items[0].concept, "Equipo de prueba");
    assert.equal(copy.items[0].quantity, "2.00");
    assert.equal(copy.items[0].unitPrice, "50.00");
  }
  assert.deepEqual((await pool.query("SELECT * FROM quotations WHERE id=$1", [original.id])).rows[0], original);
  assert.equal((await pool.query("SELECT total_quotations FROM client_projects WHERE id=$1", [projectId])).rows[0].total_quotations, 3);
  console.log("PASS: authentication, invalid/missing IDs, concurrent unique folios, complete copies, preserved original and associations.");
} finally {
  if (clientId !== undefined) {
    await pool.query("DELETE FROM quotations WHERE client_id=$1", [clientId]);
    if (projectId !== undefined) await pool.query("DELETE FROM client_projects WHERE id=$1", [projectId]);
    await pool.query("DELETE FROM clients WHERE id=$1", [clientId]);
  }
  await pool.end();
}