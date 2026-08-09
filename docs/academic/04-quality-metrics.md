# Fase 4 - Métricas de calidad

## Línea base automatizada - 9 de agosto de 2026

| Métrica | Resultado | Fuente |
|---|---:|---|
| Suites aprobadas | 16/16 | Vitest 3.2.6 |
| Pruebas aprobadas | 35/35 | Vitest 3.2.6 |
| Sentencias cubiertas | 83.44 % | Cobertura V8 |
| Ramas cubiertas | 78.64 % | Cobertura V8 |
| Funciones cubiertas | 92.30 % | Cobertura V8 |
| Líneas cubiertas | 83.44 % | Cobertura V8 |
| Vulnerabilidades de dependencias | 0 | `npm audit` |
| Vulnerabilidades de producción | 0 | `npm audit --omit=dev` |

La compuerta automatizada exige 80 % de sentencias y líneas, 75 % de ramas y 85 % de funciones. El reporte HTML se genera en `coverage/` y el JUnit XML en `reports/junit.xml`.

## Métricas pendientes de SonarQube

Complejidad ciclomática, duplicación, Maintainability Index equivalente, bugs, vulnerabilidades, smells y deuda técnica se incorporarán después de la primera ejecución en GitHub. No se consignarán valores estimados como si fueran mediciones.

## Registro inicial de defectos de calidad

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| CAL-001 | No existía medición ni umbral de cobertura. | Media | Corregido |
| CAL-002 | Vitest 2.1.9 tenía vulnerabilidades conocidas en herramientas de desarrollo. | Alta | Corregido con Vitest 3.2.6 |
| CAL-003 | Solo MongoDB estaba definido en Docker; la aplicación no era desplegable como unidad. | Alta | Corregido y validado localmente; pendiente VPS |
| CAL-004 | No existía pipeline CI/CD ni configuración SonarQube. | Alta | Configurado; pendiente primera ejecución GitHub |
| CAL-005 | El proyecto todavía no tenía repositorio Git. | Alta | Corregido; publicado en GitHub |

En esta línea base existen 5 hallazgos: 3 cerrados y 2 con corrección implementada pendiente de validación externa. No se detectó un defecto crítico de producción.

## Productividad

La productividad se calculará como tareas académicas aceptadas por hora-persona. El equipo debe proporcionar las horas reales empleadas; no se fabricará una cifra retrospectiva sin evidencia.
