import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLiquidationDay, resolveLiquidatedAt } from "./repair-liquidation";

test("newly paid repairs get server time, repeated paid and unrelated changes preserve history", () => {
  const now = new Date("2026-06-10T13:20:00Z");
  const paid = resolveLiquidatedAt("No Pagada", null, "Pagada", undefined, now);
  assert.equal(paid, now);
  assert.equal(resolveLiquidatedAt("Pagada", paid, "Pagada", undefined, new Date()), paid);
  assert.equal(resolveLiquidatedAt("Pagada", paid, "No Pagada"), null);
  assert.equal(resolveLiquidatedAt("No Pagada", null, "Cotización"), null);
  assert.equal(resolveLiquidatedAt("Pagada", null, "Pagada"), null);
});

test("historical correction requires already paid; preserves Mexico calendar day", () => {
  const now = new Date("2026-06-10T03:00:00Z"); // June 9 in Mexico City
  const selected = parseLiquidationDay("2026-06-09", now);
  assert.equal(selected.toISOString(), "2026-06-09T12:00:00.000Z");
  assert.equal(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(selected),
    "2026-06-09",
  );
  assert.equal(resolveLiquidatedAt("Pagada", null, "Pagada", selected), selected);
  assert.throws(() => resolveLiquidatedAt("No Pagada", null, "Pagada", selected));
  assert.throws(() => resolveLiquidatedAt("Pagada", selected, "No Pagada", selected));
  for (const bad of [null, "", "2026-06-10", "2026-02-30", "2026-01-01T00:00:00Z", "2026-1-1"]) {
    assert.throws(() => parseLiquidationDay(bad, now));
  }
});