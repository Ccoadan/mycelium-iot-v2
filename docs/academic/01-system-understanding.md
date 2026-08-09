# Fase 1 - Comprensión del sistema

## Propósito

Mycelium IoT V2 es una aplicación web para monitorear un módulo de cultivo de hongos. En el alcance universitario trabaja con datos simulados y fotografías históricas, sin contactar el ESP32 ni la ESP32-CAM originales.

## Arquitectura

```text
Navegador
  -> Caddy/HTTPS
    -> API y dashboard Hono/Node.js
      -> servicios de autenticación, consultas, control, fotos y simulación
        -> repositorios
          -> MongoDB
      -> almacenamiento local persistente de JPEG
```

La aplicación separa rutas HTTP, servicios de negocio, repositorios y persistencia. MongoDB almacena configuración, mediciones, usuarios, control, auditoría y metadatos fotográficos. Los bytes JPEG permanecen fuera de MongoDB.

## Tecnologías

- Node.js 20.19, TypeScript estricto y Hono.
- MongoDB 8 y controlador oficial para Node.js.
- HTML, CSS, JavaScript y SVG nativos para el dashboard.
- Vitest y `mongodb-memory-server` para pruebas.
- Selenium WebDriver para pruebas funcionales.
- Apache JMeter para carga.
- Docker Compose y Caddy para despliegue.
- GitHub Actions y SonarQube Cloud para CI/CD y análisis.

## Actores

| Actor | Responsabilidad |
|---|---|
| Administrador | Consulta datos, opera relés simulados y controla el simulador |
| Visualizador | Consulta dashboard, historial, fotografías y exportaciones sin modificar estado |
| Simulador IoT | Produce ciclos coherentes de 21 mediciones |
| Operador de despliegue | Administra la VPS, secretos, copias de seguridad y recuperación |

## Casos de uso principales

| ID | Caso de uso | Actor |
|---|---|---|
| UC-01 | Iniciar y cerrar sesión | Administrador, visualizador |
| UC-02 | Consultar estado de API, MongoDB y simulador | Ambos roles |
| UC-03 | Visualizar las últimas 21 mediciones | Ambos roles |
| UC-04 | Consultar historial filtrado y paginado | Ambos roles |
| UC-05 | Exportar historial CSV | Ambos roles |
| UC-06 | Consultar última fotografía y galería | Ambos roles |
| UC-07 | Encender o apagar un relé simulado | Administrador |
| UC-08 | Iniciar, detener o ejecutar el simulador | Administrador |
| UC-09 | Auditar accesos, exportaciones y modificaciones | Sistema |
| UC-10 | Desplegar una versión validada | Operador de despliegue |

## Módulos funcionales

Autenticación y autorización, monitoreo ambiental, monitoreo de nueve bolsas, historial, exportación, control de relés, simulador, fotografías, auditoría, salud operativa y administración de configuración.
