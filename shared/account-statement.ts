type ReportLike = {
  total?: string | number | null;
  paymentStatus?: string | null;
  nombreObra?: string | null;
  paymentSummary?: { totalPaid?: string | number | null } | null;
  payments?: Array<{ amount?: string | number | null }> | null;
};

type RepairLike = {
  total?: string | number | null;
  status?: string | null;
  paymentStatus?: string | null;
  reviewOnly?: boolean | null;
};

const EXCLUDED_REPAIR_STATUSES = new Set([
  "No autorizado",
  "Espera de confirmación",
  "Diagnóstico",
]);

function money(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isRepairReport(report: ReportLike): boolean {
  return (report.nombreObra || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .startsWith("REPARACION");
}

export function isBillableRepair(repair: RepairLike): boolean {
  return (
    (repair.reviewOnly === true || !EXCLUDED_REPAIR_STATUSES.has(repair.status || "")) &&
    repair.paymentStatus !== "Cotización" &&
    money(repair.total) > 0.005
  );
}

export function getReportAccountAmounts(report: ReportLike) {
  const total = money(report.total);
  const paymentTotal = report.payments?.reduce(
    (sum, payment) => sum + money(payment.amount),
    0,
  ) ?? 0;
  const recordedPaid = report.paymentSummary
    ? money(report.paymentSummary.totalPaid)
    : paymentTotal;
  const paid = report.paymentStatus === "pagado" ? total : recordedPaid;
  return { total, paid, pending: Math.max(0, total - paid) };
}

export function getRepairAccountAmounts(repair: RepairLike) {
  const total = money(repair.total);
  const paid = repair.paymentStatus === "Pagada" ? total : 0;
  return { total, paid, pending: Math.max(0, total - paid) };
}

export function summarizeAccountStatement(
  reports: ReportLike[] = [],
  repairs: RepairLike[] = [],
) {
  const rentalReports = reports.filter((report) => !isRepairReport(report));
  const billableRepairs = repairs.filter(isBillableRepair);
  const amounts = [
    ...rentalReports.map(getReportAccountAmounts),
    ...billableRepairs.map(getRepairAccountAmounts),
  ];

  return {
    totalEntries: amounts.length,
    reportEntries: rentalReports.length,
    repairEntries: billableRepairs.length,
    totalAmount: amounts.reduce((sum, entry) => sum + entry.total, 0),
    totalPaidAmount: amounts.reduce((sum, entry) => sum + entry.paid, 0),
    totalPendingAmount: amounts.reduce((sum, entry) => sum + entry.pending, 0),
  };
}