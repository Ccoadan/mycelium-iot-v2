# Fases 7 y 8 - SonarQube y CI/CD

## Análisis SonarQube

`sonar-project.properties` define `src` y `public` como fuentes, `tests` como pruebas y consume `coverage/lcov.info`. El código del navegador y los comandos CLI se analizan, aunque se excluyen del cálculo unitario de cobertura porque se verifican mediante Selenium o procedimientos operativos.

El proyecto de SonarQube Cloud utiliza:

- secreto `SONAR_TOKEN`;
- variable `SONAR_PROJECT_KEY`;
- variable `SONAR_ORGANIZATION`.

El análisis posterior a la remediación obtuvo Quality Gate aprobado, 0 bugs, 0 vulnerabilidades, 0 hotspots, 29 code smells, 82.8 % de cobertura general y 0.5 % de duplicación. La deuda técnica calculada fue de 150 minutos; confiabilidad, seguridad y mantenibilidad obtuvieron calificación A.

## Pipeline GitHub Actions

La primera ejecución remota del pipeline finalizó correctamente: <https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31330748354>. La ejecución con SonarQube y las correcciones prioritarias también fue aprobada: <https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31331977476>.

`.github/workflows/ci-cd.yml` se activa en cada `push` y `pull_request` hacia `main`, además de permitir ejecución manual.

```text
npm ci
  -> npm audit de producción
  -> TypeScript estricto
  -> validación JavaScript frontend
  -> build
  -> 36 pruebas y cobertura
  -> SonarQube
  -> artefacto HTML/LCOV/JUnit
  -> MongoDB y aplicación E2E aislados
  -> Selenium: invitado, admin y viewer
  -> capturas, CSV y reporte JSON
  -> despliegue VPS solo en main
```

Selenium genera credenciales aleatorias en cada ejecución, importa seis fotos, crea 21 mediciones y valida la interfaz en Chrome headless. No usa la base ni las credenciales de producción. El despliegue exige que aprueben tanto la compuerta de calidad como el job E2E.

El CD utiliza un usuario no privilegiado de la VPS y cuatro secretos de GitHub:

- `VPS_HOST`;
- `VPS_USER`;
- `VPS_SSH_PRIVATE_KEY`;
- `VPS_KNOWN_HOSTS`.

La clave de despliegue es diferente de la clave SSH personal. La VPS conserva `deploy/.env.production` fuera de Git y actualiza el repositorio con `git pull --ff-only`, evitando sobrescribir cambios inesperados.
