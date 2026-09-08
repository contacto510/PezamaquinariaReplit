---
name: Ediciones parciales seguras
description: Reglas de integridad para editar reportes y reparaciones sin perder datos ni alterar saldos
---
Una edición parcial debe conservar cualquier campo que no venga explícitamente en la solicitud, incluidos estados, IVA, fechas, imágenes y conceptos.

**Why:** Los formularios y actualizaciones rápidas no siempre envían el registro completo. Aplicar valores predeterminados o vacíos en esos casos puede reabrir una reparación, borrar fechas o cambiar un total silenciosamente.

**How to apply:** Distinguir entre campo omitido y campo enviado vacío. Confirmar encabezado, conceptos y totales como una sola operación; si cualquier parte falla, conservar íntegro el estado anterior.

Los totales deben calcularse con los mismos valores de dos decimales que finalmente se guardan.

**Why:** Calcular con más precisión que la base de datos puede dejar diferencias entre el total del encabezado y la suma visible de los conceptos.

**How to apply:** Normalizar cantidad y precio antes de derivar subtotales, IVA y total.