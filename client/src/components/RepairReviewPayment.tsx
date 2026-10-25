import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { Repair } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PaymentUpdate = { paymentStatus: string; reviewAmount?: string; reviewOnly?: boolean };

export default function RepairReviewPayment({ repair, busy = false }: { repair: Repair; busy?: boolean }) {
  const [dialog, setDialog] = useState<"review" | "edit" | "authorize" | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const locked = useRef(false);
  const fee = Number(repair.reviewAmount || 0);
  const paymentStatus = repair.paymentStatus || "No Pagada";
  const mutation = useMutation({
    mutationFn: (payload: PaymentUpdate) => apiRequest(`/api/repairs/${repair.id}/payment-status`, {
      method: "PATCH", body: JSON.stringify(payload),
    }),
    onSuccess: (updated: Repair) => {
      queryClient.setQueryData<Repair[]>(["/api/repairs"], old => old?.map(r => r.id === repair.id ? { ...r, ...updated } : r));
      queryClient.setQueryData(["/api/repairs", repair.id], updated);
      for (const key of ["/api/repairs", "/api/clients", "/api/accounts-receivable", "/api/stats"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      setDialog(null);
      toast({ title: "Pago actualizado", description: "El importe y la modalidad se guardaron correctamente." });
    },
    onError: (err: Error) => {
      setError(err.message || "No se pudo guardar. Inténtalo de nuevo.");
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    },
    onSettled: () => { locked.current = false; },
  });
  const pending = mutation.isPending || busy;
  const save = (payload: PaymentUpdate) => {
    if (locked.current || pending) return;
    locked.current = true;
    setError("");
    mutation.mutate(payload);
  };
  const openFee = (mode: "review" | "edit") => {
    setAmount(fee > 0 ? fee.toFixed(2) : "");
    setError("");
    setDialog(mode);
  };
  const saveFee = () => {
    const normalized = amount.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) <= 0) {
      setError("Captura un importe mayor que cero, con máximo dos decimales.");
      return;
    }
    save({
      paymentStatus: dialog === "review" ? "Revisión" : paymentStatus,
      reviewAmount: Number(normalized).toFixed(2),
      reviewOnly: dialog === "review" ? true : !!repair.reviewOnly,
    });
  };
  return (
    <div className="space-y-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 text-gray-700">
        <DollarSign className="w-4 h-4 text-gray-500 shrink-0" />
        <Label htmlFor={`payment-${repair.id}`} className="text-xs sm:text-sm whitespace-nowrap">Estado de Pago:</Label>
        <select id={`payment-${repair.id}`} value={paymentStatus} disabled={pending}
          onChange={e => {
            if (e.target.value === "Revisión") openFee("review");
            else if (e.target.value !== paymentStatus) save({ paymentStatus: e.target.value });
          }}
          className={`ml-auto h-8 text-xs font-medium border rounded-md px-2 disabled:opacity-50 ${
            paymentStatus === "Pagada" ? "bg-green-100 text-green-800 border-green-300" :
            paymentStatus === "Revisión" ? "bg-amber-100 text-amber-800 border-amber-300" :
            paymentStatus === "Cotización" ? "bg-blue-100 text-blue-800 border-blue-300" :
            "bg-red-100 text-red-800 border-red-300"}`}>
          <option value="No Pagada">No Pagada</option>
          <option value="Pagada">Pagada</option>
          <option value="Cotización">Cotización</option>
          <option value="Revisión">Revisión</option>
        </select>
      </div>
      {(fee > 0 || repair.reviewOnly) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 space-y-2 text-xs text-amber-900">
          <div className="flex flex-wrap justify-between gap-1">
            <span className="font-medium">Revisión: {formatCurrency(fee)} antes de IVA</span>
            <button type="button" disabled={pending || paymentStatus === "Pagada"} onClick={() => openFee("edit")} className="underline underline-offset-2 disabled:opacity-50">Editar importe</button>
          </div>
          <p>{repair.reviewOnly ? "Solo revisión. Los conceptos de reparación no se cobran." : "Revisión + reparación. El cargo se suma una sola vez."}</p>
          {paymentStatus === "Pagada" && <p>Para corregir el importe, cambia primero a No Pagada.</p>}
          {repair.reviewOnly && <Button type="button" variant="outline" size="sm" className="w-full h-auto min-h-9 whitespace-normal text-xs" disabled={pending}
            onClick={() => { setError(""); setDialog("authorize"); }}>Sumar revisión a reparación</Button>}
        </div>
      )}
      <Dialog open={dialog !== null} onOpenChange={open => { if (!open && !pending) setDialog(null); }}>
        <DialogContent onClick={e => e.stopPropagation()} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === "authorize" ? "Sumar revisión a reparación" : dialog === "edit" ? "Editar cargo de revisión" : "Cobrar solo revisión"}</DialogTitle>
            <DialogDescription>
              {dialog === "authorize"
                ? `Se sumará el cargo guardado de ${formatCurrency(fee)} antes de IVA a los conceptos existentes, una sola vez. La orden quedará No Pagada y podrás editar sus conceptos. El importe de revisión se conserva.`
                : dialog === "edit"
                  ? "Modifica el importe antes de IVA. El estado de pago y la modalidad actual se conservarán."
                  : "Solo se cobrará este importe de revisión; los conceptos existentes se conservan sin cobrarse. Se aplicará IVA del 16% si está activado en la orden."}
            </DialogDescription>
          </DialogHeader>
          {dialog !== "authorize" && <div className="space-y-2">
            <Label htmlFor={`review-amount-${repair.id}`}>Importe de revisión antes de IVA</Label>
            <Input id={`review-amount-${repair.id}`} type="text" inputMode="decimal" autoFocus value={amount}
              disabled={pending} aria-invalid={!!error} aria-describedby={`review-error-${repair.id}`}
              onChange={e => { setAmount(e.target.value); setError(""); }} placeholder="0.00" />
          </div>}
          {error && <p id={`review-error-${repair.id}`} role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setDialog(null)}>Cancelar</Button>
            <Button type="button" disabled={pending} onClick={() => dialog === "authorize"
              ? save({ paymentStatus: "No Pagada", reviewOnly: false }) : saveFee()}>
              {pending ? "Guardando..." : dialog === "authorize" ? "Confirmar y sumar" : "Guardar importe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
