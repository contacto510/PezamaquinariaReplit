---
name: Report paid-amount business rule
description: How "abono recibido" / paid amount per report must be computed across PDF generators and account-statement views
---

# Regla: monto pagado por reporte

Al calcular cuánto se ha pagado de un reporte (para saldos, estados de cuenta, avisos de pago):

- Si `report.paymentStatus === "pagado"` → el reporte cuenta como **100% pagado** (`abono = importe total`), **sin importar** los abonos registrados en `paymentSummary`. Es un override manual.
- En cualquier otro estado → `abono = report.paymentSummary?.totalPaid` (o 0).
- `saldo = max(0, importe - abono)`, donde `importe = parseFloat(report.total)` (ya incluye IVA).

**Why:** El usuario marca reportes como "pagado" manualmente aunque no haya capturado abonos individuales; tratarlo de otra forma muestra saldos pendientes falsos.

**How to apply:** Replicar esta misma lógica en cualquier nuevo generador/reporte de saldos. Ya se usa en `account-statement-pdf-generator.ts` y `payment-notice-pdf-generator.ts`.
