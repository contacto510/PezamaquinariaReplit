// Development-only integration checks; creates and removes uniquely tagged test data.
// Run: npx tsx scripts/verify-web-requests.ts --development
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { db, pool } from "../db";
import { eq, inArray, sql } from "drizzle-orm";
import { quotations, repairs } from "../shared/schema";
import { webRequests } from "../shared/web-requests";
import { registerWebRequestWebhook, registerPrivateWebRequests } from "../server/web-requests";
import { storage } from "../server/storage";

assert(process.argv.includes("--development"));
assert(process.env.NODE_ENV !== "production");
assert(!process.env.NEON_DATABASE_URL || process.env.DATABASE_URL !== process.env.NEON_DATABASE_URL, "Must use the development database");
// Test fixture, not a real credential; used only by this process.
const fixture = "test-fixture-only-00000000000000000000000000";
process.env.WORDPRESS_WEBHOOK_SECRET = fixture;
const app = express();
app.use(express.json({ limit: "32kb" }));
registerWebRequestWebhook(app);
registerPrivateWebRequests(app);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address() as { port: number };
const base = `http://127.0.0.1:${address.port}`;
const prefix = `verify-${randomUUID()}`;
const ids: number[] = [];
const createdQuotes: number[] = [];
const createdRepairs: number[] = [];
const send = (payload: unknown, key = fixture) => fetch(`${base}/api/integrations/bricks/requests`, {
  method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": key },
  body: JSON.stringify(payload),
});
try {
  const rental = {
    submission_id: `${prefix}-rent`, tipo_solicitud: "cotizacion_renta",
    nombre: "PRUEBA INTEGRACIÓN WEB", telefono: "8100000000", correo: "",
    equipo: "Equipo de prueba", pagina_url: "https://sd.pezamaquinaria.com.mx/",
    cantidad_equipos: 1, dias_renta: 2, entrega: "recoge_sucursal",
    falla_reportada: "No debe guardarse", hp_check: "",
  };
  assert.equal((await send(rental, "incorrecta")).status, 401);
  assert.equal((await send(rental)).status, 201);
  const retry = await send(rental);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal((await send({ ...rental, equipo: "Datos distintos" })).status, 409);
  const [request] = await db.select().from(webRequests).where(eq(webRequests.submissionId, rental.submission_id));
  ids.push(request.id);
  assert.equal("falla_reportada" in request.payload, false);
  assert.equal("hp_check" in request.payload, false);

  const [{ next }] = await db.select({ next: sql<number>`COALESCE(MAX(${quotations.quotationNumber}),0) + 1000000` }).from(quotations);
  const quote = { quotationNumber: Number(next), clientName: rental.nombre, clientEmail: "N/A", salesperson: "PRUEBA", subtotal: "0", iva: "0", total: "0", includeIVA: false };
  // Both saves target the same request; one must fail without creating a second quote.
  const results = await Promise.allSettled([
    storage.createQuotation(quote, [], request.id),
    storage.createQuotation({ ...quote, quotationNumber: Number(next) + 1 }, [], request.id),
  ]);
  for (const result of results) if (result.status === "fulfilled") createdQuotes.push(result.value.id);
  assert.equal(createdQuotes.length, 1);
  const [converted] = await db.select().from(webRequests).where(eq(webRequests.id, request.id));
  assert.equal(converted.status, "convertida");
  assert.equal(converted.convertedId, createdQuotes[0]);
  assert.equal((await fetch(`${base}/api/web-requests/${request.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "nueva" }),
  })).status, 409);

  const repair = { submission_id: `${prefix}-repair`, tipo_solicitud: "reparacion", nombre: rental.nombre, telefono: rental.telefono, equipo: rental.equipo, pagina_url: rental.pagina_url, falla_reportada: "Revisar equipo", dias_renta: -10 };
  assert.equal((await send(repair)).status, 201);
  const [repairRequest] = await db.select().from(webRequests).where(eq(webRequests.submissionId, repair.submission_id));
  ids.push(repairRequest.id);
  assert.equal("dias_renta" in repairRequest.payload, false);
  await assert.rejects(storage.createQuotation({ ...quote, quotationNumber: Number(next) + 2 }, [], repairRequest.id));
  const [unchanged] = await db.select().from(webRequests).where(eq(webRequests.id, repairRequest.id));
  assert.equal(unchanged.status, "nueva");
  const savedRepair = await storage.createRepair({
    repairNumber: `TEST-${randomUUID()}`, equipment: "Equipo de prueba",
    clientEmail: "N/A", receivedDate: new Date(), subtotal: "0", iva: "0", total: "0",
    includeIVA: false, paymentStatus: "Cotización", status: "Espera de confirmación",
  }, [], undefined, repairRequest.id);
  createdRepairs.push(savedRepair.id);
  const [linked] = await db.select().from(webRequests).where(eq(webRequests.id, repairRequest.id));
  assert.equal(linked.convertedId, savedRepair.id);
  assert.equal(linked.status, "convertida");
  assert.equal(savedRepair.paymentStatus, "Cotización");
  const listing = await fetch(`${base}/api/web-requests?type=reparacion`);
  assert.equal(listing.status, 200);
  const data = await listing.json();
  assert(data.items.some((item: any) => item.id === repairRequest.id));
  assert(data.items.every((item: any) => !("payloadHash" in item)));
  console.log("PASS: authenticated receipt, retries without duplicates, conflict detection, field isolation, concurrent conversion, type mismatch rollback, repair quotation linkage and private response projection.");
} finally {
  if (createdQuotes.length) await db.delete(quotations).where(inArray(quotations.id, createdQuotes));
  if (createdRepairs.length) await db.delete(repairs).where(inArray(repairs.id, createdRepairs));
  // Cleanup also covers an assertion failure immediately after receipt.
  await db.delete(webRequests).where(sql`${webRequests.submissionId} LIKE ${prefix + "%"}`);
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
}
