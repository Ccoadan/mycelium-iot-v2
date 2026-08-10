# Fase 9 - Resultados de rendimiento

## Entorno y carga

La prueba se ejecutó el 10 de agosto de 2026 desde una laptop en Lima contra la aplicación pública `https://206-189-201-212.sslip.io`. Se utilizó Apache JMeter 5.6.3 sobre Java 21. La VPS dispone de 1 GB de RAM, 2 GB de swap y ejecuta aplicación, MongoDB y Caddy mediante Docker Compose.

El escenario final utilizó 10 usuarios, 10 segundos de rampa y 10 ciclos. Cada usuario inició sesión una vez como `viewer` y consultó repetidamente salud, últimas mediciones e historial de 24 horas. El resultado contiene 310 muestras.

## Resultados

| Operación | Muestras | Promedio | p95 | Máximo | Errores |
|---|---:|---:|---:|---:|---:|
| Salud | 100 | 178 ms | 357 ms | 459 ms | 0 % |
| Últimas mediciones | 100 | 319 ms | 848 ms | 2,531 ms | 0 % |
| Historial de 24 horas | 100 | 716 ms | 1,460 ms | 1,568 ms | 0 % |
| Login viewer | 10 | 1,757 ms | 3,704 ms | 3,704 ms | 0 % |
| Total | 310 | 448 ms | 1,388 ms | 3,704 ms | 0 % |

El rendimiento agregado fue de 10.50 solicitudes por segundo. Los cuatro criterios de salida quedaron aprobados:

- tasa de errores inferior al 1 %: resultado 0 %;
- salud con p95 inferior a 500 ms: resultado 357 ms;
- últimas mediciones con p95 inferior a 2 segundos: resultado 848 ms;
- historial con p95 inferior a 2 segundos: resultado 1,460 ms.

## Hallazgo y mejora aplicada

La primera ejecución estable no cumplió el objetivo de últimas mediciones: alcanzó un p95 de 4,511 ms. La investigación mostró consultas idénticas concurrentes y una ordenación que no seguía el índice compuesto. Se alineó la consulta con el índice `sensorId + type + timestamp`, se combinaron solicitudes simultáneas y se añadió un caché de 5 segundos, inferior al refresco del dashboard de 10 segundos. La comprobación de MongoDB de `/api/health` también combina solicitudes durante 2 segundos.

Las optimizaciones tienen pruebas automáticas y fueron desplegadas únicamente después de aprobar calidad, Selenium y CI/CD. El JTL y el dashboard HTML finales se generaron en `reports/jmeter/results-final-10-users-10-cycles.jtl` y `reports/jmeter/html-final-10-users-10-cycles/`; esas carpetas se excluyen de Git y deben conservarse como evidencia o artefacto.

## Validación remota en GitHub Actions

El workflow manual fue comprobado el 10 de agosto de 2026 con dos ejecuciones:

- [prueba inicial de 1 usuario y 1 ciclo](https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31439032008), aprobada;
- [prueba académica de 10 usuarios y 10 ciclos](https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31439172088), aprobada.

En ambas aprobaron individualmente la verificación de credenciales, descarga con SHA-512, carga controlada y validación automática de umbrales. GitHub publicó `evidencia-jmeter-1` y `evidencia-jmeter-2`, con JTL, dashboard HTML y `thresholds.json`, conservados durante 30 días.
