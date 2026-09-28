---
name: Fechas de liquidación en el resumen
description: Qué fecha quiere ver el usuario y cómo tratar la falta de evidencia histórica
---
La columna LIQUIDADO EL representa el día en que se registró en el sistema el movimiento que completó el saldo, no la fecha declarada del depósito. Conservar OBRA, PERÍODO, IMPORTE y ESTADO.

**Why:** El usuario recibe depósitos que luego asigna a reportes; necesita saber cuándo quedaron cubiertos dentro del sistema.

**How to apply:** Usar el día de México de la evidencia de registro. No deducir pagos desde entrega, recepción o última edición. Para reparaciones históricas sin evidencia mostrar “Fecha no registrada” y permitir capturar explícitamente una fecha conocida. No rellenar fechas antiguas al guardar cambios sin relación con pagos. Los registros de abonos editables permiten reconstruir el estado actual, no una auditoría inmutable del pasado.