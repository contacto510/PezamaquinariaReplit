---
name: PDFs e inputs numéricos en móvil
description: Restricciones de iOS para PDFs asíncronos y captura confiable de cantidades decimales en formularios móviles.
---

Para descargar un PDF después de una operación asíncrona en iOS, abrir una pestaña vacía sincrónicamente durante el toque y reutilizarla cuando el PDF esté listo. En cantidades móviles, conservar el texto local mientras el campo está enfocado y validar/convertir al perder el foco.

**Why:** Safari en iOS bloquea ventanas abiertas después de esperar guardados o fetches. Convertir cada pulsación directamente a número elimina estados intermedios como `1.` y puede transformar `1.5` en `15`.

**How to apply:** Usar este patrón en acciones que guarden y luego descarguen. Para cantidades/precios editables en móvil, aceptar estados intermedios durante la escritura y exigir un valor positivo al confirmar.