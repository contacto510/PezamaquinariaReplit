/** Accept old clients and saved tab preferences without reintroducing retired statuses. */
export function normalizeRepairStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  return ["diagnóstico", "no entregada", "taller"].includes(normalized) ? "Taller" : status;
}

export function migrateRepairTabOrder(saved: unknown, defaults: string[]): string[] {
  if (!Array.isArray(saved)) return [...defaults];
  const valid = [...new Set(saved.filter((value): value is string => typeof value === "string")
    .map(normalizeRepairStatus).filter(value => defaults.includes(value)))];
  return [...valid, ...defaults.filter(value => !valid.includes(value))];
}
