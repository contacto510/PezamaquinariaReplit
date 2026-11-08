import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RepairConceptCatalogStatus from "./RepairConceptCatalogStatus";

const render = (loading: boolean, error: boolean) =>
  renderToStaticMarkup(
    <RepairConceptCatalogStatus loading={loading} error={error} onRetry={() => {}} />,
  );

test("successful loading leaves no false error or empty-catalog banner", () => {
  assert.equal(render(false, false), "");
});

test("initial load shows a loading status instead of claiming an empty catalog", () => {
  const html = render(true, false);
  assert.match(html, /role="status"/);
  assert.match(html, /Cargando conceptos/);
  assert.doesNotMatch(html, /No hay conceptos/);
  assert.doesNotMatch(html, /<button/);
});

test("load failures explain the difference and offer a non-submitting retry", () => {
  const html = render(false, true);
  assert.match(html, /role="alert"/);
  assert.match(html, /No se pudieron cargar los conceptos/);
  assert.match(html, /no significa que el catálogo esté vacío/);
  assert.match(html, /sin perder lo que llevas capturado/);
  assert.match(html, /type="button"/);
  assert.match(html, />Reintentar</);
  assert.doesNotMatch(html, /\sdisabled(?:=|\s|>)/);
});

test("an in-flight retry disables its button and announces progress", () => {
  const html = render(true, true);
  assert.match(html, /Reintentando/);
  assert.match(html, /\sdisabled=""/);
  assert.match(html, /type="button"/);
});
