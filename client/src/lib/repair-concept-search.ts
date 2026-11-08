import { normalizeForSearch } from "./concept-filter";

interface SearchableRepairConcept {
  name: string;
  description?: string | null;
  category?: string | null;
}

export function repairConceptDescription(description?: string | null): string {
  return (description ?? "").replace(/\[REPAIR\]/g, "").trim();
}

export function repairConceptScore(concept: SearchableRepairConcept, search: string): number {
  const name = normalizeForSearch(concept.name).replace(/\s+/g, " ");
  const description = normalizeForSearch(repairConceptDescription(concept.description)).replace(/\s+/g, " ");
  const query = normalizeForSearch(search).replace(/\s+/g, " ");
  if (!query) return 1;
  const words = query.split(" ");
  if (!words.every(word => `${name} ${description}`.includes(word))) return 0;
  if (name === query) return 5;
  const closeness = 1 / (1 + Math.max(0, name.length - query.length));
  if (name.startsWith(query)) return 3 + closeness;
  if (words.every(word => name.includes(word))) return 2 + closeness;
  return 1 + closeness;
}

/** Preserve both modern categories and the legacy repair-description marker. */
export function searchRepairConcepts<T extends SearchableRepairConcept>(
  concepts: readonly T[],
  search: string,
): { repair: T[]; general: T[] } {
  const ranked = concepts
    .map(concept => ({ concept, score: repairConceptScore(concept, search) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score ||
      a.concept.name.localeCompare(b.concept.name, "es", { sensitivity: "base" }))
    .map(result => result.concept);
  return {
    repair: ranked.filter(concept =>
      concept.category === "repair" || concept.description?.includes("[REPAIR]")),
    general: ranked.filter(concept =>
      concept.category !== "repair" && !concept.description?.includes("[REPAIR]")),
  };
}
