import type { Concept, QuotationItemData } from "@shared/schema";
import { normalizeForSearch } from "./concept-filter";

export function rentalConceptQuantity(unit: string | null, equipment: number, days: number): number {
  const normalized = normalizeForSearch(unit || "");
  return normalized === "dia" || normalized === "dias" ? equipment * days : equipment;
}

export function rentalConceptItem(concept: Concept, quantity: number): QuotationItemData {
  const price = concept.defaultPrice == null || concept.defaultPrice === ""
    ? NaN : Number(concept.defaultPrice);
  if (!Number.isFinite(price) || price < 0) throw new Error("Este concepto no tiene un precio válido en el catálogo. Selecciónalo manualmente en la tabla.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (!concept.defaultUnit?.trim()) throw new Error("Este concepto no tiene unidad. Complétalo manualmente en la tabla.");
  return { concept: concept.name, quantity, unit: concept.defaultUnit, unitPrice: price };
}
