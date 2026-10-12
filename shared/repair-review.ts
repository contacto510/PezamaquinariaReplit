export class InvalidRepairReview extends Error {}

export function reviewAmountValue(value: unknown): string {
  if ((typeof value !== "string" && typeof value !== "number") ||
      !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
      !Number.isFinite(Number(value)) || Number(value) > 99999999.99) {
    throw new InvalidRepairReview("El monto de revisión debe ser positivo, con máximo dos decimales.");
  }
  return Number(value).toFixed(2);
}

/** Review amount is before IVA, just like a repair concept's unit price. */
export function calculateRepairReviewTotals(
  itemsSubtotal: number, reviewAmount: string | number, reviewOnly: boolean, includeIVA: boolean,
) {
  const fee = Math.round(Number(reviewAmountValue(reviewAmount)) * 100);
  const cents = (reviewOnly ? 0 : Math.round(itemsSubtotal * 100)) + fee;
  const tax = includeIVA ? Math.round(cents * 0.16) : 0;
  if (!Number.isSafeInteger(cents) || cents < 0 || cents + tax > 9999999999) {
    throw new InvalidRepairReview("El total de la reparación excede el monto permitido.");
  }
  return { subtotal: (cents / 100).toFixed(2), iva: (tax / 100).toFixed(2), total: ((cents + tax) / 100).toFixed(2) };
}

type ReviewFields = { paymentStatus?: string | null; reviewAmount?: string | number | null; reviewOnly?: boolean | null };
export function resolveRepairReview(previous: ReviewFields | null, change: ReviewFields) {
  const paymentStatus = change.paymentStatus ?? previous?.paymentStatus ?? "No Pagada";
  const reviewAmount = reviewAmountValue(change.reviewAmount ?? previous?.reviewAmount ?? "0");
  const reviewOnly = paymentStatus === "Revisión"
    ? true : change.reviewOnly ?? previous?.reviewOnly ?? false;
  if (reviewOnly && Number(reviewAmount) <= 0) {
    throw new InvalidRepairReview("Capture un monto de revisión mayor a cero.");
  }
  if (previous?.paymentStatus === "Pagada" && paymentStatus === "Pagada" &&
      (reviewAmount !== reviewAmountValue(previous.reviewAmount ?? "0") ||
       reviewOnly !== (previous.reviewOnly ?? false))) {
    throw new InvalidRepairReview("Cambie primero a No Pagada antes de modificar el cobro de una reparación liquidada.");
  }
  return { reviewAmount, reviewOnly };
}
