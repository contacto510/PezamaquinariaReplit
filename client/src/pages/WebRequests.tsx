import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Wrench,
} from "lucide-react";
import type { WebRequestPayload, WebRequestView, WebRequestsResponse } from "@shared/web-requests";
import { apiRequest } from "@/lib/queryClient";

type RequestTypeFilter = "" | "cotizacion_renta" | "reparacion";
type RequestStatusFilter = "" | "nueva" | "seguimiento" | "convertida" | "descartada";
type RequestStatus = Exclude<RequestStatusFilter, "">;
type Filters = {
  type: RequestTypeFilter;
  status: RequestStatusFilter;
  from: string;
  to: string;
  page: number;
};

const PAGE_SIZE = 50;
const STATUS_LABELS: Record<RequestStatus, string> = {
  nueva: "Nueva",
  seguimiento: "En seguimiento",
  convertida: "Convertida",
  descartada: "Descartada",
};

function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(date);
}

function dateLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(parsed);
}

function statusClass(status: string) {
  if (status === "nueva") return "border-amber-300 bg-amber-100 text-amber-950";
  if (status === "seguimiento") return "border-sky-300 bg-sky-100 text-sky-950";
  if (status === "convertida") return "border-teal-300 bg-teal-100 text-teal-950";
  if (status === "descartada") return "border-stone-300 bg-stone-100 text-stone-700";
  return "border-stone-300 bg-stone-100 text-stone-700";
}

function RequestSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5" aria-label="Cargando solicitudes">
      <div className="h-36 animate-pulse rounded-2xl bg-amber-100" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-stone-200" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-xl bg-stone-200" />
      <div className="h-72 animate-pulse rounded-xl bg-stone-200" />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-xs font-bold uppercase tracking-wide text-stone-600">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
      >
        {children}
      </select>
    </label>
  );
}

