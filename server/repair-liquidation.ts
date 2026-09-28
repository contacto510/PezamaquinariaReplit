// Date-only values are anchored at noon UTC so the selected day stays the
// same in Mexico City (including daylight-saving dates in historical records).
export class InvalidLiquidationDate extends Error {}

export function parseLiquidationDay(value: unknown, now = new Date()): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidLiquidationDate("La fecha de liquidación debe tener formato AAAA-MM-DD");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidLiquidationDate("Fecha de liquidación inválida");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  if (value > today) {
    throw new InvalidLiquidationDate("La fecha de liquidación no puede ser futura en México");
  }
  return date;
}

export function resolveLiquidatedAt(
  previousStatus: string | null | undefined,
  previousDate: Date | null | undefined,
  nextStatus: string | null | undefined,
  explicitDate?: Date,
  now = new Date(),
): Date | null {
  if (explicitDate !== undefined && (previousStatus !== "Pagada" || nextStatus !== "Pagada")) {
    throw new InvalidLiquidationDate("Solo se puede corregir la fecha de una reparación ya pagada");
  }
  if (nextStatus !== "Pagada") return null;
  if (explicitDate !== undefined) return explicitDate;
  if (previousStatus === "Pagada") return previousDate ?? null;
  return now;
}