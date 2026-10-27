---
name: Abonos parciales distribuidos
description: Reglas financieras confirmadas para repartir un pago de cliente entre varios reportes
---
Los conceptos y totales originales describen el servicio facturado y no se vuelven a capturar ni modificar al registrar un abono. El abono se aplica al saldo general de uno o más reportes existentes.

**Why:** El usuario confirmó que un cliente puede entregar una sola cantidad para acomodarla entre varios reportes pendientes. Mezclar el pago con los conceptos podría alterar cargos reales o duplicar importes.

**How to apply:** Permitir reparto automático por antigüedad y ajuste manual. La suma asignada debe coincidir exactamente con lo recibido y ninguna asignación puede superar el saldo del reporte.

El Estado de Cuenta Resumido debe conservar los importes y fechas de los abonos de un folio aun después de liquidarlo, tanto en su tabla como en el historial. Un pago repartido debe permitir identificar qué monto recibió cada folio.

**Why:** El usuario necesita que el cliente pueda seguir sus pagos entre estados de cuenta semanales; mostrar solo la fecha de liquidación oculta cómo se cubrió la deuda.

**How to apply:** Vincular aplicaciones nuevas con una identidad explícita compartida. No reconstruir vínculos históricos por coincidencia de fecha, método, referencia o importe. Los movimientos siguen siendo editables: el total aplicado registrado no es una prueba inmutable del importe original recibido.