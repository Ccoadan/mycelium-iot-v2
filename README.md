# Mycelium IoT V2

Base limpia de la segunda versión del sistema universitario de monitoreo de micelio. Esta entrega implementa las Fases 1 a 9: aplicación local con Hono y TypeScript, modelo MongoDB, seed, simulador coherente de los 21 canales, dashboard, control simulado, autenticación por roles, historial avanzado, exportación CSV, galería fotográfica y una revisión transversal de calidad y seguridad.

Las fuentes de los entregables del curso se encuentran en [`docs/academic/`](docs/academic/README.md). Su numeración académica es distinta de las fases técnicas anteriores. La colección Postman está excluida del alcance acordado.

El sistema PHP/MariaDB original no se modifica y no es una dependencia de ejecución. Los ESP32 y la ESP32-CAM reales continúan aislados en el VPS original.

## Estado actual

Incluido:

- servidor Node.js + TypeScript + Hono;
- dashboard responsive inspirado en el diseño Apple/orgánico del sistema legacy;
- ambiente, CO₂, mosaico de nueve bolsas, detalle ilustrado y gráficas SVG sin frameworks;
- consulta correcta del último dato e historial filtrable y paginado;
- filtros históricos por rango de fechas, variable, sensor y bolsa;
- exportación CSV filtrada, compatible con Excel, con fechas UTC y de Lima;
- `GET /api/health` con estado independiente de API y MongoDB;
- seis colecciones MongoDB con validación de esquema e índices;
- seed idempotente de 21 sensores, cuatro relés simulados y dos usuarios;
- contraseñas procesadas con bcrypt y obtenidas solo desde variables de entorno;
- auditoría estructurada del seed;
- simulador programable con continuidad temporal y 21 mediciones por ciclo;
- recuperación del último valor persistido después de reiniciar la aplicación;
- controles locales para iniciar, detener, ejecutar un ciclo y cambiar el intervalo;
- auditoría estructurada de las operaciones del simulador;
- control funcional de cuatro relés simulados con persistencia inmediata;
- autorización por rol: `admin` modifica y `viewer` solo consulta;
- auditoría estructurada de cada cambio real de relé;
- login, consulta de sesión y logout con JWT en cookie `HttpOnly`;
- revocación de sesiones mediante una versión persistida por usuario;
- rutas de datos protegidas y validación anti-CSRF para acciones modificadoras;
- auditoría de logins correctos, fallidos y cierres de sesión;
- auditoría de las exportaciones con usuario, filtros y cantidad de filas;
- última fotografía, galería paginada y visor ampliado con hora de Lima;
- seis capturas históricas reales, seleccionadas e importadas de forma controlada;
- metadatos fotográficos en MongoDB y archivos JPEG separados mediante una abstracción de almacenamiento;
- acceso autenticado tanto al catálogo como al contenido de las imágenes;
- validación estricta de JSON, esquemas MongoDB reforzados y límite global de 16 KiB por solicitud API;
- protección temporal frente a intentos repetidos de login y respuestas privadas sin caché;
- política CSP, permisos del navegador restringidos y protección frente a `iframe`;
- rutas fotográficas confinadas al directorio configurado, sin recorridos, escapes por enlaces ni archivos mayores de 10 MiB;
- errores API estructurados, identificador por solicitud y apagado ordenado del servidor;
- pruebas unitarias e integración con un proceso `mongod` efímero real.

Fuera de alcance por ahora: la publicación automática de fotografías cada dos horas y la infraestructura Cloudflare de la Fase 10. La abstracción de almacenamiento queda preparada para añadir posteriormente un simulador de cámara y sustituir el disco local por R2.

## Arquitectura

```text
mycelium-iot-v2/
├── public/                    Dashboard, CSS, JavaScript, bolsas y muestra fotográfica
├── docs/QUALITY.md            Controles, evidencia y límites conocidos de la Fase 9
├── docs/academic/             Fuentes del documento técnico y trazabilidad académica
├── deploy/                    Compose de producción, Caddy y plantilla de secretos
├── .github/workflows/         Pipeline de calidad y despliegue
├── scripts/
│   ├── simulation-control.ts Controles CLI para el simulador local
│   └── verify-setup.ts       Verificación autocontenida con MongoDB efímero
├── src/
│   ├── cli/                  Seed e importación fotográfica compilables para producción
│   ├── api/routes/           Rutas HTTP
│   ├── config/               Validación de entorno con Zod
│   ├── database/             Conexión, colecciones, validadores e índices
│   ├── models/               Tipos de dominio MongoDB
│   ├── repositories/         Mediciones, fotos, control, usuarios, auditoría y simulación
│   ├── services/             Consultas, fotos, autenticación, control, auditoría, seed y simulación
│   ├── app.ts                Aplicación Hono independiente del runtime
│   └── server.ts             Adaptador local para Node.js
├── tests/                    Pruebas unitarias, integración, Selenium y JMeter
└── legacy/README.md          Procedencia y hashes; no contiene respaldos
```

