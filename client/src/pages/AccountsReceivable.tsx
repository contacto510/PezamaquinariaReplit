import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Eye } from "lucide-react";
import type {
  AccountsReceivableResponse,
  ClientReceivable,
} from "@/types/accounts-receivable";

type SortKey = "balance" | "oldestDays" | "name";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pendiente: { label: "Pendiente", cls: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    facturado: { label: "Facturado", cls: "bg-blue-100 text-blue-800 border-blue-300" },
    pagado: { label: "Pagado", cls: "bg-green-100 text-green-800 border-green-300" },
    vencido: { label: "Vencido", cls: "bg-red-100 text-red-800 border-red-300" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-800 border-gray-300" };
  return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
}

function ClientRow({ c }: { c: ClientReceivable }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <>
        <TableRow className={c.hasOverdue ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-gray-50"}>
          <TableCell>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center gap-2 text-left font-medium text-gray-900 hover:text-yellow-700"
                data-testid={`button-toggle-${c.clientId}`}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="truncate">{c.clientName}</span>
              </button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell className="text-center">{c.reportsCount}</TableCell>
          <TableCell className="text-right tabular-nums">{formatCurrency(c.totalBilled)}</TableCell>
          <TableCell className="text-right tabular-nums text-green-700">{formatCurrency(c.totalPaid)}</TableCell>
          <TableCell className="text-right font-bold tabular-nums text-gray-900">{formatCurrency(c.balance)}</TableCell>
          <TableCell className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-sm">
              {c.hasOverdue ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <Clock className="h-4 w-4 text-amber-500" />
              )}
              <span className={c.hasOverdue ? "text-red-700 font-semibold" : "text-gray-700"}>
                {c.oldestDays}d
              </span>
            </div>
          </TableCell>
          <TableCell className="text-center">
            <Link href={`/clients/${c.clientId}`}>
              <Button variant="ghost" size="sm" data-testid={`button-view-client-${c.clientId}`}>
                <Eye className="h-4 w-4" />
              </Button>
            </Link>
          </TableCell>
        </TableRow>
        <CollapsibleContent asChild>
          <TableRow>
            <TableCell colSpan={7} className="bg-gray-50 p-0">
              <div className="p-4">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Reportes pendientes ({c.reports.length})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-3">Reporte</th>
                        <th className="py-2 pr-3">Obra</th>
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3 text-right">Total</th>
                        <th className="py-2 pr-3 text-right">Abonado</th>
                        <th className="py-2 pr-3 text-right">Saldo</th>
                        <th className="py-2 pr-3 text-center">Días</th>
                        <th className="py-2 pr-3 text-center">Estatus</th>
                        <th className="py-2 text-center">Ver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.reports.map((r) => (
                        <tr key={r.id} className={r.isOverdue ? "bg-red-50/60" : ""}>
                          <td className="py-2 pr-3 font-medium">{r.reportNumber}</td>
                          <td className="py-2 pr-3 truncate max-w-[200px]">{r.nombreObra}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {new Date(r.fechaReporte).toLocaleDateString("es-MX")}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(r.total)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-green-700">{formatCurrency(r.paid)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums font-semibold">{formatCurrency(r.balance)}</td>
                          <td className="py-2 pr-3 text-center">
                            <span className={r.isOverdue ? "text-red-700 font-semibold" : ""}>{r.daysSinceReport}d</span>
                          </td>
                          <td className="py-2 pr-3 text-center">{statusBadge(r.paymentStatus)}</td>
                          <td className="py-2 text-center">
                            <Link href={`/reports/${r.id}/edit`}>
                              <Button variant="ghost" size="sm" data-testid={`button-view-report-${r.id}`}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

export default function AccountsReceivable() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const [sortBy, setSortBy] = useState<SortKey>("balance");

  const { data, isLoading, error } = useQuery<AccountsReceivableResponse>({
    queryKey: ["/api/accounts-receivable"],
    staleTime: 60000,
  });

  const clients = useMemo(() => {
    if (!data?.clients) return [];
    let list = data.clients;
    if (filter === "overdue") list = list.filter((c) => c.hasOverdue);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.clientName.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sortBy === "balance") sorted.sort((a, b) => b.balance - a.balance);
    else if (sortBy === "oldestDays") sorted.sort((a, b) => b.oldestDays - a.oldestDays);
    else if (sortBy === "name") sorted.sort((a, b) => a.clientName.localeCompare(b.clientName));
    return sorted;
  }, [data, filter, search, sortBy]);

  const summary = data?.summary;

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="peza-header rounded-xl p-6 mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-black">Cuentas por Cobrar</h1>
        <p className="mt-2 text-lg text-black/80">
          Saldo pendiente de reportes de renta agrupados por cliente
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="border-l-4 border-red-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-red-600 mb-1">Saldo total</p>
            <p className="text-2xl font-bold text-red-900 tabular-nums" data-testid="text-total-balance">
              {formatCurrency(summary?.totalBalance ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-yellow-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-yellow-700 mb-1">Clientes con deuda</p>
            <p className="text-2xl font-bold text-yellow-900" data-testid="text-clients-count">
              {summary?.clientsCount ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-blue-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-blue-600 mb-1">Reportes pendientes</p>
            <p className="text-2xl font-bold text-blue-900" data-testid="text-pending-reports">
              {summary?.pendingReportsCount ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-orange-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-orange-600 mb-1">
              Vencidos (&gt;{summary?.overdueDaysThreshold ?? 30}d)
            </p>
            <p className="text-2xl font-bold text-orange-900" data-testid="text-overdue-count">
              {summary?.overdueClientsCount ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
            data-testid="input-search-client"
          />
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="sm:w-[200px]" data-testid="select-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              <SelectItem value="overdue">Solo vencidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="sm:w-[220px]" data-testid="select-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balance">Ordenar por saldo (mayor)</SelectItem>
              <SelectItem value="oldestDays">Ordenar por antigüedad</SelectItem>
              <SelectItem value="name">Ordenar por nombre</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-10 text-gray-500">Cargando…</div>
          ) : error ? (
            <div className="text-center py-10 text-red-600">Error al cargar cuentas por cobrar.</div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {search || filter !== "all"
                ? "No hay resultados con esos filtros."
                : "¡No hay deuda pendiente!"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-100">
                    <TableHead className="font-semibold">Cliente</TableHead>
                    <TableHead className="text-center font-semibold">Reportes</TableHead>
                    <TableHead className="text-right font-semibold">Total facturado</TableHead>
                    <TableHead className="text-right font-semibold">Abonado</TableHead>
                    <TableHead className="text-right font-semibold">Saldo</TableHead>
                    <TableHead className="text-center font-semibold">Antigüedad</TableHead>
                    <TableHead className="text-center font-semibold">Cliente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <ClientRow key={c.clientId} c={c} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
