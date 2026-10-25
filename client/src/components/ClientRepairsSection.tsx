import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Eye, Pencil, RefreshCw, Wrench } from "lucide-react";
import type { Repair } from "@shared/schema";
import { isBillableRepair, getRepairAccountAmounts } from "@shared/account-statement";
import { normalizeRepairStatus } from "@shared/repair-status";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ClientRepair = Pick<Repair,
  "id" | "repairNumber" | "equipment" | "total" | "status" | "paymentStatus" | "reviewOnly"
> & {
  receivedDate: string | Date | null;
  deliveryDate: string | Date | null;
};

function displayDate(value: ClientRepair["receivedDate"]): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

export default function ClientRepairsSection({ clientId }: { clientId?: string }) {
  const { data: repairs, isLoading, isError, isFetching, refetch } = useQuery<ClientRepair[]>({
    // Preserve the client prefix so existing client invalidations also refresh repairs.
    queryKey: ["/api/clients", clientId, "repairs"],
    queryFn: async () => {
      const result = await apiRequest(`/api/clients/${clientId}/repairs`);
      if (!Array.isArray(result)) throw new Error("Respuesta de reparaciones no válida");
      return result;
    },
    enabled: !!clientId,
    staleTime: 60000,
  });

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="client-repairs-heading">
      <div>
        <h4 id="client-repairs-heading" className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-yellow-600" aria-hidden="true" />
          Reparaciones
        </h4>
        <p className="mt-1 text-sm text-gray-500">
          Todas las órdenes del cliente. Las no incluidas en el estado de cuenta se indican por separado.
        </p>
      </div>
      {isLoading ? (
        <Card>
          <CardContent className="space-y-4 p-4" role="status" aria-label="Cargando reparaciones">
            {[0, 1, 2].map(row => (
              <div key={row} className="animate-pulse space-y-2">
                <div className="h-4 w-1/3 rounded bg-gray-200" />
                <div className="h-4 w-2/3 rounded bg-gray-100" />
              </div>
            ))}
            <span className="sr-only">Cargando reparaciones…</span>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 space-y-3" role="alert">
            <p className="font-semibold text-gray-800">No se pudieron cargar las reparaciones</p>
            <p className="text-sm text-gray-500">Inténtalo de nuevo para consultar las órdenes de este cliente.</p>
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {isFetching ? "Reintentando…" : "Reintentar"}
            </Button>
          </CardContent>
        </Card>
      ) : !repairs?.length ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Wrench className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
            <h5 className="font-semibold text-gray-600">No hay reparaciones registradas</h5>
            <p className="mt-2 text-sm text-gray-500">Las órdenes asociadas a este cliente aparecerán aquí.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="min-w-0 p-0">
            <p className="border-b px-4 py-2 text-xs text-gray-500 md:hidden">
              Desliza horizontalmente para ver todos los datos y las acciones.
            </p>
            <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Lista de reparaciones del cliente">
              <Table className="min-w-[1050px]">
                <TableHeader className="bg-gray-100">
                  <TableRow>
                    <TableHead>Folio / Estado de cuenta</TableHead>
                    <TableHead>Equipo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead>Estado operativo</TableHead>
                    <TableHead>Estado de pago</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repairs.map(repair => {
                    // Normalization is display-only; billing uses the unmodified shared rules.
                    const billable = isBillableRepair(repair);
                    const amounts = getRepairAccountAmounts(repair);
                    return (
                      <TableRow key={repair.id}>
                        <TableCell>
                          <Link href={`/repairs/${repair.id}`} className="font-semibold text-gray-800 hover:underline">
                            {repair.repairNumber}
                          </Link>
                          <p className={`mt-1 max-w-[190px] text-xs ${billable ? "text-gray-500" : "text-amber-700"}`}>
                            {billable ? "Incluida en el estado de cuenta" : "No incluida en el estado de cuenta"}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-[220px] break-words whitespace-normal">{repair.equipment}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-gray-600">
                          <div>Recibido: {displayDate(repair.receivedDate)}</div>
                          <div className="mt-1">Entrega: {repair.deliveryDate ? displayDate(repair.deliveryDate) : "En proceso"}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatCurrency(amounts.total)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {billable ? formatCurrency(amounts.pending) : <span aria-label="No aplica">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{normalizeRepairStatus(repair.status || "") || "Sin estado"}</Badge></TableCell>
                        <TableCell>
                          <Badge className={repair.paymentStatus === "Pagada"
                            ? "bg-green-100 text-green-800 border-green-200"
                            : repair.paymentStatus === "Cotización"
                              ? "bg-blue-100 text-blue-800 border-blue-200"
                              : "bg-yellow-100 text-yellow-800 border-yellow-200"}>
                            {repair.paymentStatus || "Sin estado"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Link href={`/repairs/${repair.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={`Ver reparación ${repair.repairNumber}`} title="Ver reparación">
                              <Eye className="h-4 w-4" />
                            </Link>
                            <Link href={`/repairs/${repair.id}/edit`} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={`Editar reparación ${repair.repairNumber}`} title="Editar reparación">
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
