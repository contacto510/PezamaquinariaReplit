import React from "react";
import { Button } from "@/components/ui/button";

interface RepairConceptCatalogStatusProps {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/** This banner never replaces the table, so retrying keeps the repair draft intact. */
export default function RepairConceptCatalogStatus({
  loading, error, onRetry,
}: RepairConceptCatalogStatusProps) {
  if (!loading && !error) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
    >
      <p className="font-medium">
        {loading ? "Cargando conceptos..." : "No se pudieron cargar los conceptos."}
      </p>
      <p className="mt-1">
        {loading
          ? "Espera a que termine la carga antes de seleccionar conceptos o guardar la reparación."
          : "Esto no significa que el catálogo esté vacío ni que tus conceptos se hayan borrado. Puedes reintentar sin perder lo que llevas capturado."}
      </p>
      {error && (
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          disabled={loading}
          onClick={onRetry}
        >
          {loading ? "Reintentando..." : "Reintentar"}
        </Button>
      )}
    </div>
  );
}
