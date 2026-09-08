---
name: Sesión y publicaciones
description: Reglas para sincronizar la sesión del navegador y recuperarse de archivos obsoletos tras una publicación.
---

La sesión confirmada por el servidor es la única fuente de verdad. Un indicador persistente del navegador nunca basta para mostrar datos privados; cualquier respuesta 401 de una API protegida debe limpiar el estado local y sacar al usuario de la aplicación.

**Why:** El almacenamiento local puede sobrevivir a una publicación aunque la cookie no exista o ya no sea válida, dejando la interfaz aparentemente abierta mientras todas las consultas fallan.

**How to apply:** Todas las llamadas protegidas deben pasar por un mismo manejo de sesión. Al publicar, el HTML debe revalidarse, los assets con hash pueden ser inmutables y un fallo de módulo obsoleto debe permitir una sola recarga controlada sin crear ciclos.