`app.ts` no inicia procesos ni carga `.env`; recibe sus dependencias. El adaptador Node queda en `server.ts`. Esta separación facilita sustituir el runtime y el proveedor de persistencia en una futura fase de Cloudflare sin mezclar esa infraestructura con las rutas y servicios.

## Modelo MongoDB

| Colección | Propósito | Índices relevantes |
|---|---|---|
| `sensors` | Configuración de los 21 canales | identidad `sensorId + type` única, `key` única, `type + bag`, `active` |
| `measurements` | Lecturas UTC | `sensorId + type + timestamp desc`, `type + bag + timestamp desc`, `timestamp desc` |
| `controlState` | Estado único de cuatro relés simulados | `updatedAt desc` |
| `users` | Usuarios y hashes bcrypt | `username` único, `role + active` |
| `auditLogs` | Eventos estructurados | fecha, usuario, y `action + entity + timestamp` |
| `photos` | Metadatos y referencias; nunca binarios grandes | `storageKey` única, captura y publicación |

Las mediciones guardarán fechas UTC. La presentación utilizará `America/Lima`. La humedad de bolsa está definida explícitamente en porcentaje (`%`), no en ADC.

## Requisitos

- Node.js 20.9 o superior.
- npm.
- Para uso normal, MongoDB Community local o una base MongoDB Atlas accesible mediante URI.

`npm run verify:setup` puede validar la arquitectura de forma independiente mediante `mongodb-memory-server`: ejecuta temporalmente un proceso MongoDB real, comprueba el seed y elimina esa instancia al terminar. Esto es solo para pruebas; los datos efímeros no sustituyen la base de desarrollo persistente.

## Instalación

Desde esta carpeta:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` y reemplace todos los valores `replace-with-...`. `.env` está ignorado por Git.

Para MongoDB local, la configuración base es:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=mycelium_iot_v2
```

Inicie el servicio MongoDB de su instalación antes de ejecutar el seed. Para Atlas, sustituya `MONGODB_URI` por la URI entregada por Atlas y manténgala únicamente en `.env`.

### MongoDB con Docker Desktop

El proyecto incluye `compose.yaml` con MongoDB 8, almacenamiento persistente y el puerto limitado al equipo local. Publica por defecto el puerto `27018` para no colisionar con una instalación nativa en `27017`.

Para utilizar Docker en lugar de MongoDB instalado en Windows, cambie temporalmente `MONGODB_URI` a `mongodb://127.0.0.1:27018` y, con Docker Desktop iniciado, ejecute:

```powershell
npm run db:up
docker compose ps
npm run seed
```

La base persiste en el volumen `mycelium-iot-v2-mongodb-data`, aunque el contenedor se detenga. Para detener el servicio sin borrar sus datos:

```powershell
npm run db:down
```

No ejecute `docker compose down --volumes` salvo que quiera eliminar explícitamente la base local.

MongoDB Compass puede conectarse con:

```text
MongoDB de Windows: mongodb://127.0.0.1:27017
MongoDB de Docker:  mongodb://127.0.0.1:27018
```

Después seleccione la base `mycelium_iot_v2` para inspeccionar sus seis colecciones.

## Seed y usuarios de desarrollo

El seed crea:

- `SEED_ADMIN_USERNAME`, rol `admin`;
- `SEED_VIEWER_USERNAME`, rol `viewer`.

Las contraseñas no tienen valores implícitos en el código. Deben definirse en `.env`, tener entre 12 y 128 caracteres y se almacenan exclusivamente como hashes bcrypt. Los nombres sugeridos en `.env.example` son `admin` y `viewer`; las contraseñas de ejemplo son marcadores que deben reemplazarse.

Con MongoDB iniciado:

```powershell
npm run seed
```

El comando puede repetirse: actualiza las 21 configuraciones, el estado inicial y los dos usuarios sin duplicarlos. Cada ejecución registra un evento `database.seeded` en `auditLogs`.

## Ejecución local

Desarrollo con recarga:

