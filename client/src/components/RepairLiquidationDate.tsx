import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { repairLiquidationDate } from "@shared/liquidation-date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function RepairLiquidationDate({ repair }: {
  repair: { id: number; paymentStatus: string; liquidatedAt?: Date | string | null };
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const save = useMutation({
    mutationFn: () => apiRequest(`/api/repairs/${repair.id}/payment-status`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus: "Pagada", liquidatedAt: date }),
    }),
    onSuccess: async () => {
      setEditing(false);
      setDate("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/repairs"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/accounts-receivable"] }),
      ]);
      toast({ title: "Fecha de liquidación guardada", description: "Aparecerá al generar nuevamente el estado de cuenta resumido." });
    },
    onError: (error: Error) => toast({
      title: "No se pudo guardar la fecha", description: error.message, variant: "destructive",
    }),
  });

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Pago y liquidación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p><span className="font-medium">Estado de pago:</span> {repair.paymentStatus}</p>
        {repair.paymentStatus === "Pagada" ? (
          <>
            <p><span className="font-medium">Liquidado el:</span> {repairLiquidationDate(repair.liquidatedAt)}</p>
            {!repair.liquidatedAt && !editing && (
              <Button onClick={() => { setDate(""); setEditing(true); }}>
                Capturar fecha de liquidación
              </Button>
            )}
            {!repair.liquidatedAt && editing && (
              <form className="space-y-3" onSubmit={(event) => {
                event.preventDefault();
                if (date && date <= today && !save.isPending) save.mutate();
              }}>
                <div className="max-w-xs space-y-1">
                  <label htmlFor="repair-liquidation-date" className="text-sm font-medium">Fecha de liquidación</label>
                  <Input id="repair-liquidation-date" type="date" required value={date}
                    max={today} disabled={save.isPending} onChange={(event) => setDate(event.target.value)}
                    aria-describedby="repair-liquidation-help" />
                </div>
                <p id="repair-liquidation-help" className="text-sm text-muted-foreground">
                  Captura únicamente una fecha que conozcas. No cambia el importe ni registra un pago adicional.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!date || date > today || save.isPending}>
                    {save.isPending ? "Guardando..." : "Guardar fecha"}
                  </Button>
                  <Button type="button" variant="outline" disabled={save.isPending}
                    onClick={() => { setEditing(false); setDate(""); }}>Cancelar</Button>
                </div>
              </form>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            La fecha se registra al marcar la reparación como Pagada. La captura de una fecha histórica solo está disponible para reparaciones ya pagadas sin fecha registrada.
          </p>
        )}
      </CardContent>
    </Card>
  );
}