type StatementPayment = {
  id?: number | null;
  amount?: string | number | null;
  paymentDate?: string | Date | null;
};

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const paymentDateFormatter = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function validCalendarDay(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function paymentDate(value: StatementPayment["paymentDate"]) {
  // Match the payment dialog's Mexican calendar date, not createdAt (entry date)
  // or the report's date. Bare calendar dates must not shift back one day.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!validCalendarDay(value)) return null;
    const [year, month, day] = value.split("-");
    return { label: `${day}/${month}/${year}`, key: `${year}${month}${day}` };
  }
  if (!(value instanceof Date) && (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value))) {
    return null;
  }
  if (typeof value === "string" && !validCalendarDay(value.slice(0, 10))) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = paymentDateFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  const year = parts.find((part) => part.type === "year")!.value;
  return { label: `${day}/${month}/${year}`, key: `${year}${month}${day}` };
}

/**
 * Presentation only: the authoritative paid amount still comes from the
 * shared account rules. Missing evidence must never become a fabricated payment.
 */
export function getStatementPaymentDetail(
  payments: StatementPayment[] | null | undefined,
  totalPaid: number,
): { tableText: string; noteText: string } {
  const entries = (payments || []).flatMap((payment, index) => {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const date = paymentDate(payment.paymentDate);
    return [{
      amount,
      date,
      index,
      text: `${currency.format(amount)} — ${date?.label || "Fecha no registrada"}`,
    }];
  }).sort((a, b) =>
    (a.date?.key || "99999999").localeCompare(b.date?.key || "99999999") ||
    a.index - b.index,
  );

  if (entries.length === 0) {
    return totalPaid > 0
      ? {
        tableText: `${currency.format(totalPaid)}\nSin desglose registrado`,
        noteText: `Total abonado: ${currency.format(totalPaid)}. Sin desglose de movimientos registrado.`,
      }
      : { tableText: currency.format(totalPaid), noteText: "Sin abonos registrados." };
  }

  const recordedCents = entries.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0);
  const mismatched = recordedCents !== Math.round(totalPaid * 100);
  const warning = "El desglose registrado no coincide con el total abonado.";
  const lines = entries.map((entry) => entry.text);
  return {
    tableText: [
      ...lines,
      `Total: ${currency.format(totalPaid)}`,
      ...(mismatched ? [warning] : []),
    ].join("\n"),
    noteText: `Abonos registrados: ${lines.join("; ")}. Total abonado: ${currency.format(totalPaid)}.${mismatched ? ` ${warning}` : ""}`,
  };
}
