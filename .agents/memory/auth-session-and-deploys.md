---
name: Sesión y publicaciones
description: Reglas para sincronizar la sesión del navegador y recuperarse de archivos obsoletos tras una publicación.
---

La sesión confirmada por el servidor es la única fuente de verdad. Un indicador persistente del navegador nunca basta para mostrar datos privados; cualquier respuesta 401 de una API protegida debe limpiar el estado local y sacar al usuario de la aplicación.

**Why:** El almacenamiento local puede sobrevivir a una publicación aunque la cookie no exista o ya no sea válida, dejando la interfaz aparentemente abierta mientras todas las consultas fallan.

**How to apply:** Todas las llamadas protegidas deben pasar por un mismo manejo de sesión. Al publicar, el HTML debe revalidarse, los assets con hash pueden ser inmutables y un fallo de módulo obsoleto debe permitir una sola recarga controlada sin crear ciclos.

Una falla de red, timeout, respuesta 5xx o contenido inválido al verificar la sesión no prueba que haya vencido. Reintentar de forma limitada y, si sigue fallando, bloquear la vista privada con una opción de reintentar, sin borrar el acceso local. Un 401 explícito sí revoca el acceso.

**Why:** Tratar cualquier falla de verificación como sesión vencida obliga a volver a iniciar sesión sin evidencia del servidor. Conservar una bandera local tampoco autoriza mostrar información privada.

**How to apply:** Distinguir confirmación, rechazo y servicio temporalmente no disponible; cancelar verificaciones obsoletas y verificar con el servidor los cambios de sesión entre pestañas. No confundir la pantalla externa de una sola contraseña con el login propio de correo y contraseña.

En preview, el proxy puede devolver la cookie como Secure/SameSite=None aunque el servidor configure SameSite=Lax.

**Why:** Una comprobación de atributos encontró esta diferencia sin cambios en el código del servidor.

**How to apply:** Al diagnosticar, distinguir atributos de origen y atributos observados tras el proxy; las pruebas deben tolerar la transformación segura. Nunca pasar cookies completas a aserciones que impriman sus valores al fallar.