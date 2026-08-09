# Fase 10 - Plan de mejora

| Prioridad | Mejora | Estado | Evidencia de cierre |
|---|---|---|---|
| P0 | Crear repositorio GitHub sin secretos y ejecutar CI/CD. | Completado | Pipeline verde y URL del repositorio |
| P0 | Desplegar aplicación, MongoDB y Caddy en la VPS. | Pendiente | URL pública y contenedores saludables |
| P0 | Ejecutar SonarQube y resolver incidencias críticas. | Completado | Quality Gate aprobado, 0 bugs y 0 vulnerabilidades |
| P1 | Ejecutar Selenium y JMeter contra la VPS. | Pendiente | Capturas, JTL y dashboard HTML |
| P1 | Reducir los 29 code smells no bloqueantes reportados por SonarQube. | Pendiente | Comparación de métricas entre análisis |
| P1 | Añadir pruebas unitarias de configuración y arranque para reducir líneas sin cobertura. | Pendiente | Cobertura y nuevas pruebas |
| P1 | Automatizar respaldos de MongoDB y fotografías, con restauración comprobada. | Pendiente | Registro de backup/restore |
| P2 | Persistir el limitador de login si se despliegan varias instancias. | Futuro | Prueba multiinstancia |
| P2 | Separar fotografías en almacenamiento de objetos si aumenta el volumen. | Futuro | Adaptador de almacenamiento y migración |
| P2 | Añadir telemetría y alertas externas de disponibilidad. | Futuro | Dashboard y alerta de prueba |

Las correcciones P0 son necesarias para la entrega. Las P1 fortalecen la evidencia académica. Las P2 representan evolución posterior y no bloquean la demostración simulada.
