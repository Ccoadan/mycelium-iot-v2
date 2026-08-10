# Fase 9: calidad, seguridad y mantenibilidad

Esta fase revisa transversalmente las Fases 1 a 8 sin cambiar la identidad visual del dashboard ni conectar hardware real. Los controles se aplican en la API, el modelo de datos, el almacenamiento local y el ciclo de vida del servidor.

## Controles implementados

| Área | Control | Evidencia automatizada |
|---|---|---|
| Entrada HTTP | Solo `application/json` o tipos `+json`; JSON mal formado devuelve 400 | `simulation-routes.test.ts` |
| Tamaño HTTP | Máximo global de 16 KiB en cuerpos dirigidos a `/api/*`; también valida cuerpos sin `Content-Length` | `http-quality.test.ts` |
| Autenticación | Bloqueo temporal por nombre de usuario tras fallos repetidos; respuesta 429 con `Retry-After` | `auth.integration.test.ts`, `login-attempt-limiter.test.ts` |
| Autorización | Se autoriza al actor antes de revelar si el relé o el cuerpo son válidos | `control.integration.test.ts` |
| Acceso público | Mediciones, historial, estado de relés y última foto son públicos; galería histórica y CSV conservan autenticación | `auth.integration.test.ts`, `measurements.integration.test.ts`, `photos.integration.test.ts`, `export.integration.test.ts` |
| Sesión | JWT de esquema estricto, cookie `HttpOnly`, revocación persistida y validación adicional de solicitudes modificadoras | `auth.integration.test.ts` |
| Navegador | CSP, `X-Frame-Options: DENY`, permisos de cámara/micrófono/geolocalización deshabilitados y HSTS solo en producción | `http-quality.test.ts` |
| Privacidad | Las respuestas API usan `Cache-Control: no-store`, salvo políticas privadas más específicas | `http-quality.test.ts`, `photos.integration.test.ts` |
| MongoDB | Validadores estrictos para tipos de sensor/medición, usuarios, auditoría y metadatos fotográficos | `seed.integration.test.ts` |
| Fotografías | Confinamiento por ruta real, bloqueo de recorridos y enlaces externos, firma JPEG y máximo de 10 MiB | `local-photo-storage.test.ts`, `photos.integration.test.ts` |
| Errores | Códigos JSON estables, mensajes sin secretos e identificador de solicitud en fallos inesperados | suites de integración |
| Operación | Cierre ordenado del servidor HTTP, simulador y conexión MongoDB | revisión de tipos y compilación |

## Compuerta de calidad

Antes de considerar una entrega válida:

```powershell
npm run verify
npm audit --omit=dev
```

`npm run verify` ejecuta, en orden, `typecheck`, `check:frontend`, `build` y `test`. Las pruebas de integración usan un proceso MongoDB efímero real; no modifican `mycelium_iot_v2`.

Para verificar además la instalación local y el seed idempotente:

```powershell
npm run verify:setup
```

## Configuración de seguridad

El límite de acceso se controla con `AUTH_LOGIN_MAX_FAILURES`, `AUTH_LOGIN_WINDOW_SECONDS` y `AUTH_LOGIN_BLOCK_SECONDS`. Sus valores predeterminados son 5 fallos, una ventana de 300 segundos y un bloqueo de 300 segundos. Un login correcto limpia los fallos acumulados para ese usuario.

La política CSP permite los recursos propios y únicamente las hojas de estilo/fuentes de Google ya usadas por el diseño. No permite scripts inline, objetos, marcos ni acceso del navegador a cámara, micrófono o geolocalización.

## Límites conocidos y decisiones conscientes

- El limitador de login vive en memoria y protege esta instancia local. Una futura ejecución distribuida deberá mover su estado a una capa compartida.
- HSTS se envía solo con `APP_ENV=production`; en HTTP local se omite deliberadamente.
- MongoDB y los JPEG se conservan en volúmenes persistentes de la VPS. Un almacenamiento de objetos externo queda como mejora futura si aumenta el volumen.
- El historial público limita cada respuesta a 500 filas y la paginación a 1 000 páginas. Una exposición de mayor escala deberá añadir limitación de frecuencia en el proxy.
- No se conecta el ESP32 ni la ESP32-CAM original y todavía no se generan capturas automáticas cada dos horas.
- Los endpoints administrativos no sustituyen TLS. En producción deben exponerse exclusivamente mediante HTTPS y secretos propios del entorno.