```powershell
npm run dev
```

Ejecución simple:

```powershell
npm start
```

Abra `http://localhost:3000`. El endpoint de salud es `http://localhost:3000/api/health`.

Una respuesta sana tiene HTTP 200. Si la API funciona pero MongoDB no responde, devuelve HTTP 503 y `status: "degraded"` sin filtrar credenciales ni detalles internos.

## Dashboard

El dashboard conserva la identidad visual útil de la versión original: fondo gris claro, tarjetas blancas, tipografías DM Sans y Playfair Display, controles segmentados, indicadores verdes y las nueve ilustraciones históricas de bolsas. El HTML, CSS y JavaScript fueron reconstruidos; no se copiaron llamadas PHP, funciones duplicadas ni dependencias del VPS.

Incluye:

- temperatura, humedad y CO₂ ambientales actuales;
- gráfica seleccionable de las tres variables ambientales;
- nueve tarjetas de bolsas con temperatura o humedad porcentual;
- selección y detalle de cada bolsa con su ilustración;
- gráfica doble de temperatura y humedad de la bolsa seleccionada;
- estado de API, MongoDB y simulador;
- actualización automática de datos y estados vacíos, obsoletos o sin conexión;
- cuatro interruptores de relés conectados a MongoDB, con permisos y confirmación visual;
- formulario de acceso, identidad y rol visibles, y cierre de sesión;
- historial con rango de fechas, variable, sensor y bolsa, tabla paginada y descarga CSV;
- última captura del módulo, galería histórica responsive y visor ampliado.

Las gráficas se dibujan con SVG nativo y no requieren Chart.js. Los timestamps se reciben en UTC y se presentan en `America/Lima`.

Endpoints de lectura incorporados:

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/sensors` | Configuración de los 21 sensores |
| `GET` | `/api/measurements/latest` | Último documento real de cada sensor, ordenado por timestamp descendente |
| `GET` | `/api/measurements/history` | Historial filtrado y paginado |
| `GET` | `/api/export/csv` | Descarga CSV con los mismos filtros |
| `GET` | `/api/photos/latest` | Metadatos de la captura más reciente |
| `GET` | `/api/photos` | Galería paginada con `page` y `pageSize` |
| `GET` | `/api/photos/:id/content` | Contenido JPEG protegido de una fotografía |

Ejemplo de historial:

```text
/api/measurements/history?type=temperature_bag&sensorId=1&bag=1&hours=24&page=1&pageSize=100&sort=desc
```

## Historial y exportación

El panel interpreta los campos de fecha como hora de Lima (`America/Lima`) y los convierte a UTC antes de consultar. Los límites `from` y `to` son inclusivos. Si no se indica un rango, la API consulta las últimas 24 horas; el rango máximo aceptado es de 366 días.

Filtros compartidos por el historial y el CSV:

- `from` y `to`: timestamps ISO 8601 con zona horaria;
- `type`: una de las cinco variables de medición;
- `sensorId`: identificador de 0 a 9;
- `bag`: bolsa de 1 a 9.

El historial también acepta `page`, `pageSize` y `sort=asc|desc`. La respuesta incluye el total de documentos y páginas. Las combinaciones incompatibles, por ejemplo CO₂ ambiental con una bolsa, se rechazan con HTTP 400 en vez de devolver resultados ambiguos.

El CSV contiene las columnas `timestamp_utc`, `timestamp_lima`, `sensor_id`, `type`, `bag`, `value`, `unit` y `source`; usa UTF-8 con BOM y saltos CRLF para Excel. La exportación conserva el orden cronológico, limita cada archivo a 50 000 filas y protege celdas frente a fórmulas interpretadas por hojas de cálculo. Tanto `admin` como `viewer` pueden descargarlo. Cada descarga correcta registra `export.csv_generated` en `auditLogs` con el usuario, los filtros y el total exportado.

## Fotografías

MongoDB conserva exclusivamente el nombre, la clave de almacenamiento, el origen, las fechas UTC, el tamaño, el tipo MIME y la resolución. Los bytes JPEG permanecen en `PHOTO_STORAGE_LOCAL_ROOT`; el frontend nunca recibe esa ruta local, únicamente un endpoint protegido por la cookie de sesión. La interfaz convierte las fechas a `America/Lima`.

La muestra contiene seis capturas reales de junio, julio y agosto de 2026. Incluye tomas iluminadas y nocturnas para representar el comportamiento auténtico de la cámara. No se copiaron los cientos de archivos del respaldo ni el código PHP de galería/carga.

La importación es idempotente y acepta como máximo 24 JPEG en la carpeta de muestras. Valida firma, tamaño, nombre histórico y dimensiones antes de crear o actualizar metadatos:

```powershell
npm run photos:import-samples
```

La acción registra `photos.historical_sample_imported` en `auditLogs`. Tanto `admin` como `viewer` pueden ver fotografías; no existe todavía un endpoint de carga ni conexión con la ESP32-CAM real.

## Autenticación y permisos

La sesión se firma con HS256 usando `JWT_SECRET` y se entrega únicamente en una cookie `HttpOnly`, `SameSite=Lax`. JavaScript no recibe el token ni lo guarda en `localStorage`. En producción la cookie también utiliza `Secure`.

| Método | Ruta | Función |
|---|---|---|
| `POST` | `/api/auth/login` | Valida usuario y contraseña bcrypt, crea la sesión y audita el acceso |
| `GET` | `/api/auth/me` | Devuelve el usuario y rol de la sesión vigente |
| `POST` | `/api/auth/logout` | Revoca las sesiones del usuario, elimina la cookie y audita la salida |

Los usuarios inactivos, tokens vencidos, alterados o emitidos antes de un logout reciben HTTP 401. Las acciones administrativas de relés y simulador exigen rol `admin`; un `viewer` conserva acceso de lectura y recibe HTTP 403 al intentar modificar. Las solicitudes modificadoras también exigen el encabezado interno del dashboard, como defensa adicional frente a CSRF.

El formulario no contiene contraseñas predeterminadas. Utilice las credenciales definidas en `.env` y aplicadas mediante `npm run seed`. Repetir el seed actualiza los hashes e invalida sesiones emitidas anteriormente.

## Control simulado

Los cuatro controles conservan la asignación comprobada en el sistema original:

| Relé | Uso simulado |
|---|---|
| `relay1` | Ventilador de entrada |
| `relay2` | Ventilador de salida |
| `relay3` | Iluminación de cámara |
| `relay4` | Relé auxiliar |

No se contacta ningún ESP32. Al accionar un interruptor, la API actualiza el documento único `controlState`, responde con el estado completo y registra `control.relay_changed` en `auditLogs`. Repetir el mismo estado no genera una auditoría falsa.

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/control` | Estado de los cuatro relés, actor local y permiso efectivo |
| `PATCH` | `/api/control/:relay` | Actualiza un relé con `{ "enabled": true | false }` |

