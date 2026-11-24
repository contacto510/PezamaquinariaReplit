import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Concept, QuotationItemData } from "@shared/schema";
import type { WebRequestPayload } from "@shared/web-requests";
import { authenticatedFetch } from "@/lib/queryClient";
import { searchQuotationConcepts } from "@/lib/quotation-concept-search";
import { rentalConceptItem, rentalConceptQuantity } from "@/lib/web-rental-concept";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RentalRequest = Extract<WebRequestPayload, { tipo_solicitud: "cotizacion_renta" }>;

export default function WebRentalConceptPicker({ payload, onAdd }: {
  payload: RentalRequest; onAdd: (item: QuotationItemData) => void;
}) {
  const [search, setSearch] = useState(payload.equipo);
  const [selected, setSelected] = useState<Concept | null>(null);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const catalog = useQuery<Concept[]>({
    queryKey: ["/api/concepts"],
    queryFn: async () => {
      const res = await authenticatedFetch("/api/concepts?active=true");
      if (!res.ok) throw new Error("No se pudo cargar el catálogo.");
      return res.json();
    },
  });
  const matches = searchQuotationConcepts(catalog.data ?? [], search);
  if (added) return <div role="status" className="rounded border bg-white p-3">
    Concepto incorporado a la tabla. Revisa cantidad, unidad y precio antes de guardar.
    Si necesitas cambiarlo o eliminarlo, hazlo directamente en la tabla de conceptos.
  </div>;

  return <div className="rounded border bg-white p-3 space-y-3">
    <h3 className="font-semibold">Seleccionar concepto de renta</h3>
    <p className="text-sm">Solicitud: {payload.cantidad_equipos} equipo(s) durante {payload.dias_renta} día(s). Confirma el concepto del catálogo; no se selecciona automáticamente.</p>
    <label className="block text-sm">Buscar equipo en el catálogo
      <Input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); setError(""); }} />
    </label>
    {catalog.isPending ? <p role="status">Cargando catálogo…</p> : catalog.isError ? <div role="alert">
      <p>No se pudo cargar el catálogo. Tu solicitud y el formulario se conservan.</p>
      <Button type="button" variant="outline" onClick={() => catalog.refetch()}>Reintentar catálogo</Button>
    </div> : !catalog.data?.length ? <p>No hay conceptos activos en el catálogo. Puedes agregar el concepto manualmente en la tabla.</p> : matches.length === 0 ? <p>No hay coincidencias para este equipo. Prueba con menos palabras o selecciona otro concepto desde la tabla. No se inventarán conceptos ni precios.</p> : <div className="max-h-60 overflow-y-auto space-y-2" aria-label="Coincidencias del catálogo">
      {matches.map(concept => <Button key={concept.id} type="button"
        variant={selected?.id === concept.id ? "default" : "outline"}
        className="w-full h-auto whitespace-normal text-left justify-start"
        aria-pressed={selected?.id === concept.id}
        onClick={() => {
          setSelected(concept);
          setQuantity(String(rentalConceptQuantity(concept.defaultUnit, payload.cantidad_equipos, payload.dias_renta)));
          setError("");
        }}>
        {concept.name} · {concept.defaultUnit || "Sin unidad"} · {concept.defaultPrice != null && concept.defaultPrice !== "" ? formatCurrency(Number(concept.defaultPrice)) : "Sin precio"}
      </Button>)}
    </div>}
    {selected && !catalog.isError && <>
      <p className="text-sm">Concepto: <strong>{selected.name}</strong>. Unidad: {selected.defaultUnit || "Sin unidad"}.
        {" "}Para unidades Día/Días se propone equipos × días ({payload.cantidad_equipos} × {payload.dias_renta}); para otras unidades se propone la cantidad de equipos. Revisa la cantidad según la tarifa.</p>
      <label className="block text-sm">Cantidad a cotizar
        <Input type="number" min="0.01" step="any" value={quantity}
          onChange={e => { setQuantity(e.target.value); setError(""); }} />
      </label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Button type="button" onClick={() => {
        try {
          const item = rentalConceptItem(selected, Number(quantity));
          onAdd(item);
          setAdded(true);
        } catch (err) { setError(err instanceof Error ? err.message : "No se pudo incorporar el concepto."); }
      }}>Confirmar e incorporar concepto</Button>
    </>}
    <p className="text-xs">Solo se agrega al borrador. No se crea ningún concepto en el catálogo ni se guarda la cotización hasta que tú lo indiques.</p>
  </div>;
}
