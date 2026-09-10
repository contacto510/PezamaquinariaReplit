import {
  getReportAccountAmounts,
  getRepairAccountAmounts,
  isRepairReport,
  isBillableRepair,
} from "./account-statement";

type ReportInput = Parameters<typeof getReportAccountAmounts>[0] & {
  id: number;
  clientId: number;
  clientName: string;
  client?: { name: string } | null;
  reportNumber: string;
  folioReporte: string;
  projectId: number;
  fechaReporte: Date | string;
};

type RepairInput = Parameters<typeof getRepairAccountAmounts>[0] & {
  id: number;
  clientId: number | null;
  client?: { name: string } | null;
  repairNumber: string;
  equipment: string;
  receivedDate: Date | string;
};

type PendingMovement = {
  type: "report" | "repair";
  id: number;
  reportNumber: string;
  folioReporte: string;
  projectId: number | null;
  nombreObra: string;
  fechaReporte: Date;
  total: number;
  paid: number;
  balance: number;
  paymentStatus: string;
  daysSinceReport: number;
  isOverdue: boolean;
};

type ClientGroup = {
  clientId: number;
  clientName: string;
  reportsCount: number;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  oldestReportDate: Date;
  oldestDays: number;
  hasOverdue: boolean;
  statusBreakdown: Record<string, number>;
  reports: PendingMovement[];
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

// Keep legacy response keys for API compatibility; "reports" now contains
// typed pending movements from both sources.
export function buildAccountsReceivable(
  reports: ReportInput[],
  repairs: RepairInput[],
  now = Date.now(),
) {
  const overdueDaysThreshold = 30;
  const grouped = new Map<number, ClientGroup>();

  function add(
    clientId: number,
    clientName: string,
    row: Omit<PendingMovement, "daysSinceReport" | "isOverdue">,
  ) {
    if (row.balance <= 0) return;
    const daysSinceReport = Math.max(
      0,
      Math.floor((now - row.fechaReporte.getTime()) / 86400000),
    );
    const isOverdue = row.paymentStatus === "vencido" ||
      daysSinceReport > overdueDaysThreshold;
    let group = grouped.get(clientId);
    if (!group) {
      group = {
        clientId, clientName, reportsCount: 0, totalBilled: 0, totalPaid: 0,
        balance: 0, oldestReportDate: row.fechaReporte,
        oldestDays: daysSinceReport, hasOverdue: false,
        statusBreakdown: {}, reports: [],
      };
      grouped.set(clientId, group);
    }
    group.reportsCount++;
    group.totalBilled = roundMoney(group.totalBilled + row.total);
    group.totalPaid = roundMoney(group.totalPaid + row.paid);
    group.balance = roundMoney(group.balance + row.balance);
    if (row.fechaReporte < group.oldestReportDate) {
      group.oldestReportDate = row.fechaReporte;
      group.oldestDays = daysSinceReport;
    }
    group.hasOverdue ||= isOverdue;
    group.statusBreakdown[row.paymentStatus] =
      (group.statusBreakdown[row.paymentStatus] || 0) + 1;
    group.reports.push({ ...row, daysSinceReport, isOverdue });
  }

  for (const report of reports) {
    if (isRepairReport(report)) continue;
    const amounts = getReportAccountAmounts(report);
    add(report.clientId, report.client?.name || report.clientName, {
      type: "report", id: report.id, reportNumber: report.reportNumber,
      folioReporte: report.folioReporte, projectId: report.projectId,
      nombreObra: report.nombreObra || "",
      fechaReporte: new Date(report.fechaReporte),
      total: amounts.total, paid: amounts.paid, balance: amounts.pending,
      paymentStatus: report.paymentStatus || "pendiente",
    });
  }

  for (const repair of repairs) {
    if (repair.clientId == null || !isBillableRepair(repair)) continue;
    const amounts = getRepairAccountAmounts(repair);
    add(repair.clientId, repair.client?.name || `Cliente ${repair.clientId}`, {
      type: "repair", id: repair.id, reportNumber: repair.repairNumber,
      folioReporte: repair.repairNumber, projectId: null,
      nombreObra: repair.equipment,
      fechaReporte: new Date(repair.receivedDate),
      total: amounts.total, paid: amounts.paid, balance: amounts.pending,
      paymentStatus: repair.paymentStatus || "No Pagada",
    });
  }

  const clients = Array.from(grouped.values()).sort((a, b) => b.balance - a.balance);
  for (const client of clients) {
    client.reports.sort((a, b) => b.fechaReporte.getTime() - a.fechaReporte.getTime());
  }
  return {
    summary: {
      totalBalance: roundMoney(clients.reduce((sum, c) => sum + c.balance, 0)),
      clientsCount: clients.length,
      pendingReportsCount: clients.reduce((sum, c) => sum + c.reportsCount, 0),
      overdueClientsCount: clients.filter(c => c.hasOverdue).length,
      overdueDaysThreshold,
    },
    clients,
  };
}