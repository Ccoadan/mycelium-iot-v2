# Entregables académicos

Este directorio reúne las fuentes verificables del documento técnico. La colección Postman está excluida por decisión expresa de alcance y no forma parte de esta entrega.

| Entregable | Fuente o ubicación | Estado |
|---|---|---|
| Documento técnico | Archivos `01` a `10` de este directorio | Fuentes iniciales completas; pendiente consolidación final |
| Repositorio GitHub | <https://github.com/Ccoadan/mycelium-iot-v2> | Publicado |
| Reporte SonarQube | `sonar-project.properties` y GitHub Actions | Validado: Quality Gate aprobado, 0 bugs y 0 vulnerabilidades |
| Scripts Selenium | `tests/system/` | Validados como compuerta E2E aislada en GitHub Actions; evidencia conservada 30 días |
| Scripts JMeter | `tests/load/` | Validados contra la VPS: 310 muestras, 0 % de errores y todos los p95 aprobados |
| Pipeline GitHub Actions | `.github/workflows/ci-cd.yml` | Validado: calidad, Selenium y despliegue automático aprobados |
| Presentación, máximo 10 diapositivas | Se preparará con resultados finales | Pendiente |
| Aplicación pública | `deploy/` y VPS | Desplegada por HTTPS en <https://206-189-201-212.sslip.io> |

Los reportes generados (`coverage/` y `reports/`) se conservan como artefactos de GitHub Actions. Las conclusiones verificadas se trasladan al documento técnico; no se versionan credenciales ni resultados que las contengan.
