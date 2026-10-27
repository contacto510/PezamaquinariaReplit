import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePaymentNoticePDF } from "./payment-notice-pdf-generator";
import type { Report } from "@shared/schema";

function report(overrides: Record<string, unknown> = {}): Report {
  return {
    id: 17,
    folioReporte: "FOL-17",
    nombreObra: "RENTA",
    fechaReporte: "2026-07-27T18:00:00Z",
    createdAt: "2026-07-27T18:00:00Z",
    periodoRentaInicio: "2026-07-27T18:00:00Z",
    periodoRentaFin: "2026-08-01T18:00:00Z",
    total: "16704.00",
    paymentStatus: "pendiente",
    payments: [
      { id: 2, amount: "6276.00", paymentDate: "2026-10-19T18:00:00Z" },
      { id: 1, amount: "4152.00", paymentDate: "2026-08-05T18:00:00Z" },
    ],
    ...overrides,
  } as unknown as Report;
}

async function pdfText(reports: Report[], repairs: unknown[] = []) {
  const doc = await generatePaymentNoticePDF(1, "Cliente de prueba", reports, repairs);
  const directory = mkdtempSync(join(tmpdir(), "statement-payment-test-"));
  const file = join(directory, "statement.pdf");
  try {
    writeFileSync(file, Buffer.from(doc.output("arraybuffer")));
    return {
      pages: doc.getNumberOfPages(),
      text: execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }),
      bbox: execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf8" }),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("actual PDF shows FOL-17's two dated payments in its table and notes", async () => {
  const { text } = await pdfText([
    report(),
    report({ id: 22, folioReporte: "FOL-22", total: "406.00", payments: [] }),
  ]);
  const [table, notes] = text.split("NOTA SOBRE ABONOS PARCIALES");
  for (const section of [table, notes]) {
    assert.match(section, /FOL-17/);
    assert.match(section, /\$4,152\.00\s*—\s*05\/08\/2026/);
    assert.match(section, /\$6,276\.00\s*—\s*19\/10\/2026/);
    assert.match(section, /\$10,428\.00/);
  }
  assert.match(table, /\$6,682\.00/);
  assert.match(table, /OBRA/);
  assert.match(table, /PERÍODO/);
  assert.doesNotMatch(text, /recibió un abono de \$10,428/);
});

test("notes paginate for many partial folios without losing their amounts or dates", async () => {
  const { text, pages, bbox } = await pdfText(
    Array.from({ length: 45 }, (_, index) => report({
      id: index + 100,
      folioReporte: `FOL-PRUEBA-${index + 100}`,
    })),
  );
  assert.ok(pages > 2);
  assert.ok(text.split("NOTA SOBRE ABONOS PARCIALES").length > 2);
  for (let id = 100; id < 145; id++) {
    assert.ok(text.includes(`FOL-PRUEBA-${id}`));
  }
  // Page content and the existing footer must stay inside A4.
  for (const match of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
    assert.ok(Number(match[1]) >= 0 && Number(match[3]) <= 596);
    assert.ok(Number(match[2]) >= 0 && Number(match[4]) <= 842);
  }
});

test("long single-folio histories paginate without dropping payment entries", async () => {
  const payments = Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    amount: `${index + 1}.00`,
    paymentDate: "2026-08-05T18:00:00Z",
  }));
  const { text, pages } = await pdfText([
    report({ total: "5000.00", payments }),
  ]);
  assert.ok(pages > 1);
  const normalized = text.replace(/\s+/g, " ");
  for (let amount = 1; amount <= 80; amount++) {
    assert.ok(normalized.includes(`$${amount}.00 — 05/08/2026`));
  }
  assert.match(text, /\$3,240\.00/);
  assert.match(text, /\$1,760\.00/);
});

test("paid rental and repair reference columns stay intact without invented payment history", async () => {
  const { text } = await pdfText([
    report({ paymentStatus: "pagado", payments: [] }),
  ], [{
    repairNumber: "R-TEST",
    equipment: "Equipo de prueba",
    receivedDate: "2026-08-01T00:00:00Z",
    paymentStatus: "Pagada",
    status: "Entregada",
    total: "100.00",
  }]);
  assert.match(text, /FACTURAS YA LIQUIDADAS/);
  assert.match(text, /ESTADO/);
  // The narrow column wraps its heading, and the adjacent heading can appear
  // between the two lines in pdftotext's reading order.
  assert.match(text, /LIQUIDADO/);
  assert.match(text, /\bEL\b/);
  assert.match(text, /Fecha no[\s\S]*?registrada/);
  assert.match(text, /R-TEST/);
  assert.doesNotMatch(text, /Abonos registrados:/);
});

