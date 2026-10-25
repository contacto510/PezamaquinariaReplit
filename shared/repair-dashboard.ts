import { getRepairAccountAmounts, isBillableRepair } from "./account-statement";
import { normalizeRepairStatus } from "./repair-status";

type Timestamp = Date | string | null | undefined;
export type RepairDashboardSource = {
  id: number;
  repairNumber?: string | null;
  clientId?: number | null;
  client?: { name?: string | null } | null;
  equipment?: string | null;
  repairManager?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  total?: string | number | null;
  reviewOnly?: boolean | null;
  reviewAmount?: string | number | null;
  includeIVA?: boolean | null;
  receivedDate?: Timestamp;
  deliveryDate?: Timestamp;
  liquidatedAt?: Timestamp;
};

const mexicanDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric", month: "2-digit", day: "2-digit",
});

function calendarDay(value: Timestamp, businessDate = false): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return businessDate && Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  if (typeof value === "string" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (businessDate) return parsed.toISOString().slice(0, 10);
  const parts = mexicanDay.formatToParts(parsed);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const cents = (amount: number) => Math.round(amount * 100);
const money = (amount: unknown) => {
  const result = Number(amount);
  return Number.isFinite(result) && result >= 0 ? result : 0;
};

/** Projection only. Use the raw status for billing to match the account statement,
 * and normalize old workshop statuses only for operational display. */
export function buildRepairDashboardSnapshot(
  sources: RepairDashboardSource[],
  now = new Date(),
) {
  const today = calendarDay(now)!;
  const entries = sources.map((repair) => {
    const billable = isBillableRepair(repair);
    const amounts = getRepairAccountAmounts(repair);
    const receivedDay = calendarDay(repair.receivedDate, true);
    const ageDays = receivedDay
      ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(receivedDay)) / 86400000))
      : null;
    const reviewBase = money(repair.reviewAmount);
    const reviewGross = repair.reviewOnly === true
      ? amounts.total
      : Math.min(amounts.total, reviewBase * (repair.includeIVA === false ? 1 : 1.16));
    return {
      id: repair.id,
      folio: repair.repairNumber || `Sin folio (${repair.id})`,
      clientId: repair.clientId ?? null,
      clientName: repair.client?.name || "Sin cliente vinculado",
      equipment: repair.equipment || "Sin equipo",
      manager: repair.repairManager?.trim() || "",
      status: normalizeRepairStatus(repair.status || ""),
      paymentStatus: repair.paymentStatus || "",
      billable,
      reviewOnly: repair.reviewOnly === true,
      total: amounts.total,
      paid: billable ? amounts.paid : 0,
      pending: billable ? amounts.pending : 0,
      reviewIncluded: billable && (reviewBase > 0 || repair.reviewOnly === true)
        ? cents(reviewGross) / 100 : 0,
      receivedDay,
      deliveryDay: calendarDay(repair.deliveryDate, true),
      liquidationDay: calendarDay(repair.liquidatedAt),
      ageDays,
    };
  });
  return { asOf: now.toISOString(), entries };
}

export type RepairDashboardResponse = ReturnType<typeof buildRepairDashboardSnapshot>;
export type RepairDashboardEntry = RepairDashboardResponse["entries"][number];
export type RepairDashboardFilters = {
  clientId?: string;
  manager?: string;
  status?: string;
  from?: string;
  to?: string;
};

/** Date filters apply to received/delivered/liquidated activity, never to the
 * current receivable. Client/manager/status filters apply to all groups. */
export function selectRepairDashboard(
  entries: RepairDashboardEntry[],
  filters: RepairDashboardFilters = {},
) {
  const rows = entries.filter((entry) =>
    (!filters.clientId || filters.clientId === "all" ||
      (filters.clientId === "unassigned" ? entry.clientId === null :
        String(entry.clientId) === filters.clientId)) &&
    (!filters.manager || filters.manager === "all" ||
      (filters.manager === "unassigned" ? !entry.manager : entry.manager === filters.manager)) &&
    (!filters.status || filters.status === "all" || entry.status === filters.status),
  );
  const inPeriod = (day: string | null) => !!day &&
    (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
  const billable = rows.filter((entry) => entry.billable);
  const pending = billable.filter((entry) => entry.pending > 0.005);
  const paid = billable.filter((entry) => entry.paymentStatus === "Pagada");
  const quotes = rows.filter((entry) => entry.paymentStatus === "Cotización");
  const reviews = billable.filter((entry) => entry.reviewIncluded > 0.005);
  const ready = rows.filter((entry) => entry.status === "Terminada");
  const deliveredUnpaid = pending.filter((entry) => entry.status === "Entregada");
  const open = rows.filter((entry) => !["Entregada", "No autorizado"].includes(entry.status));
  const older = open.filter((entry) => entry.ageDays !== null)
    .sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0) || a.id - b.id);
  const received = rows.filter((entry) => inPeriod(entry.receivedDay));
  const delivered = rows.filter((entry) => inPeriod(entry.deliveryDay));
  const liquidated = paid.filter((entry) => inPeriod(entry.liquidationDay));
  const undated = paid.filter((entry) => !entry.liquidationDay);
  const excluded = rows.filter((entry) => !entry.billable && entry.paymentStatus !== "Cotización");
  const groups = {
    all: rows, pending, paid, quotes, reviews, ready, deliveredUnpaid, older,
    received, delivered, liquidated, undated, excluded,
  };
  const sum = (list: RepairDashboardEntry[], field: "total" | "paid" | "pending" | "reviewIncluded") =>
    list.reduce((total, entry) => total + cents(entry[field]), 0) / 100;
  const operations = ["Espera de confirmación", "Taller", "En Proceso", "Terminada", "Entregada", "No autorizado"]
    .map((status) => ({ status, count: rows.filter((entry) => entry.status === status).length }));
  return {
    groups,
    operations,
    summary: {
      totalCount: rows.length,
      pendingAmount: sum(pending, "pending"), pendingCount: pending.length,
      paidAmount: sum(paid, "paid"), paidCount: paid.length,
      quoteAmount: sum(quotes, "total"), quoteCount: quotes.length,
      reviewAmount: sum(reviews, "reviewIncluded"), reviewCount: reviews.length,
      receivedCount: received.length, deliveredCount: delivered.length,
      liquidatedAmount: sum(liquidated, "paid"), liquidatedCount: liquidated.length,
      undatedAmount: sum(undated, "paid"), undatedCount: undated.length,
      readyCount: ready.length, deliveredUnpaidCount: deliveredUnpaid.length,
      deliveredUnpaidAmount: sum(deliveredUnpaid, "pending"),
      unassignedPendingCount: pending.filter((entry) => entry.clientId === null).length,
    },
  };
}

export type RepairDashboardGroup = keyof ReturnType<typeof selectRepairDashboard>["groups"];
