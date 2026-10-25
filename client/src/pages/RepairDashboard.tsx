import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, RotateCcw, Wrench } from "lucide-react";
import { selectRepairDashboard, type RepairDashboardFilters, type RepairDashboardGroup, type RepairDashboardEntry } from "@shared/repair-dashboard";
import { formatCurrency } from "@/lib/utils";
import { useRepairDashboard } from "@/components/repair-dashboard/useRepairDashboard";

const GROUPS: { id: RepairDashboardGroup; label: string; meaning: string }[] = [
  { id: "all", label: "Todas", meaning: "Todas las órdenes que coinciden con los filtros." },
  { id: "pending", label: "Saldo pendiente", meaning: "Saldo actual de reparaciones facturables; no cambia con el período." },
  { id: "paid", label: "Pagadas", meaning: "Reparaciones con estado de pago Pagada; vista actual." },
  { id: "quotes", label: "Cotizaciones", meaning: "Estimaciones separadas: no son deuda del cliente." },
  { id: "reviews", label: "Revisión", meaning: "Importe de revisión ya incluido en el total; no se suma de nuevo." },
  { id: "ready", label: "Listas para entregar", meaning: "Órdenes en estado operativo Terminada." },
  { id: "deliveredUnpaid", label: "Entregadas sin liquidar", meaning: "Entregadas con saldo pendiente actual." },
  { id: "older", label: "Antigua pendiente de concluir", meaning: "Órdenes abiertas, ordenadas por antigüedad desde recepción; no es una fecha de vencimiento." },
  { id: "received", label: "Recibidas en período", meaning: "Actividad según fecha de recepción dentro del período." },
  { id: "delivered", label: "Entregadas en período", meaning: "Actividad según fecha de entrega dentro del período." },
  { id: "liquidated", label: "Pagadas / liquidadas", meaning: "Pagos con fecha de liquidación dentro del período." },
  { id: "undated", label: "Pagadas sin fecha", meaning: "Pagadas sin fecha de liquidación registrada; no se infiere desde recepción." },
  { id: "excluded", label: "Fuera de cobro", meaning: "Registros no facturables que no son cotizaciones." },
];