function ecoReports(groupId: string | null = null): Report[] {
  return [
    report({
      id: 21, folioReporte: "FOL-21", total: "9450.00", paymentStatus: "pagado",
      payments: [
        { id: 789, amount: "3750.00", paymentDate: "2026-10-20",
          createdAt: "2026-10-20T22:24:03Z", paymentMethod: "transferencia" },
        { id: 797, amount: "5700.00", paymentDate: "2026-10-26",
          createdAt: "2026-10-26T18:08:17Z", paymentMethod: "efectivo", paymentGroupId: groupId },
      ],
    }),
    report({
      id: 22, folioReporte: "FOL-22", total: "8100.00",
      payments: [
        { id: 798, amount: "6300.00", paymentDate: "2026-10-26",
          paymentMethod: "efectivo", paymentGroupId: groupId },
      ],
    }),
  ];
}

test("liquidated FOL-21 keeps both dates and amounts in notes and its paid table", async () => {
  const { text } = await pdfText(ecoReports());
  const notes = text.split("NOTA SOBRE ABONOS PARCIALES")[1].split("REFERENCIA")[0];
  const paid = text.split("FACTURAS YA LIQUIDADAS")[1];
  for (const section of [notes, paid]) {
    assert.match(section, /FOL-21/);
    assert.match(section, /\$3,750\.00\s*—\s*20\/10\/2026/);
    assert.match(section, /\$5,700\.00\s*—\s*26\/10\/2026/);
    assert.match(section, /Transferencia/);
    assert.match(section, /Efectivo/);
  }
  assert.match(text, /\$1,800\.00/);
  assert.doesNotMatch(text, /PAGOS GLOBALES/);
});

test("histories remain when the client has no pending balance", async () => {
  const { text } = await pdfText([ecoReports()[0]]);
  assert.match(text, /No tienes saldo pendiente/);
  assert.match(text, /NOTA SOBRE ABONOS PARCIALES/);
  assert.match(text, /\$3,750\.00/);
  assert.match(text, /\$5,700\.00/);
});

test("a global payment is traceable across paid and pending folios without adding to debt", async () => {
  const { text, bbox } = await pdfText(ecoReports("53a1c6df-768f-4d1b-aacf-b76c6d5c5b5c"));
  assert.match(text, /PAGOS GLOBALES/);
  assert.match(text, /DISTRIBUCIÓN POR FOLIO/);
  assert.match(text.replace(/\s+/g, " "), /FOL-21: \$5,700\.00 — 26\/10\/2026 — Efectivo/);
  assert.match(text.replace(/\s+/g, " "), /FOL-22: \$6,300\.00 — 26\/10\/2026 — Efectivo/);
  assert.match(text, /Total aplicado registrado: \$12,000\.00/);
  assert.match(text.replace(/\s+/g, " "), /no se suman nuevamente al saldo/);
  assert.match(text, /\$1,800\.00/);
  for (const match of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)) {
    assert.ok(Number(match[1]) >= 0 && Number(match[3]) <= 596);
    assert.ok(Number(match[2]) >= 0 && Number(match[4]) <= 842);
  }
});

test("long paid histories paginate without losing the previous deposits", async () => {
  const payments = Array.from({ length: 80 }, (_, index) => ({
    id: index + 1, amount: `${index + 1}.00`, paymentDate: "2026-10-20",
  }));
  const { text, pages } = await pdfText([report({
    paymentStatus: "pagado", total: "3240.00", payments,
  })]);
  assert.ok(pages > 1);
  const paid = text.split("FACTURAS YA LIQUIDADAS")[1].replace(/\s+/g, " ");
  for (let amount = 1; amount <= 80; amount++) {
    assert.ok(paid.includes(`$${amount}.00 — 20/10/2026`));
  }
});
