import test from "node:test";
import assert from "node:assert/strict";
import type { Concept } from "@shared/schema";
import { rentalConceptItem, rentalConceptQuantity } from "./web-rental-concept";
import { searchQuotationConcepts } from "./quotation-concept-search";

const concept = { id: 1, name: "GENERADOR 5000 W", defaultUnit: "Días", defaultPrice: "500.00" } as Concept;

test("daily tariffs use equipment-days; other units do not assume a duration conversion", () => {
  for (const unit of ["Día", "DÍAS", " dias "]) assert.equal(rentalConceptQuantity(unit, 2, 5), 10);
  for (const unit of ["Pieza", "Semana", "Mes", null]) assert.equal(rentalConceptQuantity(unit, 2, 5), 2);
});
test("confirmed item preserves catalog name, unit, price and editable quantity", () => {
  assert.deepEqual(rentalConceptItem(concept, 10), { concept: concept.name, quantity: 10, unit: "Días", unitPrice: 500 });
  assert.equal(rentalConceptItem(concept, 3).quantity, 3);
  assert.equal(rentalConceptItem({ ...concept, defaultPrice: "0" }, 1).unitPrice, 0);
});
test("missing or invalid prices, units and quantities cannot invent an item", () => {
  for (const defaultPrice of [null, "", "invalid", "-1"]) assert.throws(() => rentalConceptItem({ ...concept, defaultPrice }, 1));
  for (const quantity of [0, -1, NaN, Infinity]) assert.throws(() => rentalConceptItem(concept, quantity));
  assert.throws(() => rentalConceptItem({ ...concept, defaultUnit: null }, 1));
});
test("web equipment search uses the same flexible catalog matching, without inventing matches", () => {
  assert.deepEqual(searchQuotationConcepts([concept], "5000 generador"), [concept]);
  assert.deepEqual(searchQuotationConcepts([concept], "bomba"), []);
});