const money = (value: number) => formatCurrency(value);
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`))
  : "—";
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "America/Mexico_City" }).format(date);
};

function Skeleton() {
  return <div className="space-y-5" aria-label="Cargando tablero de reparaciones">
    <div className="h-28 animate-pulse rounded-2xl bg-amber-100" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-stone-200" />)}</div>
    <div className="h-80 animate-pulse rounded-xl bg-stone-200" />
  </div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="block min-w-0 text-xs font-bold uppercase tracking-wide text-stone-600">
    {label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200">
      {children}
    </select>
  </label>;
}

function Metric({ label, value, caption, onClick, accent = "amber", disabled = false }: { label: string; value: string; caption: string; onClick: () => void; accent?: "amber" | "rose" | "teal" | "blue"; disabled?: boolean }) {
  const accents = { amber: "border-amber-400 bg-amber-50 text-amber-950", rose: "border-rose-400 bg-rose-50 text-rose-950", teal: "border-teal-500 bg-teal-50 text-teal-950", blue: "border-sky-500 bg-sky-50 text-sky-950" };
  return <button onClick={onClick} disabled={disabled} className={`min-h-28 min-w-0 rounded-xl border-l-4 p-4 text-left shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700 ${accents[accent]}`}>
    <span className="block text-xs font-bold uppercase tracking-wide opacity-70">{label}</span>
    <span className="mt-1 block break-words text-xl font-bold tabular-nums sm:text-2xl">{value}</span>
    <span className="mt-1 block text-xs opacity-75">{caption}</span>
  </button>;
}

function DetailTable({ rows, page, setPage }: { rows: RepairDashboardEntry[]; page: number; setPage: (page: number) => void }) {
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  page = Math.min(page, pageCount);
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  return <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
    {rows.length === 0 ? <div className="px-5 py-14 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><Wrench className="h-5 w-5 text-amber-800" /></div>
      <h3 className="font-bold text-stone-900">Sin reparaciones para mostrar</h3>
      <p className="mt-1 text-sm text-stone-600">Prueba otros filtros o restablece la selección.</p>
    </div> : <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
          <thead className="bg-stone-800 text-xs uppercase tracking-wide text-white">
            <tr>{["Folio / cliente", "Equipo", "Estado operativo", "Pago", "Total de orden", "Pagado", "Pendiente", "Recibida", "Entrega", "Liquidación", "Antigüedad"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visible.map((row) => <tr key={row.id} className="align-top hover:bg-amber-50/50">
              <td className="px-3 py-3"><Link href={`/repairs/${row.id}`} className="font-bold text-stone-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-900">{row.folio}</Link><div className="mt-1 max-w-48 truncate text-xs text-stone-600">{row.clientId ? <Link href={`/clients/${row.clientId}`} className="hover:underline">{row.clientName}</Link> : row.clientName}</div>{!row.billable && <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-stone-600">No facturable</span>}</td>
              <td className="max-w-40 px-3 py-3 text-stone-700">{row.equipment}</td>
              <td className="px-3 py-3"><span className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">{row.status || "Sin estado"}</span></td>
              <td className="px-3 py-3 text-stone-700">{row.paymentStatus || "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{money(row.total)}</td>
              <td className="whitespace-nowrap px-3 py-3 tabular-nums">{money(row.paid)}</td>
              <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums">{money(row.pending)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-stone-600">{dateLabel(row.receivedDay)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-stone-600">{dateLabel(row.deliveryDay)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-stone-600">{dateLabel(row.liquidationDay)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-stone-700">{row.ageDays === null ? "Sin recepción" : `${row.ageDays} días`}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3 text-sm">
        <span className="text-stone-600">Mostrando {rows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, rows.length)} de {rows.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Página anterior" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular-nums text-stone-700">Página {page} de {pageCount}</span>
          <button onClick={() => setPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} aria-label="Página siguiente" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </>}</div>;
}

export default function RepairDashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useRepairDashboard();
  const initialGroup = (() => {
    if (typeof window === "undefined") return "all" as RepairDashboardGroup;
    const value = new URLSearchParams(window.location.search).get("group");
    return GROUPS.some((group) => group.id === value) ? value as RepairDashboardGroup : "all";
  })();
  const [filters, setFilters] = useState<RepairDashboardFilters>({});
  const [group, setGroup] = useState<RepairDashboardGroup>(initialGroup);
  const [page, setPage] = useState(1);
  const dateError = Boolean(filters.from && filters.to && filters.from > filters.to);
  const selector = useMemo(() => data ? selectRepairDashboard(data.entries, filters) : null, [data, filters]);
  const rows = selector?.groups[group] ?? [];
  const managerOptions = useMemo(() => Array.from(new Set(data?.entries.map((entry) => entry.manager).filter(Boolean) ?? [])).sort((a, b) => a.localeCompare(b, "es")), [data]);
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    data?.entries.forEach((entry) => { if (entry.clientId !== null) seen.set(String(entry.clientId), entry.clientName); });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [data]);
  const setFilter = (key: keyof RepairDashboardFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value || undefined }));
    setPage(1);
  };
  const chooseGroup = (next: RepairDashboardGroup) => { setGroup(next); setPage(1); };
  const resetFilters = () => { setFilters({}); setPage(1); };
  const applyPeriod = (kind: "month" | "all") => {
    if (kind === "all") { setFilter("from", ""); setFilter("to", ""); return; }
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City", year: "numeric", month: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find(part => part.type === "year")!.value;
    const month = parts.find(part => part.type === "month")!.value;
    const from = `${year}-${month}-01`;
    const to = `${year}-${month}-${new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()}`;
    setFilters((previous) => ({ ...previous, from, to }));
    setPage(1);
  };

  if (isLoading) return <Skeleton />;
  if (isError || !data || !selector) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
    <h1 className="text-xl font-bold text-rose-950">No se pudo cargar el tablero</h1>
    <p className="mt-2 text-sm text-rose-800">{(error as Error)?.message || "Intenta de nuevo en unos momentos."}</p>
    <button onClick={() => refetch()} className="mt-4 min-h-11 rounded-lg bg-stone-900 px-4 font-semibold text-white">Reintentar</button>
  </section>;

  const { summary } = selector;
  const activeGroup = GROUPS.find((item) => item.id === group) ?? GROUPS[0];
  const amountCardRows = [
    { label: "Saldo pendiente", amount: summary.pendingAmount, count: summary.pendingCount, group: "pending" as const, caption: "Saldo actual · no depende del período", color: "rose" as const },
    { label: "Pagado", amount: summary.paidAmount, count: summary.paidCount, group: "paid" as const, caption: "Órdenes con pago marcado como Pagada", color: "teal" as const },
    { label: "Cotizaciones", amount: summary.quoteAmount, count: summary.quoteCount, group: "quotes" as const, caption: "Estimaciones · no son deuda", color: "blue" as const },
    { label: "Revisión incluida", amount: summary.reviewAmount, count: summary.reviewCount, group: "reviews" as const, caption: "Incluida en el total, no se suma de nuevo", color: "amber" as const },
  ];

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
    <header className="overflow-hidden rounded-2xl border border-amber-300 bg-[#f4c926] shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-stone-800/70">Péza Maquinaria / Taller</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">Tablero de reparaciones</h1>
          <p className="mt-1 text-sm text-stone-800">Seguimiento operativo y de cuenta · actualizado {dateTimeLabel(data.asOf)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-900/20 bg-white/75 px-4 text-sm font-bold text-stone-900 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> {isFetching ? "Actualizando..." : "Actualizar"}</button>
          <Link href="/repairs" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-900/20 bg-white/75 px-4 text-sm font-bold text-stone-900 hover:bg-white"><ArrowLeft className="h-4 w-4" /> Órdenes</Link>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-bold text-white hover:bg-stone-800">Inicio <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </header>

    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros de reparaciones">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-bold text-stone-900">Filtros</h2><p className="text-xs text-stone-500">Cliente, responsable y estado afectan todas las secciones. Las fechas solo filtran actividad.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => applyPeriod("month")} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-semibold hover:bg-amber-50">Mes actual</button>
          <button onClick={() => applyPeriod("all")} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-semibold hover:bg-amber-50">Todos los períodos</button>
          <button onClick={resetFilters} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-bold text-stone-700 hover:bg-stone-100"><RotateCcw className="h-3.5 w-3.5" /> Restablecer</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FilterSelect label="Cliente" value={filters.clientId ?? "all"} onChange={(value) => setFilter("clientId", value)}><option value="all">Todos los clientes</option><option value="unassigned">Sin cliente vinculado</option>{clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</FilterSelect>
        <FilterSelect label="Responsable" value={filters.manager ?? "all"} onChange={(value) => setFilter("manager", value)}><option value="all">Todos los responsables</option><option value="unassigned">Sin responsable</option>{managerOptions.map((manager) => <option key={manager} value={manager}>{manager}</option>)}</FilterSelect>
        <FilterSelect label="Estado operativo" value={filters.status ?? "all"} onChange={(value) => setFilter("status", value)}><option value="all">Todos los estados</option>{selector.operations.map(({ status }) => <option key={status} value={status}>{status}</option>)}</FilterSelect>
        <label className="block text-xs font-bold uppercase tracking-wide text-stone-600">Desde<input type="date" value={filters.from ?? ""} onChange={(event) => setFilter("from", event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900" /></label>
        <label className="block text-xs font-bold uppercase tracking-wide text-stone-600">Hasta<input type="date" value={filters.to ?? ""} onChange={(event) => setFilter("to", event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900" /></label>
      </div>
      {dateError && <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> La fecha inicial debe ser anterior o igual a la fecha final.</p>}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500"><CalendarDays className="h-3.5 w-3.5" />Las fechas aplican a recibidas, entregadas y liquidadas. El pendiente, pagado, cotizaciones y revisión son una fotografía actual.</p>
    </section>

    <section aria-labelledby="current-snapshot">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Fotografía actual</p><h2 id="current-snapshot" className="text-lg font-bold text-stone-900">Cuenta y operación</h2></div><span className="text-xs text-stone-500">Los importes de saldo no cambian con las fechas</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {amountCardRows.map((item) => <Metric key={item.group} label={item.label} value={money(item.amount)} caption={`${item.count} órdenes · ${item.caption}`} onClick={() => chooseGroup(item.group)} accent={item.color} />)}
      </div>
    </section>
    <section aria-labelledby="operational-statuses">
      <div className="mb-3"><p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Flujo de taller</p><h2 id="operational-statuses" className="text-lg font-bold text-stone-900">Órdenes por estado</h2></div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => { setFilter("status", "all"); chooseGroup("all"); }} className="min-h-11 shrink-0 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:border-amber-500">Todos <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 tabular-nums">{summary.totalCount}</span></button>
        {selector.operations.map(({ status, count }) => <button key={status} onClick={() => { setFilter("status", status); chooseGroup("all"); }} className={`min-h-11 shrink-0 rounded-lg border px-4 text-sm font-semibold transition-colors ${filters.status === status ? "border-amber-500 bg-amber-100 text-amber-950" : "border-stone-300 bg-white text-stone-800 hover:border-amber-500"}`}>{status}<span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 tabular-nums">{count}</span></button>)}
      </div>
    </section>
    <section>
      <h2 className="mb-3 text-lg font-bold text-stone-900">Actividad del período</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Recepciones" value={dateError ? "—" : String(summary.receivedCount)} caption="Recibidas dentro del período" onClick={() => chooseGroup("received")} disabled={dateError} />
        <Metric label="Entregas" value={dateError ? "—" : String(summary.deliveredCount)} caption="Entregadas dentro del período" onClick={() => chooseGroup("delivered")} accent="teal" disabled={dateError} />
        <Metric label="Liquidado" value={dateError ? "—" : money(summary.liquidatedAmount)} caption={`${summary.liquidatedCount} con fecha de liquidación`} onClick={() => chooseGroup("liquidated")} accent="teal" disabled={dateError} />
        <Metric label="Sin fecha de liquidación" value={money(summary.undatedAmount)} caption={`${summary.undatedCount} pagos marcados sin fecha`} onClick={() => chooseGroup("undated")} accent="blue" />
      </div>
    </section>
    <section>
      <h2 className="mb-3 text-lg font-bold text-stone-900">Alertas operativas</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Listas para entregar" value={String(summary.readyCount)} caption="Estado Terminada" onClick={() => chooseGroup("ready")} />
        <Metric label="Entregadas sin liquidar" value={money(summary.deliveredUnpaidAmount)} caption={`${summary.deliveredUnpaidCount} con saldo pendiente`} onClick={() => chooseGroup("deliveredUnpaid")} accent="rose" />
        <Metric label="Antigua pendiente de concluir" value={String(selector.groups.older.length)} caption="Antigüedad desde recepción · no vencimiento" onClick={() => chooseGroup("older")} />
        <Metric label="Pendiente sin cliente" value={String(summary.unassignedPendingCount)} caption="Saldo pendiente sin cliente vinculado" onClick={() => { setFilter("clientId", "unassigned"); chooseGroup("pending"); }} accent="rose" />
      </div>
      {summary.undatedCount > 0 && <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Hay pagos marcados como Pagada sin fecha de liquidación. No se usa la fecha de recepción como sustituto.</p>}
      {summary.unassignedPendingCount > 0 && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{summary.unassignedPendingCount} reparaciones tienen saldo pendiente y no tienen cliente vinculado. <button className="min-h-11 px-2 font-bold underline" onClick={() => { setFilter("clientId", "unassigned"); chooseGroup("pending"); }}>Ver folios sin cliente</button></p>}
    </section>

    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 bg-[#fffdf6] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-amber-800">Detalle / {rows.length} órdenes</p><h2 className="mt-1 text-lg font-bold text-stone-900">{activeGroup.label}</h2><p className="mt-1 max-w-3xl text-sm text-stone-600">{activeGroup.meaning}</p></div>
          <label className="block min-w-52 text-xs font-bold uppercase tracking-wide text-stone-600">Grupo del detalle<select value={group} onChange={(event) => chooseGroup(event.target.value as RepairDashboardGroup)} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-900">{GROUPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>
      </div>
      {dateError && ["received", "delivered", "liquidated"].includes(group)
        ? <p role="alert" className="p-5 text-sm text-rose-800">Corrige el intervalo de fechas para consultar la actividad.</p>
        : <DetailTable rows={rows} page={page} setPage={setPage} />}
    </section>
    <aside className="rounded-xl border border-stone-200 bg-stone-100 px-4 py-4 text-sm leading-relaxed text-stone-700">
      <h2 className="font-bold text-stone-900">Cómo leer estos importes</h2>
      <p className="mt-1">Las reparaciones usan las mismas fuentes que el estado de cuenta del cliente y no duplican cargos. Las cotizaciones son estimaciones, no deuda. Los registros marcados como no facturables no generan saldo. Costos y ganancias no están incluidos; una orden pagada tampoco equivale a flujo de efectivo bancario.</p>
    </aside>
  </div>;
}
