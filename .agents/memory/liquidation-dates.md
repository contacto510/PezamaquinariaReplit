---
name: Fechas de liquidación en el resumen
description: Qué fecha quiere ver el usuario y cómo tratar la falta de evidencia histórica
---
La columna LIQUIDADO EL representa el día en que se registró en el sistema el movimiento que completó el saldo, no la fecha declarada del depósito. Conservar OBRA, PERÍODO, IMPORTE y ESTADO.

**Why:** El usuario recibe depósitos que luego asigna a reportes; necesita saber cuándo quedaron cubiertos dentro del sistema.

**How to apply:** Usar el día de México de la evidencia de registro. No deducir pagos desde entrega, recepción o última edición. Para reparaciones históricas sin evidencia mostrar “Fecha no registrada” y permitir capturar explícitamente una fecha conocida. No rellenar fechas antiguas al guardar cambios sin relación con pagos. Los registros de abonos editables permiten reconstruir el estado actual, no una auditoría inmutable del pasado.

Para el desglose de abonos parciales, la fecha solicitada es la **fecha de pago declarada en cada abono**, la misma que muestra Gestionar Abonos, no su fecha de captura. Mostrar cada importe/fecha dentro de la fila del folio receptor, además de la nota; el acumulado no representa un único depósito.

**Why:** El usuario confirmó que depósitos o diferencias aplicadas en días distintos deben distinguirse ante el cliente aunque se acumulen en un mismo reporte. Es una necesidad distinta de conocer el día de liquidación dentro del sistema.

**How to apply:** No cambiar la regla de LIQUIDADO EL al presentar el historial parcial. No inferir una fecha ni el folio de origen de una diferencia cuando no existe evidencia; el folio mostrado identifica el reporte que recibió el abono.