import assert from "node:assert/strict";
import { test } from "node:test";
import { conceptFilter } from "./concept-filter";
import { quotationConceptScore, searchQuotationConcepts } from "./quotation-concept-search";

test("finds words anywhere, without case or accent restrictions", () => {
  const name = "SERVICIO DE RECOLECCIÓN Y ENTREGA EN OBRA";
  for (const query of ["recoleccion", "entrega", "obra entrega", "  ENTREGA   óbra "]) {
    assert.ok(quotationConceptScore(name, query) > 0, query);
  }
});

test("requires every word and supports partial words", () => {
  assert.ok(quotationConceptScore("RENTA DE REVOLVEDORA", "revol rent") > 0);
  assert.equal(quotationConceptScore("RENTA DE REVOLVEDORA", "revol bomba"), 0);
});

test("ranks exact, prefix, then contained words; shorter matches first within tiers", () => {
  const concepts = [
    { name: "SERVICIO DE ENTREGA" },
    { name: "ENTREGA EN OBRA" },
    { name: "ENTREGA" },
    { name: "ENTREGA EN OBRA FUERA DE LA CIUDAD" },
  ];
  assert.deepEqual(searchQuotationConcepts(concepts, "entrega").map(c => c.name), [
    "ENTREGA", "ENTREGA EN OBRA", "ENTREGA EN OBRA FUERA DE LA CIUDAD",
    "SERVICIO DE ENTREGA",
  ]);
});

test("clearing search returns all concepts, ordered alphabetically, without mutation", () => {
  const concepts = [{ name: "ZAPATA" }, { name: "BOMBA" }];
  const original = [...concepts];
  assert.deepEqual(searchQuotationConcepts(concepts, "  ").map(c => c.name), ["BOMBA", "ZAPATA"]);
  assert.deepEqual(concepts, original);
  assert.equal(searchQuotationConcepts([], "").length, 0);
});

test("preserves complete records and separate concepts with the same name", () => {
  const concepts = [
    { id: 1, name: "BOMBA", defaultUnit: "DÍA", defaultPrice: "0.00" },
    { id: 2, name: "BOMBA", defaultUnit: "SEMANA", defaultPrice: "750.00" },
  ];
  assert.deepEqual(searchQuotationConcepts(concepts, "bomba"), concepts);
  assert.equal(searchQuotationConcepts(concepts, "bomba")[0], concepts[0]);
});

test("quotation changes leave ReportForm's existing prefix search unchanged", () => {
  assert.equal(conceptFilter("SERVICIO DE ENTREGA", "entrega"), 0);
  assert.ok(conceptFilter("SERVICIO DE ENTREGA", "servicio") > 0);
});
