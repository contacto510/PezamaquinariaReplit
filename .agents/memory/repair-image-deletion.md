---
name: Borrado de fotos de reparación en object storage
description: Reglas para borrar fotos de reparación del storage sin romper otras reparaciones
---

- Las reparaciones duplicadas comparten literalmente las mismas URLs de foto (`image1-3`). **Nunca** borrar un objeto del storage sin antes comprobar que ninguna reparación lo referencia.
- **Why:** el flujo de duplicación copia las URLs tal cual; borrar el objeto deja a la otra reparación con la imagen rota.
- **How to apply:** el servidor valida el prefijo `public/repairs/`, chequea referencias en la tabla `repairs` y exige sesión antes de borrar. En el cliente, las URLs a borrar se encolan por sesión de edición y solo se procesan tras guardar con éxito esa misma reparación; la cola se vacía al cambiar de reparación.
- Al reemplazar una foto, encolar la anterior para borrado **solo después** de que la nueva subida tenga éxito; si falla, restaurar la anterior.
