# Conexión de Bricks con Solicitudes web

## Estado y alcance

La app implementa recepción y bandeja privada. No se ha instalado ni activado nada
en WordPress. No incluye archivos, audio, tienda ni seguimiento de WhatsApp.
No activar el envío real hasta completar la configuración y la prueba de punta a punta.

## Preparación del sistema

1. Aplicar `db/migrations/0004_web_requests.sql` en desarrollo. Para Neon externo
   de producción se requiere autorización específica; publicar código no migra
   automáticamente esa base externa.
2. Configurar `WORDPRESS_WEBHOOK_SECRET` mediante Secrets, con al menos 32 caracteres
   aleatorios. No guardar su valor en este documento, el repositorio, URLs ni JavaScript.
3. Publicar y usar la URL HTTPS estable del sistema, no el preview temporal.

## Bricks 2.4.6

En la plantilla compartida, agregar acción Webhook:

- Método: POST.
- URL: URL pública del sistema + `/api/integrations/bricks/requests`.
- Content-Type: `application/json`.
- Encabezado `X-Webhook-Secret`: configurado solo del lado servidor de WordPress.
- Cuerpo: objeto JSON plano con los campos de abajo, no el objeto de metadatos
  completo de Bricks ni un arreglo de etiquetas/campos.
- Revisar mediante una prueba que la credencial no se imprime en el HTML o scripts
  públicos. No deshabilitar la validación de certificados HTTPS.

Si el editor de Bricks no permite producir el cuerpo o el identificador estable,
usar una acción PHP del servidor con un pequeño plugin, no JavaScript con credenciales.
La instalación de ese adaptador no forma parte del código de esta app.

## Contrato

Comunes: `submission_id`, `tipo_solicitud`, `nombre`, `telefono`, `correo`,
`municipio`, `equipo`, `mensaje`, `pagina_url`, `pagina_titulo`, `utm_source`,
`utm_medium`, `utm_campaign`.

- `submission_id`: identificador único y persistido por envío en WordPress (UUID
  recomendado). Reutilizarlo sin cambiar el contenido en cada reintento.
  NO regenerarlo en cada intento HTTP ni deducirlo del nombre/teléfono.
- `tipo_solicitud`: `cotizacion_renta` o `reparacion`; también se acepta un arreglo
  de un solo valor por la serialización de radios de Bricks.
- Nombre, teléfono, equipo y página de origen HTTPS son obligatorios.
- Correo puede estar vacío. Los campos desconocidos no se guardan.
- Renta: `cantidad_equipos` y `dias_renta` enteros positivos; `entrega` es
  `entrega_obra` o `recoge_sucursal`; `fecha_requerida` opcional.
- Reparación: `marca_modelo` opcional y `falla_reportada` obligatoria.
- Se ignoran campos exclusivos del tipo contrario y `hp_check`. WordPress debe
  seguir rechazando spam antes de enviar; excluir el honeypot no desactiva Bricks.
- Límite de cuerpo 32 KB. No enviar fotos/base64.
- La URL de página solo conserva origen y ruta; nunca su query string.
- Se permiten los hosts de Péza y el subdominio de pruebas; un dominio nuevo
  requiere actualizar la lista del servidor.

Ejemplo ficticio:

```json
{
  "submission_id": "wp-550e8400-e29b-41d4-a716-446655440000",
  "tipo_solicitud": "cotizacion_renta",
  "nombre": "Contacto de prueba",
  "telefono": "8100000000",
  "correo": "",
  "municipio": "Monterrey",
  "equipo": "Generador",
  "cantidad_equipos": 1,
  "dias_renta": 3,
  "entrega": "entrega_obra",
  "fecha_requerida": "2026-12-01",
  "mensaje": "Confirmar capacidad y disponibilidad",
  "pagina_url": "https://sd.pezamaquinaria.com.mx/",
  "pagina_titulo": "Inicio"
}
```

## Respuestas y conservación de solicitudes

- 201: guardado; marcar entregado.
- 200 con `duplicate: true`: ya guardado; marcar entregado sin crear otro.
- 400/409: revisar datos/identificador; conservar la solicitud para corrección,
  no reintentar indefinidamente.
- 401: revisar credencial en servidores; no solicitarla al visitante.
- 413/415: corregir tamaño/formato.
- 429: máximo 120 solicitudes nuevas por hora, entre todas las instancias.
  Respetar Retry-After; los reintentos idénticos ya guardados no consumen cuota.
- 503, timeout o error de red: conservar y reintentar más tarde con el mismo ID.

**Un webhook no constituye una cola.** Antes de activarlo, configurar persistencia
local de envíos y notificación de fallos en WordPress, además del correo habitual.
La entrega garantizada con reintentos requiere un adaptador/cola persistente del
lado WordPress. No indicar éxito de integración hasta que el servidor confirme.
El correo es un respaldo operativo para atender, no sustituye la cola de entrega.

## Prueba de aceptación

Enviar renta y reparación ficticias desde WordPress. Cambiar renta→reparación
antes de enviar y verificar que no se importen datos de renta. Repetir un envío
con el mismo ID y comprobar que el contador no aumenta. Simular indisponibilidad
en un entorno de pruebas y confirmar conservación/reenvío, nunca con clientes reales.

En la app, confirmar bandeja, filtros y cambios de estado. Incorporar datos en el
formulario existente, elegir cliente/conceptos/precios y guardar. El vínculo con
el folio y la conversión se confirman en la misma transacción de creación.
Abrir dos formularios para la misma solicitud no debe crear dos documentos.
Una solicitud recibida por sí sola nunca registra dinero ni una deuda.

## Fechas y conteos

Los filtros diarios de recepción usan la zona de Ciudad de México. Los conteos
de estados y tipos respetan el rango de fechas y son independientes del filtro
de la lista. WhatsApp se muestra como no activado, nunca como cero medido.