El actor procede exclusivamente de la sesión autenticada. El rol se vuelve a comprobar contra el usuario activo de MongoDB en cada solicitud; no se acepta desde el navegador ni desde un encabezado manipulable.

## Simulador IoT

Cada ciclo crea exactamente 21 documentos con un timestamp UTC compartido:

- temperatura, humedad relativa y CO₂ ambientales;
- temperatura y humedad calibrada en porcentaje para cada una de las nueve bolsas.

El motor no genera saltos aleatorios independientes. Combina un valor base, reversión gradual hacia un objetivo, variación diaria lenta, ruido limitado y pequeñas diferencias deterministas entre bolsas. Aplica estos límites físicos:

| Canal | Límite simulado |
|---|---|
| Temperatura ambiental y de bolsa | 18–30 °C |
| Humedad ambiental | 65–95 % |
| Humedad de bolsa | 55–92 % |
| CO₂ ambiental | 450–3000 ppm |

Al iniciar un proceso nuevo, el simulador consulta la lectura más reciente de cada sensor y continúa desde esos valores. Nunca interpreta la humedad de bolsa como ADC.

Primero mantenga `npm start` o `npm run dev` en ejecución. En otra terminal puede operar el simulador con:

```powershell
npm run simulation:status
npm run simulation:once
npm run simulation:start
npm run simulation:interval -- 30
npm run simulation:stop
```

`simulation:start` persiste un ciclo inmediatamente y luego usa el intervalo configurado. `simulation:stop` detiene ciclos futuros sin borrar mediciones. El intervalo puede estar entre 1 y 86400 segundos y vuelve al valor de `.env` cuando se reinicia la aplicación.

API local equivalente:

| Método | Ruta | Función |
|---|---|---|
| `GET` | `/api/simulation` | Estado del simulador |
| `POST` | `/api/simulation/start` | Iniciar y generar el primer ciclo |
| `POST` | `/api/simulation/stop` | Detener ciclos futuros |
| `POST` | `/api/simulation/run-once` | Ejecutar un ciclo manual |
| `PATCH` | `/api/simulation/config` | Cambiar `intervalSeconds` en memoria |

