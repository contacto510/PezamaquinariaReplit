---
name: Alcance financiero del resumen de reparaciones
description: Diferenciar deuda, cotizaciones, actividad y utilidad sin duplicar el Estado de Cuenta
---
El resumen de Reparaciones es una vista de las mismas órdenes R-XX del Estado de Cuenta del Cliente, no una nueva fuente de cargos. Las cotizaciones de reparación son estimaciones separadas de la deuda y no se mezclan con el módulo general de Cotizaciones.

**Why:** El usuario expresó preocupación por duplicar o confundir reparaciones del cliente y cotizaciones al agregar un dashboard.

**How to apply:** Compartir las reglas de inclusión y saldo del Estado de Cuenta. No cambiar estados ni elegibilidad contable al clasificar visualmente las órdenes. El período de actividad no debe ocultar deuda antigua aún pendiente: las fechas de recepción, entrega y liquidación responden a métricas distintas.

No llamar ganancia a lo cotizado, al total de órdenes ni al importe marcado como pagado. Para utilidad se requieren costos internos; una orden pagada sin fecha no demuestra cobro dentro de un período.

**Why:** El usuario reconoció que el punto de ganancias requiere capturar costos y otros costos; esta información no puede deducirse del precio de venta.

**How to apply:** Mantener costos/utilidad separados del seguimiento de cuentas. No inventar fechas ni abonos históricos para presentar flujo de caja, y mostrar explícitamente los datos faltantes.
