import assert from "node:assert/strict";
import { test } from "node:test";
import { repairConceptDescription, repairConceptScore, searchRepairConcepts } from "./repair-concept-search";

test("finds partial words anywhere and in any order without accents or case", () => {
  const concept = { name: "REVISIÓN DE FILTRO DE AIRE" };
  for (const search of ["aire filtro", " FILTRO   revisión ", "aire revis", "filtro"]) {
    assert.ok(repairConceptScore(concept, search) > 0, search);
  }
});

test("searches description and supports words split across name and description", () => {
  const concept = { name: "MANTENIMIENTO", description: "[REPAIR] Generador de gasolina" };
  assert.ok(repairConceptScore(concept, "gasolina generador") > 0);
  assert.ok(repairConceptScore(concept, "generador manten") > 0);
  assert.equal(repairConceptScore(concept, "generador diesel"), 0);
  assert.equal(repairConceptScore(concept, "repair"), 0);
});

test("ranks exact name, prefix, name words, then description matches", () => {
  const concepts = [
    { name: "SERVICIO", description: "Filtro de aire" },
    { name: "CAMBIO DE FILTRO" },
    { name: "FILTRO DE AIRE" },
    { name: "FILTRO" },
  ];
  assert.deepEqual(searchRepairConcepts(concepts, "filtro").general.map(c => c.name), [
    "FILTRO", "FILTRO DE AIRE", "CAMBIO DE FILTRO", "SERVICIO",
  ]);
});

test("retains legacy repair and modern categories without mixing or duplicates", () => {
  const concepts = [
    { name: "LEGACY", description: "[REPAIR] Motor" },
    { name: "MODERNO", category: "repair" },
    { name: "AMBOS", category: "repair", description: "[REPAIR]" },
    { name: "GENERAL", category: "general", description: null },
  ];
  const result = searchRepairConcepts(concepts, "");
  assert.deepEqual(result.repair.map(c => c.name), ["AMBOS", "LEGACY", "MODERNO"]);
  assert.deepEqual(result.general.map(c => c.name), ["GENERAL"]);
  assert.equal(result.repair.length + result.general.length, concepts.length);
});

test("clearing search returns every available concept without changing source or records", () => {
  const concepts = [
    { id: 1, name: "ZAPATA", defaultUnit: "pza", defaultPrice: "0.00" },
    { id: 2, name: "BOMBA", defaultUnit: "hr", defaultPrice: "125.50" },
  ];
  const before = JSON.stringify(concepts);
  const found = searchRepairConcepts(concepts, "  ");
  assert.equal(found.general.length, 2);
  assert.equal(found.general[1], concepts[0]);
  assert.equal(JSON.stringify(concepts), before);
});

test("unknown queries and empty catalogs return empty groups", () => {
  assert.deepEqual(searchRepairConcepts([], ""), { repair: [], general: [] });
  assert.deepEqual(searchRepairConcepts([{ name: "BUJÍA" }], "carburador"), { repair: [], general: [] });
});

test("cleans internal description markers without changing saved descriptions", () => {
  assert.equal(repairConceptDescription("[REPAIR] Cambio de aceite"), "Cambio de aceite");
  assert.equal(repairConceptDescription(null), "");
  assert.equal(repairConceptDescription("Servicio general"), "Servicio general");
});
