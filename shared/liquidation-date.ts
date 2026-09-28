/** The date displayed on paid rows is evidence of liquidation, not a payment-status estimate. */
export const UNRECORDED_LIQUIDATION_DATE = "Fecha no registrada";

type Timestamp = string | Date | null | undefined;
type PaymentEntry = {
  id?: number | null;
  amount?: string | number | null;
  createdAt?: Timestamp;
};

const mexicanDateFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function trustedInstant(value: Timestamp): Date | null {
  // An offset is essential: a timezone-less timestamp cannot identify the
  // calendar day in Mexico with confidence.
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  if (typeof value === "string" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function cents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fractional = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}

function formatMexicanDate(date: Date): string {
  const parts = mexicanDateFormatter.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("day")}/${value("month")}/${value("year")}`;
}

export function reportLiquidationDate(report: {
  total?: string | number | null;
  payments?: PaymentEntry[] | null;
}): string {
  const total = cents(report.total);
  if (total === null || total <= 0 || !Array.isArray(report.payments) || !report.payments.length) {
    return UNRECORDED_LIQUIDATION_DATE;
  }

  const entries: { id: number; amount: number; createdAt: Date }[] = [];
  const ids = new Set<number>();
  for (const payment of report.payments) {
    if (!payment) return UNRECORDED_LIQUIDATION_DATE;
    const amount = cents(payment.amount);
    const createdAt = trustedInstant(payment.createdAt);
    if (!Number.isSafeInteger(payment.id) || (payment.id as number) <= 0 ||
        ids.has(payment.id as number) || amount === null || amount <= 0 || !createdAt) {
      return UNRECORDED_LIQUIDATION_DATE;
    }
    const id = payment.id as number;
    ids.add(id);
    entries.push({ id, amount, createdAt });
  }

  entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  let paid = 0;
  for (const entry of entries) {
    paid += entry.amount;
    if (!Number.isSafeInteger(paid)) return UNRECORDED_LIQUIDATION_DATE;
    if (paid >= total) return formatMexicanDate(entry.createdAt);
  }
  return UNRECORDED_LIQUIDATION_DATE;
}

export function repairLiquidationDate(liquidatedAt: Timestamp): string {
  const date = trustedInstant(liquidatedAt);
  return date ? formatMexicanDate(date) : UNRECORDED_LIQUIDATION_DATE;
}