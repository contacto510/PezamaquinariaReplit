---
name: Formulario externo de WordPress
description: Contrato comunicado por el usuario para formularios de Bricks y su futura integración.
---

El usuario utiliza Bricks 2.4.6 en WordPress. Informó que Inicio y cuatro páginas de servicio comparten una plantilla de formulario con tipos `cotizacion_renta` y `reparacion`. Este comportamiento fue reportado por el usuario; no implica una verificación de configuración privada de WordPress.

Procesar únicamente los campos correspondientes a `tipo_solicitud`, aunque el envío incluya valores ocultos del tipo anterior.

**Why:** El usuario confirmó que cambiar de renta a reparación puede conservar y enviar valores de renta previamente capturados.

**How to apply:** Renta admite `cantidad_equipos`, `dias_renta`, `entrega` (`entrega_obra` o `recoge_sucursal`) y `fecha_requerida`; reparación admite `marca_modelo` y `falla_reportada`. Ambos admiten datos de contacto, municipio, equipo y comentarios. Verificar los nombres exactos de los campos comunes con un envío de prueba antes de implementar el mapeo.

`hp_check` es la trampa antispam, no una empresa ni dato comercial. Excluirlo de datos del cliente, notas y documentos; no desactivar el rechazo antispam de WordPress.

**Why:** El usuario confirmó que el antiguo campo «Empresa» era un honeypot y se renombró para evitar confusiones.

**How to apply:** No mapearlo a clientes ni mostrarlo como información de la solicitud. Fotografías opcionales quedaron para una fase posterior.
