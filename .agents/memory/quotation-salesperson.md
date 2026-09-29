---
name: Vendedor de cotizaciones
description: Uso interno del vendedor y límites de recuperación de los datos históricos
---
El usuario requiere conservar el vendedor en la cotización del sistema, pero explícitamente NO incluirlo en el PDF.

**Why:** Necesita el registro interno de quién atendió la cotización; no solicitó cambiar el documento entregado al cliente.

**How to apply:** Exigir un nombre al guardar nuevas cotizaciones o completar una antigua, conservarlo al duplicar y no inferir vendedores faltantes a partir de la sesión compartida, del cliente o de fechas. La captura histórica requiere evidencia o indicación del usuario: el formulario antiguo omitía este dato al enviarlo, así que no asumir que los nombres estuvieron guardados en alguna base.