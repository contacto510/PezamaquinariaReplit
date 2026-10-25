import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RepairDashboard from "./RepairDashboard";
import RepairDashboardSummary from "../components/repair-dashboard/RepairDashboardSummary";
import { buildRepairDashboardSnapshot } from "../../../shared/repair-dashboard";

// tsx follows this project's JSX-preserve setting using the classic JSX runtime.
// This is a server-render test only; it does not change application authentication.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

function render(component: React.ComponentType, count = 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["/api/repairs-dashboard"], buildRepairDashboardSnapshot(
    Array.from({ length: count }, (_, index) => ({
      id: index + 1, repairNumber: `R-TEST-${index + 1}`,
      clientId: 1, client: { name: "Cliente de prueba" },
      equipment: "Generador de prueba", status: "En Proceso",
      paymentStatus: "No Pagada", total: "1160.00",
      receivedDate: "2026-08-05T00:00:00Z",
    })),
    new Date("2026-10-25T18:00:00Z"),
  ));
  try {
    return renderToStaticMarkup(React.createElement(Router, { ssrPath: "/repairs/dashboard" },
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(component))));
  } finally {
    queryClient.clear();
  }
}

test("full dashboard renders real snapshot metrics, filters and record navigation", () => {
  const html = render(RepairDashboard);
  for (const text of [
    "Tablero de reparaciones", "Saldo pendiente", "$1,160.00",
    "Cotizaciones", "Revisión incluida", "Actividad del período",
    "Cliente", "Responsable", "Estado operativo", "Desde", "Hasta",
    "R-TEST-1", "Generador de prueba", "Costos y ganancias no están incluidos",
  ]) assert.ok(html.includes(text), `Missing ${text}`);
  assert.ok(html.includes('href="/repairs/1"'));
  assert.ok(html.includes('href="/clients/1"'));
  assert.ok(html.includes('href="/repairs"'));
});

test("empty snapshot renders a usable zero state", () => {
  const html = render(RepairDashboard, 0);
  assert.ok(html.includes("Sin reparaciones para mostrar"));
  assert.ok(html.includes("$0.00"));
  assert.ok(html.includes("Restablecer"));
});

test("detail is paginated without limiting metrics to the first page", () => {
  const html = render(RepairDashboard, 20);
  assert.ok(html.includes("$23,200.00"));
  assert.ok(html.includes("R-TEST-15"));
  assert.ok(!html.includes("R-TEST-16"));
  assert.ok(html.includes("Página siguiente"));
});

test("Inicio summary has working links to the relevant dashboard groups", () => {
  const html = render(RepairDashboardSummary);
  assert.ok(html.includes("Resumen de reparaciones"));
  for (const group of ["pending", "ready", "deliveredUnpaid"]) {
    assert.ok(html.includes(`href="/repairs/dashboard?group=${group}"`));
  }
});