Los controles modificadores requieren una sesión `admin` y además están disponibles solo cuando `SIMULATION_API_CONTROL_ENABLED=true`. Los comandos CLI se autentican con las credenciales admin configuradas en `.env`; no imprimen la contraseña ni la cookie. `/api/health` informa públicamente si el simulador está `running` o `stopped`.

## Verificación y pruebas

La compuerta completa de calidad de la Fase 9 se ejecuta con un solo comando:

```powershell
npm run verify
```

Incluye TypeScript estricto, validación sintáctica del JavaScript del dashboard, compilación de producción y toda la suite unitaria/de integración. El detalle de controles y límites conocidos está en [`docs/QUALITY.md`](docs/QUALITY.md).

Validación autocontenida de la base de las Fases 1 y 2:

```powershell
npm run verify:setup
```

Este comando levanta MongoDB efímero, ejecuta dos veces el seed para comprobar idempotencia y verifica mediante consultas reales:

- seis colecciones;
- 21 sensores (3 ambientales y 18 de bolsas);
- un estado con cuatro relés;
- dos usuarios y hashes bcrypt verificables;
- registros de auditoría;
- índices de consulta del último dato e historial;
- respuesta sana de `/api/health`.

Resto de comprobaciones:

```powershell
npm run typecheck
npm run build
npm test
```

La suite también comprueba las Fases 3 a 9: continuidad entre ciclos y reinicios, rangos físicos, humedad en porcentaje, 21 inserciones por ciclo, recuperación del dato más reciente, historial filtrado y paginado, validación de rangos, CSV UTF-8 con fechas UTC/Lima, auditoría de exportación, persistencia de relés, login bcrypt, cookie `HttpOnly`, revocación, permisos `admin`/`viewer`, defensa de solicitudes modificadoras, lectura de metadatos JPEG, galería paginada, archivos fotográficos protegidos, límite de intentos de acceso, JSON estricto, tamaño máximo de solicitudes, cabeceras de seguridad y activos visuales sin referencias PHP/ADC.

## Variables de entorno

| Variable | Uso |
|---|---|
| `APP_ENV` | `development`, `test` o `production` |
| `HOST` | Interfaz HTTP; por defecto `127.0.0.1` para desarrollo local |
| `PORT` | Puerto HTTP local |
| `MONGODB_URI` | Conexión local o Atlas; puede contener secretos y no debe registrarse |
| `MONGODB_DB_NAME` | Nombre de la base V2 |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | Tiempo máximo de selección del servidor |
| `SEED_ADMIN_USERNAME` / `SEED_VIEWER_USERNAME` | Identidades iniciales |
| `SEED_ADMIN_PASSWORD` / `SEED_VIEWER_PASSWORD` | Entradas temporales del seed; solo se persiste el hash |
| `BCRYPT_ROUNDS` | Coste bcrypt entre 10 y 14 |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 caracteres para firmar sesiones JWT |
| `AUTH_SESSION_TTL_SECONDS` | Duración de sesión entre 300 y 604800 segundos; por defecto 8 horas |
| `AUTH_COOKIE_NAME` | Nombre de la cookie `HttpOnly` |
| `AUTH_LOGIN_MAX_FAILURES` | Fallos permitidos por usuario dentro de la ventana; por defecto 5 |
| `AUTH_LOGIN_WINDOW_SECONDS` | Ventana de conteo de fallos; por defecto 300 segundos |
| `AUTH_LOGIN_BLOCK_SECONDS` | Duración del bloqueo temporal; por defecto 300 segundos |
| `PHOTO_STORAGE_LOCAL_ROOT` | Carpeta local de JPEG; por defecto `./public/photos` |
| `SIMULATION_INTERVAL_SECONDS` | Intervalo inicial entre ciclos, de 1 a 86400 segundos |
| `SIMULATION_AUTO_START` | Inicia el simulador al levantar el servidor cuando vale `true` |
| `SIMULATION_API_CONTROL_ENABLED` | Habilita controles locales fuera de producción |

## Referencias legacy

Los respaldos originales permanecen fuera del proyecto y se trataron como solo lectura. Sus ubicaciones, hashes SHA-256 y la comprobación estructural mínima están documentados en [`legacy/README.md`](legacy/README.md). No se copiaron PHP, firmware ni credenciales; únicamente se extrajeron seis JPEG seleccionados para la muestra controlada de la Fase 8.
