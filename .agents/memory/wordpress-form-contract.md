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

El usuario informó que WordPress genera `submission_id` como UUID v4, lo conserva en reintentos y lo renueva después de un envío exitoso. Es una descripción de la configuración externa, no una prueba de recepción.

**Why:** El formulario vacío de Datos usa el envío nativo de Bricks; no debe asumirse que faltar un campo visible implica que no se añade mediante código.

**How to apply:** Verificar que «exitoso» signifique confirmación de aceptación del receptor (201, o 200 de duplicado aceptado), no solo éxito visual de Bricks o envío SMTP.