function DetailLine({
  icon: Icon,
  children,
}: {
  icon: typeof Phone;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-stone-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

function TypeDetails({ payload }: { payload: WebRequestPayload }) {
  if (payload.tipo_solicitud === "cotizacion_renta") {
    return (
      <div className="grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2">
        <DetailLine icon={Wrench}>
          <span className="font-semibold text-stone-900">Renta</span>
          <span className="mx-2 text-stone-400">·</span>
          {payload.cantidad_equipos} {payload.cantidad_equipos === 1 ? "equipo" : "equipos"}
          <span className="mx-2 text-stone-400">·</span>
          {payload.dias_renta} {payload.dias_renta === 1 ? "día" : "días"}
        </DetailLine>
        <DetailLine icon={ArrowRight}>
          Entrega: {payload.entrega === "entrega_obra" ? "En obra" : "Recoge en sucursal"}
        </DetailLine>
        {payload.fecha_requerida && (
          <DetailLine icon={CalendarDays}>Fecha requerida: {dateLabel(payload.fecha_requerida)}</DetailLine>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-2">
      <DetailLine icon={Wrench}>
        <span className="font-semibold text-stone-900">Reparación</span>
        {payload.marca_modelo ? <span> · {payload.marca_modelo}</span> : null}
      </DetailLine>
      <div className="sm:col-span-2">
        <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Falla reportada</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">{payload.falla_reportada}</p>
      </div>
    </div>
  );
}

function conversionHref(request: WebRequestView) {
  if (request.payload.tipo_solicitud === "cotizacion_renta") {
    const folioNumber = request.convertedFolio?.match(/^COT-(.+)$/i)?.[1];
    return folioNumber ? `/quotation?edit=${encodeURIComponent(folioNumber)}` : null;
  }
  return request.convertedId ? `/repairs/${request.convertedId}` : null;
}

function RequestCard({
  request,
  onStatus,
  busy,
}: {
  request: WebRequestView;
  onStatus: (id: number, status: RequestStatus) => void;
  busy: boolean;
}) {
  const payload = request.payload;
  const isRental = payload.tipo_solicitud === "cotizacion_renta";
  const terminal = request.status === "convertida";
  const canPrepare = request.status !== "descartada" && !terminal;
  const convertedUrl = terminal ? conversionHref(request) : null;

  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="border-b border-stone-200 bg-[#fffdf6] p-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(request.status)}`}>
                {request.status === "convertida" ? <Check className="h-3.5 w-3.5" /> : null}
                {STATUS_LABELS[request.status as RequestStatus] ?? request.status}
              </span>
              <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700">
                {isRental ? "Cotización de renta" : "Reparación"}
              </span>
            </div>
            <h3 className="mt-2 break-words text-lg font-bold leading-tight text-stone-950">{payload.nombre}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
              <Clock3 className="h-3.5 w-3.5" />
              Recibida {dateTimeLabel(request.receivedAt)}
            </p>
          </div>
          <div className="min-w-0 max-w-full sm:max-w-[40%] sm:text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Equipo</p>
            <p className="mt-1 break-words font-semibold text-stone-900">{payload.equipo}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailLine icon={Phone}>
            <a className="font-semibold text-stone-900 underline decoration-amber-500 underline-offset-2" href={`tel:${payload.telefono}`}>
              {payload.telefono}
            </a>
          </DetailLine>
          {payload.correo && (
            <DetailLine icon={Mail}>
              <a className="break-all text-stone-800 underline decoration-amber-500 underline-offset-2" href={`mailto:${payload.correo}`}>
                {payload.correo}
              </a>
            </DetailLine>
          )}
          {payload.municipio && <DetailLine icon={MapPin}>{payload.municipio}</DetailLine>}
        </div>

        <TypeDetails payload={payload} />

        {payload.mensaje && (
          <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50/70 px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Mensaje</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">{payload.mensaje}</p>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 border-t border-stone-100 pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Origen</p>
            <a
              href={payload.pagina_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-start gap-1 break-all text-sm text-stone-700 underline decoration-stone-400 underline-offset-2 hover:text-stone-950"
            >
              <span>{payload.pagina_titulo || payload.pagina_url}</span>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            </a>
            {(payload.utm_source || payload.utm_medium || payload.utm_campaign) && (
              <p className="mt-1 break-words text-xs text-stone-500">
                Seguimiento de origen: {[payload.utm_source, payload.utm_medium, payload.utm_campaign].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {request.convertedFolio && terminal && (
            <span className="rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-900">
              Folio {request.convertedFolio}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {!terminal && (["nueva", "seguimiento", "descartada"] as const).map((status) => {
              const selected = request.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={busy || selected}
                  onClick={() => onStatus(request.id, status)}
                  className={`min-h-10 rounded-lg border px-3 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-50 ${selected ? "border-stone-400 bg-stone-100 text-stone-600" : "border-stone-300 bg-white text-stone-700 hover:border-amber-500 hover:bg-amber-50"}`}
                >
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
          {terminal ? (
            convertedUrl ? (
              <Link href={convertedUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 text-sm font-bold text-white hover:bg-stone-800">
                Abrir registro convertido <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="text-xs text-stone-500">Registro convertido</span>
            )
          ) : canPrepare ? (
            <Link
              href={isRental ? `/quotation?webRequestId=${request.id}` : `/repairs/new?webRequestId=${request.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#f4c926] px-4 text-sm font-bold text-stone-950 hover:bg-amber-400"
            >
              Preparar {isRental ? "cotización" : "reparación"} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function WebRequests() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>({
    type: "",
    status: "",
    from: "",
    to: "",
    page: 1,
  });
  const dateError = Boolean(filters.from && filters.to && filters.from > filters.to);
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(filters.page));

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<WebRequestsResponse>({
    queryKey: ["/api/web-requests", filters],
    queryFn: () => apiRequest(`/api/web-requests?${params.toString()}`),
    enabled: !dateError,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: RequestStatus }) =>
      apiRequest(`/api/web-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/web-requests"] }),
  });

  const updateFilter = (key: keyof Omit<Filters, "page">, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value, page: 1 }));
  };
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const firstItem = data?.total ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const lastItem = Math.min(filters.page * PAGE_SIZE, data?.total ?? 0);

  if (isLoading) return <RequestSkeleton />;
  if (isError) {
    return (
      <section className="mx-auto max-w-[1100px] rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div>
            <h1 className="text-xl font-bold text-rose-950">No se pudieron cargar las solicitudes</h1>
            <p className="mt-2 text-sm text-rose-800">{(error as Error)?.message || "Intenta de nuevo en unos momentos."}</p>
            <button type="button" onClick={() => refetch()} className="mt-4 min-h-11 rounded-lg bg-stone-900 px-4 font-semibold text-white hover:bg-stone-800">
              Reintentar
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <header className="overflow-hidden rounded-2xl border border-amber-300 bg-[#f4c926] shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-stone-800/70">Péza Maquinaria / Bandeja privada</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">Solicitudes web</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-800">Revisa primero. Convierte solo al guardar la cotización o reparación.</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-stone-900/20 bg-white/75 px-4 text-sm font-bold text-stone-900 hover:bg-white disabled:opacity-50"
          >
            <RotateCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </header>

      {data && !data.webhookConfigured && (
        <aside className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><strong>Integración no configurada.</strong> El webhook de solicitudes web aún no está listo para recibir nuevos envíos.</p>
        </aside>
      )}

      <section aria-labelledby="request-counts">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Entradas recibidas</p>
            <h2 id="request-counts" className="text-lg font-bold text-stone-900">Resumen del período</h2>
          </div>
          <p className="text-xs text-stone-500">Los conteos respetan las fechas, no los filtros de tipo o estado.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Nuevas", value: data?.counts.nueva ?? 0, style: "border-amber-400 bg-amber-50 text-amber-950" },
            { label: "En seguimiento", value: data?.counts.seguimiento ?? 0, style: "border-sky-400 bg-sky-50 text-sky-950" },
            { label: "Convertidas", value: data?.counts.convertida ?? 0, style: "border-teal-500 bg-teal-50 text-teal-950" },
            { label: "Descartadas", value: data?.counts.descartada ?? 0, style: "border-stone-400 bg-stone-100 text-stone-800" },
          ].map((count) => (
            <div key={count.label} className={`min-h-24 rounded-xl border-l-4 p-4 shadow-sm ${count.style}`}>
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">{count.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{count.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Por tipo en el período: {data?.counts.renta ?? 0} cotizaciones de renta · {data?.counts.reparacion ?? 0} reparaciones.
          {" "}WhatsApp: seguimiento no activo.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros de solicitudes">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-stone-900">Filtrar bandeja</h2>
            <p className="text-xs text-stone-500">Fechas de recepción inclusivas.</p>
          </div>
          <button
            type="button"
            onClick={() => setFilters({ type: "", status: "", from: "", to: "", page: 1 })}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-stone-700 hover:bg-stone-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="Tipo" value={filters.type} onChange={(value) => updateFilter("type", value)}>
            <option value="">Todos los tipos</option>
            <option value="cotizacion_renta">Cotización de renta</option>
            <option value="reparacion">Reparación</option>
          </FilterSelect>
          <FilterSelect label="Estado" value={filters.status} onChange={(value) => updateFilter("status", value)}>
            <option value="">Todos los estados</option>
            <option value="nueva">Nueva</option>
            <option value="seguimiento">En seguimiento</option>
            <option value="convertida">Convertida</option>
            <option value="descartada">Descartada</option>
          </FilterSelect>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-600">
            Desde
            <input
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter("from", event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-600">
            Hasta
            <input
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter("to", event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>
        </div>
        {dateError && (
          <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" /> La fecha inicial debe ser anterior o igual a la fecha final.
          </p>
        )}
      </section>

      <section aria-labelledby="request-list">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Bandeja de entrada</p>
            <h2 id="request-list" className="text-lg font-bold text-stone-900">
              {data?.total ?? 0} {data?.total === 1 ? "solicitud" : "solicitudes"}
            </h2>
          </div>
          {data && data.total > 0 && (
            <p className="text-sm tabular-nums text-stone-600">{firstItem}–{lastItem} de {data.total}</p>
          )}
        </div>

        {dateError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            Corrige el intervalo de fechas para consultar solicitudes.
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-[#fffdf6] px-5 py-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <ArrowDownLeft className="h-5 w-5 text-amber-900" />
            </div>
            <h3 className="font-bold text-stone-900">No hay solicitudes en esta selección</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">Prueba otros filtros o amplía el período. Las solicitudes web aparecerán aquí cuando lleguen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.items.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                busy={statusMutation.isPending && statusMutation.variables?.id === request.id}
                onStatus={(id, status) => statusMutation.mutate({ id, status })}
              />
            ))}
          </div>
        )}

        {statusMutation.isError && (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            No se pudo actualizar el estado: {(statusMutation.error as Error)?.message || "Intenta de nuevo."}
          </p>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
            <span className="text-stone-600">Página {filters.page} de {pageCount}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilters((previous) => ({ ...previous, page: Math.max(1, previous.page - 1) }))}
                disabled={filters.page <= 1}
                aria-label="Página anterior"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 hover:bg-amber-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setFilters((previous) => ({ ...previous, page: Math.min(pageCount, previous.page + 1) }))}
                disabled={filters.page >= pageCount}
                aria-label="Página siguiente"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 hover:bg-amber-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="flex items-center gap-2 text-xs text-stone-500">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        Los cambios de estado no convierten una solicitud. Convertida aparece únicamente después de guardar el registro real.
      </p>
    </div>
  );
}
