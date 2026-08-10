# Fases 2 y 3 - Atributos y requisitos no funcionales

Cada requisito tiene un criterio medible y un mecanismo de verificación.

## Mapeo de atributos

| Atributo | Requisitos relacionados |
|---|---|
| Seguridad | RNF-SEG-01 a RNF-SEG-08 |
| Rendimiento | RNF-REN-01 a RNF-REN-05 |
| Disponibilidad | RNF-DIS-01 a RNF-DIS-04 |
| Usabilidad | RNF-USA-01 a RNF-USA-04 |
| Escalabilidad | RNF-ESC-01 a RNF-ESC-03 |
| Mantenibilidad | RNF-MAN-01 a RNF-MAN-06 |
| Portabilidad | RNF-POR-01 y RNF-POR-02 |
| Confiabilidad | RNF-CON-01 a RNF-CON-03 |

## Catálogo de requisitos

| ID | Requisito verificable | Evidencia prevista |
|---|---|---|
| RNF-SEG-01 | Todo acceso público deberá usar HTTPS y no expondrá MongoDB a Internet. | Caddy y escaneo de puertos |
| RNF-SEG-02 | Las contraseñas se almacenarán solo como hashes bcrypt con coste mínimo 12 en producción. | Prueba de seed y revisión MongoDB |
| RNF-SEG-03 | La sesión utilizará cookie `HttpOnly`, `Secure` en producción y `SameSite=Lax`, con duración máxima de 8 horas. | Prueba de integración |
| RNF-SEG-04 | Después de 5 accesos fallidos en 5 minutos, el usuario quedará bloqueado al menos 5 minutos. | Prueba de integración |
| RNF-SEG-05 | Un usuario `viewer` recibirá HTTP 403 en operaciones administrativas. | Vitest y Selenium |
| RNF-SEG-06 | Los cuerpos de la API no superarán 16 KiB y las operaciones JSON rechazarán tipos incorrectos. | Prueba HTTP |
| RNF-SEG-07 | Ningún secreto, respaldo, clave SSH ni archivo `.env` será versionado. | `.gitignore` y revisión CI |
| RNF-SEG-08 | Las lecturas de monitoreo serán públicas; galería histórica y CSV exigirán sesión, y toda modificación exigirá rol `admin`. | Vitest y Selenium |
| RNF-REN-01 | `/api/health` tendrá p95 menor de 500 ms durante la prueba JMeter de 10 usuarios. | Reporte JMeter |
| RNF-REN-02 | Las consultas de últimas mediciones e historial tendrán p95 menor de 2 s con 10 usuarios concurrentes. | Reporte JMeter |
| RNF-REN-03 | La tasa de errores bajo la carga académica será inferior a 1 %. | Reporte JMeter |
| RNF-REN-04 | Un ciclo del simulador persistirá exactamente 21 mediciones en menos de 2 s. | Prueba de integración |
| RNF-REN-05 | El historial estará paginado y una descarga CSV no excederá 50 000 filas. | Pruebas de integración |
| RNF-DIS-01 | La aplicación expondrá un endpoint de salud que diferencie API y MongoDB. | `/api/health` |
| RNF-DIS-02 | Los servicios de aplicación, base y proxy reiniciarán automáticamente después de un fallo. | Docker Compose |
| RNF-DIS-03 | MongoDB y fotografías sobrevivirán recreaciones de contenedores mediante volúmenes. | Prueba de despliegue |
| RNF-DIS-04 | Se realizará respaldo diario con RPO de 24 horas y RTO objetivo de 2 horas. | Procedimiento y restauración de prueba |
| RNF-USA-01 | El dashboard será utilizable entre 360 px y 1440 px sin desplazamiento horizontal global. | Selenium e inspección responsive |
| RNF-USA-02 | Todo error de acceso o conectividad mostrará un mensaje comprensible sin detalles internos. | Selenium y pruebas API |
| RNF-USA-03 | Las fechas visibles se presentarán en `America/Lima` y la persistencia utilizará UTC. | Pruebas de exportación/UI |
| RNF-USA-04 | El rol y la sesión activa serán visibles permanentemente después del acceso. | Selenium |
| RNF-ESC-01 | La aplicación soportará al menos 10 usuarios concurrentes en la VPS de 1 GB con 2 GB de swap manteniendo RNF-REN-01 a 03. | JMeter |
| RNF-ESC-02 | Las consultas de último dato e historial utilizarán índices compuestos verificables. | Prueba de seed y revisión |
| RNF-ESC-03 | El almacenamiento fotográfico podrá sustituirse sin modificar rutas ni reglas de negocio. | Interfaz `PhotoStorage` |
| RNF-MAN-01 | TypeScript compilará en modo estricto sin errores. | Pipeline |
| RNF-MAN-02 | La cobertura será al menos 80 % de líneas, 80 % de sentencias, 75 % de ramas y 85 % de funciones. | Vitest/LCOV |
| RNF-MAN-03 | La duplicación del código nuevo será inferior a 3 %. | SonarQube |
| RNF-MAN-04 | No se aceptarán bugs o vulnerabilidades nuevas de severidad bloqueante o crítica. | Quality Gate SonarQube |
| RNF-MAN-05 | El pipeline de build, pruebas, cobertura y análisis terminará en menos de 10 minutos. | GitHub Actions |
| RNF-MAN-06 | Las capas HTTP, negocio y persistencia no dependerán unas de otras en sentido inverso. | Revisión arquitectónica |
| RNF-POR-01 | La aplicación deberá ejecutarse localmente y en Linux x64 mediante Docker sin modificar código. | Docker local/VPS |
| RNF-POR-02 | Toda configuración específica del entorno se recibirá mediante variables. | `.env.example` y configuración |
| RNF-CON-01 | Cada ciclo usará un timestamp UTC común y generará una sola lectura por cada uno de los 21 canales. | Prueba del simulador |
| RNF-CON-02 | Reiniciar la aplicación conservará mediciones, relés, usuarios y fotografías. | Prueba de persistencia |
| RNF-CON-03 | Cada modificación efectiva y acceso relevante generará auditoría con actor y timestamp. | Pruebas de integración |

El catálogo contiene 35 requisitos y supera el mínimo académico de 20.
