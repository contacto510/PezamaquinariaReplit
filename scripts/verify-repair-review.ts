// Isolated fixtures; never runs against production.
import assert from "node:assert/strict";
import pg from "pg";
import { calculateRepairReviewTotals, resolveRepairReview } from "../shared/repair-review";
import { isBillableRepair } from "../shared/account-statement";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(process.env.DATABASE_URL && process.env.REPLIT_DEV_DOMAIN);
assert.notEqual(process.env.DATABASE_URL, process.env.NEON_DATABASE_URL);
assert.deepEqual(calculateRepairReviewTotals(1000, "200", true, true), { subtotal: "200.00", iva: "32.00", total: "232.00" });
assert.deepEqual(calculateRepairReviewTotals(1000, "200", false, true), { subtotal: "1200.00", iva: "192.00", total: "1392.00" });
assert.equal(calculateRepairReviewTotals(1000, "200", false, false).total, "1200.00");
assert.throws(() => resolveRepairReview(null, { paymentStatus: "Revisión", reviewAmount: "0" }));
assert.throws(() => resolveRepairReview(null, { reviewAmount: "-2" }));
assert(isBillableRepair({status: "Diagnóstico", paymentStatus: "Revisión", reviewOnly: true, total: "232"}));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
let id: number | undefined;
try {
  const login = await fetch(`${base}/api/login`, {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})});
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const row = await pool.query("INSERT INTO repairs (repair_number,equipment,payment_status,include_iva,subtotal,iva,total) VALUES ($1,'Review verification','No Pagada',true,1000,160,1160) RETURNING id", [`TEST-REVIEW-${Date.now()}`]);
  id = row.rows[0].id;
  await pool.query("INSERT INTO repair_items (repair_id,item_number,concept,quantity,unit,unit_price,subtotal) VALUES ($1,'1','Saved work',1,'Servicio',1000,1000)", [id]);
  const patch = (body:object) => fetch(`${base}/api/repairs/${id}/payment-status`, {method:"PATCH",headers:{Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify(body)});
  let response = await patch({paymentStatus:"Revisión",reviewAmount:"200"});
  assert.equal(response.status,200);
  let repair = await response.json();
  assert.equal(repair.total,"232.00"); assert.equal(repair.reviewOnly,true);
  response = await patch({paymentStatus:"Revisión",reviewAmount:"-10"});
  assert.equal(response.status,400);
  response = await patch({paymentStatus:"Pagada"});
  assert.equal(response.status,200);
  repair = await response.json();
  assert.equal(repair.total,"232.00"); assert(repair.liquidatedAt);
  assert.equal((await patch({paymentStatus:"Pagada",reviewAmount:"300"})).status,400);
  response = await patch({paymentStatus:"No Pagada",reviewOnly:false});
  assert.equal(response.status,200);
  repair = await response.json();
  assert.equal(repair.total,"1392.00"); assert.equal(repair.liquidatedAt,null);
  repair = await (await patch({paymentStatus:"No Pagada",reviewOnly:false})).json();
  assert.equal(repair.total,"1392.00", "Never double charge review");
  const lines = await pool.query("SELECT count(*)::int n FROM repair_items WHERE repair_id=$1",[id]);
  assert.equal(lines.rows[0].n,1);
  console.log("PASS: review only, authorization, IVA, preserved concepts, validation, paid protection and liquidation date.");
} finally {
  if(id) {
    await pool.query("DELETE FROM repair_items WHERE repair_id=$1",[id]);
    await pool.query("DELETE FROM repairs WHERE id=$1",[id]);
  }
  await pool.end();
}
