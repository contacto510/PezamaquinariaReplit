import { normalizeForSearch } from "./concept-filter";

/** Quotation search is deliberately independent of ReportForm's prefix filter. */
export function quotationConceptScore(name: string, search: string): number {
  const value = normalizeForSearch(name).replace(/\s+/g, " ");
  const query = normalizeForSearch(search).replace(/\s+/g, " ");
  if (!query) return 1;
  if (value === query) return 4;
  if (!query.split(" ").every(word => value.includes(word))) return 0;

  // Keep relevance tiers separate even for exceptionally long catalog names.
  const closeness = 1 / (1 + Math.max(0, value.length - query.length));
  return (value.startsWith(query) ? 2 : 1) + closeness;
}

export function searchQuotationConcepts<T extends { name: string }>(
  concepts: readonly T[],
  search: string,
): T[] {
  return concepts
    .map(concept => ({ concept, score: quotationConceptScore(concept.name, search) }))
    .filter(result => result.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.concept.name.localeCompare(b.concept.name, "es", { sensitivity: "base" })
    )
    .map(result => result.concept);
}
