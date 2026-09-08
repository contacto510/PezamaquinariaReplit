---
name: Vínculo cliente-cotización
description: Reglas para asociar cotizaciones a clientes y por qué los emails placeholder rompen la vinculación
---

**Regla:** Al asociar una cotización con un cliente, la prioridad es: (1) clientId explícito, (2) email real (no vacío, no "N/A"), (3) nombre exacto ignorando mayúsculas/espacios. Nunca buscar ni guardar emails placeholder.

**Why:** `clients.email` tiene restricción UNIQUE. Históricamente las cotizaciones sin email se guardaban con "N/A" y el matching era solo por email exacto, así que TODAS las cotizaciones sin correo se pegaban al único cliente cuyo email era "N/A" (se detectaron 5 cotizaciones mal ligadas; datos ya corregidos en julio 2026). Además, solo puede existir un cliente con email "" — los clientes sin correo deben guardarse con email NULL.

**How to apply:** Cualquier lógica nueva que cree o busque clientes (reparaciones, reportes, importaciones) debe seguir la misma prioridad y usar NULL para emails faltantes. Ojo: el endpoint register-client reutiliza el clientId ya guardado; para re-vincular una cotización mal asignada hay que poner client_id en NULL primero.
