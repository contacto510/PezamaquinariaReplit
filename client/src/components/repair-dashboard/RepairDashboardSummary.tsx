import { Link } from "wouter";
import { ArrowRight, CircleDollarSign, ClipboardCheck, Wrench } from "lucide-react";
import { selectRepairDashboard } from "@shared/repair-dashboard";
import { formatCurrency } from "@/lib/utils";
import { useRepairDashboard } from "./useRepairDashboard";

function SummarySkeleton() {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cargando resumen de reparaciones">
    {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-amber-100 bg-amber-50/70" />)}
  </div>;
}

export default function RepairDashboardSummary() {
  const { data, isLoading, isError, refetch } = useRepairDashboard();
  if (isLoading) return <SummarySkeleton />;
  if (isError || !data) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-stone-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>No se pudo cargar el resumen de reparaciones.</span>
        <button onClick={() => refetch()} className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 font-semibold">Reintentar</button>
      </div>
    </div>
  );
  const { summary } = selectRepairDashboard(data.entries);
  const cards = [
    { title: "Reparaciones", value: String(summary.totalCount), note: "Todas · acumulado histórico", icon: Wrench, href: "/repairs/dashboard", color: "text-stone-800" },
    { title: "Saldo pendiente", value: formatCurrency(summary.pendingAmount), note: `${summary.pendingCount} reparaciones · saldo actual`, icon: CircleDollarSign, href: "/repairs/dashboard?group=pending", color: "text-rose-800" },
    { title: "Terminadas por entregar", value: String(summary.readyCount), note: "Estado operativo actual", icon: ClipboardCheck, href: "/repairs/dashboard?group=ready", color: "text-amber-900" },
    { title: "Entregadas sin liquidar", value: formatCurrency(summary.deliveredUnpaidAmount), note: `${summary.deliveredUnpaidCount} reparaciones · saldo actual`, icon: ArrowRight, href: "/repairs/dashboard?group=deliveredUnpaid", color: "text-orange-900" },
  ];
  return <section aria-labelledby="repair-summary-title" className="mb-8">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Taller · todas las fechas</p>
        <h2 id="repair-summary-title" className="text-xl font-bold text-stone-900">Resumen de reparaciones</h2>
      </div>
      <Link href="/repairs/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-stone-800 hover:bg-amber-100">
        Tablero completo <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ title, value, note, icon: Icon, href, color }) => <Link key={title} href={href} className="group min-h-28 rounded-xl border border-amber-200 bg-[#fffdf6] p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</p><p className={`mt-1 break-words text-xl font-bold tabular-nums ${color}`}>{value}</p></div>
          <Icon className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
        </div>
        <p className="mt-2 text-xs text-stone-600">{note}</p>
      </Link>)}
    </div>
  </section>;
}
