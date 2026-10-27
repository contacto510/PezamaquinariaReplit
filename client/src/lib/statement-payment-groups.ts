import {
  paymentGroupLabel,
  statementCurrency,
  statementPaymentDate,
  statementPaymentMethod,
  type StatementPayment,
} from "./statement-payment-detail";

type PaymentReport = {
  id?: number;
  folioReporte?: string | null;
  reportNumber?: string | null;
  payments?: StatementPayment[] | null;
};

/**
 * Read-only view of the current applications. No heuristic matching or
 * reconstruction of an original receipt amount from editable/deleted rows.
 */
export function getStatementPaymentGroups(reports: PaymentReport[]) {
  const groups = new Map<string, {
    id: string;
    label: string;
    totalCents: number;
    allocations: {
      folio: string;
      amount: number;
      date: string;
      dateKey: string;
      method: string;
    }[];
  }>();
  const seen = new Set<string>();
  for (const report of reports) {
    for (const payment of report.payments || []) {
      const id = payment.paymentGroupId;
      const amount = Number(payment.amount);
      if (!id || !Number.isFinite(amount) || amount <= 0) continue;
      // Guard against a repeated report in the input without merging genuine
      // same-date/same-amount payment rows.
      const rowKey = payment.id == null ? null : `${report.id}:${payment.id}`;
      if (rowKey && seen.has(rowKey)) continue;
      if (rowKey) seen.add(rowKey);
      const date = statementPaymentDate(payment.paymentDate);
      const group = groups.get(id) || {
        id, label: paymentGroupLabel(id), totalCents: 0, allocations: [],
      };
      group.totalCents += Math.round(amount * 100);
      group.allocations.push({
        folio: report.folioReporte || report.reportNumber || "Folio no registrado",
        amount,
        date: date?.label || "Fecha no registrada",
        dateKey: date?.key || "99999999",
        method: statementPaymentMethod(payment.paymentMethod),
      });
      groups.set(id, group);
    }
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    total: group.totalCents / 100,
    allocations: group.allocations.sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey) || a.folio.localeCompare(b.folio, "es", { numeric: true })),
  })).sort((a, b) =>
    a.allocations[0].dateKey.localeCompare(b.allocations[0].dateKey) ||
    a.id.localeCompare(b.id));
}

export function statementPaymentGroupRows(reports: PaymentReport[]): string[][] {
  return getStatementPaymentGroups(reports).map((group) => [[
    group.label,
    ...group.allocations.map((allocation) =>
      `${allocation.folio}: ${statementCurrency.format(allocation.amount)} — ${allocation.date} — ${allocation.method}.`),
    `Total aplicado registrado: ${statementCurrency.format(group.total)}.`,
  ].join("\n")]);
}
