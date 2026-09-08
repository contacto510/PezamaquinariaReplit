export interface PendingReportRow {
  id: number;
  reportNumber: string;
  folioReporte: string;
  projectId: number;
  nombreObra: string;
  fechaReporte: string;
  total: number;
  paid: number;
  balance: number;
  paymentStatus: string;
  daysSinceReport: number;
  isOverdue: boolean;
}

export interface ClientReceivable {
  clientId: number;
  clientName: string;
  reportsCount: number;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  oldestReportDate: string;
  oldestDays: number;
  hasOverdue: boolean;
  statusBreakdown: Record<string, number>;
  reports: PendingReportRow[];
}

export interface AccountsReceivableSummary {
  totalBalance: number;
  clientsCount: number;
  pendingReportsCount: number;
  overdueClientsCount: number;
  overdueDaysThreshold: number;
}

export interface AccountsReceivableResponse {
  summary: AccountsReceivableSummary;
  clients: ClientReceivable[];
}
