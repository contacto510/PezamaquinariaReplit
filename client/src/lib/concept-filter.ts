/**
 * Normaliza un texto para búsqueda: minúsculas, sin acentos, sin espacios extra.
 */
export function normalizeForSearch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Filtro de conceptos por PREFIJO para el <Command> de cmdk u otros buscadores.
 * - Solo coincide cuando el nombre del concepto EMPIEZA con lo que se escribe.
 *   Ej: escribir "servicio de recoleccion" solo muestra los que comienzan así
 *   (como "SERVICIO DE RECOLECCION Y ENTREGA EN OBRA"), no los que lo contienen
 *   en medio.
 * - Ignora acentos y mayúsculas (vía normalizeForSearch).
 * - Ordena por cercanía: la coincidencia exacta primero, luego las que tienen el
 *   prefijo más cercano (menos texto sobrante).
 * Retorna 0 cuando no hay match (cmdk lo descarta), o un número > 0 (ranking).
 */
export function conceptFilter(value: string, search: string): number {
  const v = normalizeForSearch(value);
  const q = normalizeForSearch(search);
  if (!q) return 1;
  if (!v.startsWith(q)) return 0;
  // Mientras menos texto sobrante después del prefijo, más exacta es la
  // coincidencia → mayor score. Exacto (v === q) obtiene el máximo.
  return 1000 - Math.min(v.length - q.length, 999);
}

/**
 * Versión booleana del filtro: útil para filtrar arrays manualmente.
 */
export function conceptMatches(value: string, search: string): boolean {
  return conceptFilter(value, search) > 0;
}
