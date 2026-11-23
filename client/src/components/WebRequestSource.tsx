import { useQuery } from "@tanstack/react-query";
import type { WebRequestPayload, WebRequestView } from "@shared/web-requests";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export function webRequestIdFromUrl(): number | undefined {
  const value = new URLSearchParams(window.location.search).get("webRequestId");
  if (!value) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
export default function WebRequestSource({ id, type, applied, onApply }: {
  id: number; type: string; applied: boolean; onApply: (payload: WebRequestPayload) => void;
}) {
  const query = useQuery<WebRequestView>({
    queryKey: ["/api/web-requests", id],
    queryFn: () => apiRequest(`/api/web-requests/${id}`),
    refetchOnWindowFocus: false,
  });
  const request = query.data;
  const available = request && request.type === type && !request.convertedId && request.status !== "descartada";
  return <section className="my-4 rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
    <h2 className="font-semibold">Preparar desde solicitud web #{id}</h2>
    {query.isPending ? <p>Cargando solicitud…</p> : query.isError ? <>
      <p role="alert">No se pudo cargar la solicitud. No guardes hasta revisarla.</p>
      <Button type="button" variant="outline" onClick={() => query.refetch()}>Reintentar</Button>
    </> : !available ? <p role="alert">Solicitud no disponible, de otro tipo o ya convertida.</p> : <>
      <p>{request.payload.nombre} · {request.payload.telefono} · {request.payload.municipio}</p>
      <p className="whitespace-pre-wrap break-words">Equipo solicitado: {request.payload.equipo}</p>
      <p className="whitespace-pre-wrap break-words">{request.payload.mensaje}</p>
      {request.payload.tipo_solicitud === "cotizacion_renta" ? <p>
        Cantidad: {request.payload.cantidad_equipos} · Días: {request.payload.dias_renta} · {request.payload.entrega === "entrega_obra" ? "Entrega en obra" : "Recoge en sucursal"} · Fecha solicitada: {request.payload.fecha_requerida || "Sin especificar"}
      </p> : <p className="whitespace-pre-wrap">Marca/modelo: {request.payload.marca_modelo || "Sin especificar"} · Falla reportada: {request.payload.falla_reportada}</p>}
      <p className="text-sm">Solo se prepara el formulario. Confirma cliente, fechas, conceptos y precios antes de guardar. No se agrega ningún concepto al catálogo automáticamente.</p>
      <Button type="button" disabled={applied} onClick={() => onApply(request.payload)}>
        {applied ? "Datos incorporados; revisa antes de guardar" : "Incorporar datos al formulario"}
      </Button>
    </>}
    <Link className="block underline text-sm" href="/web-requests">Volver a Solicitudes web</Link>
  </section>;
}
