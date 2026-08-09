# Fase 4 - Métricas de calidad

## Línea base automatizada - 9 de agosto de 2026

| Métrica | Resultado | Fuente |
|---|---:|---|
| Suites aprobadas | 16/16 | Vitest 3.2.6 |
| Pruebas aprobadas | 35/35 | Vitest 3.2.6 |
| Sentencias cubiertas | 83.51 % | Cobertura V8 |
| Ramas cubiertas | 78.81 % | Cobertura V8 |
| Funciones cubiertas | 92.45 % | Cobertura V8 |
| Líneas cubiertas | 83.51 % | Cobertura V8 |
| Vulnerabilidades de dependencias | 0 | `npm audit` |
| Vulnerabilidades de producción | 0 | `npm audit --omit=dev` |

La compuerta automatizada exige 80 % de sentencias y líneas, 75 % de ramas y 85 % de funciones. El reporte HTML se genera en `coverage/` y el JUnit XML en `reports/junit.xml`.

## Línea base SonarQube Cloud

Análisis validado mediante GitHub Actions el 9 de agosto de 2026.

| Métrica | Resultado |
|---|---:|
| Quality Gate | Aprobado |
| Líneas de código | 5,910 |
| Cobertura general | 82.8 % |
| Cobertura de líneas | 83.5 % |
| Cobertura de ramas | 78.8 % |
| Duplicación | 0.5 % |
| Bugs | 0 |
| Vulnerabilidades | 0 |
| Hotspots de seguridad | 0 |
| Code smells | 29 |
| Complejidad ciclomática | 786 |
| Complejidad cognitiva | 477 |
| Deuda técnica | 150 minutos |
| Confiabilidad | A |
| Seguridad | A |
| Mantenibilidad | A |

Las 29 incidencias restantes son mantenibilidad no bloqueante: 21 mayores y 8 menores. Se incorporan al plan de mejora y no representan bugs ni vulnerabilidades abiertas.

## Registro inicial de defectos de calidad

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| CAL-001 | No existía medición ni umbral de cobertura. | Media | Corregido |
| CAL-002 | Vitest 2.1.9 tenía vulnerabilidades conocidas en herramientas de desarrollo. | Alta | Corregido con Vitest 3.2.6 |
| CAL-003 | Solo MongoDB estaba definido en Docker; la aplicación no era desplegable como unidad. | Alta | Corregido y validado localmente; pendiente VPS |
| CAL-004 | No existía pipeline CI/CD ni configuración SonarQube. | Alta | Corregido y validado en GitHub y SonarQube Cloud |
| CAL-005 | El proyecto todavía no tenía repositorio Git. | Alta | Corregido; publicado en GitHub |

En esta línea base existen 5 hallazgos: 4 cerrados y 1 con corrección implementada pendiente de despliegue en la VPS. No se detectó un defecto crítico de producción.

## Productividad

La productividad se calculará como tareas académicas aceptadas por hora-persona. El equipo debe proporcionar las horas reales empleadas; no se fabricará una cifra retrospectiva sin evidencia.
