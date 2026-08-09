# Fases 7 y 8 - SonarQube y CI/CD

## Análisis SonarQube

`sonar-project.properties` define `src` y `public` como fuentes, `tests` como pruebas y consume `coverage/lcov.info`. El código del navegador y los comandos CLI se analizan, aunque se excluyen del cálculo unitario de cobertura porque se verifican mediante Selenium o procedimientos operativos.

Al crear el proyecto en SonarQube Cloud se configurarán:

- secreto `SONAR_TOKEN`;
- variable `SONAR_PROJECT_KEY`;
- variable `SONAR_ORGANIZATION`.

El reporte final registrará bugs, vulnerabilidades, smells, cobertura, complejidad, duplicación y deuda técnica. Hasta ejecutar el análisis remoto, esos valores se mantienen como pendientes y no como ceros.

## Pipeline GitHub Actions

La primera ejecución remota del pipeline finalizó correctamente: <https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31330748354>.

`.github/workflows/ci-cd.yml` se activa en cada `push` y `pull_request` hacia `main`, además de permitir ejecución manual.

```text
npm ci
  -> npm audit de producción
  -> TypeScript estricto
  -> validación JavaScript frontend
  -> build
  -> 35 pruebas y cobertura
  -> SonarQube
  -> artefacto HTML/LCOV/JUnit
  -> despliegue VPS solo en main
```

El despliegue exige que la compuerta de calidad apruebe. Utiliza un usuario no privilegiado de la VPS y cuatro secretos de GitHub:

- `VPS_HOST`;
- `VPS_USER`;
- `VPS_SSH_PRIVATE_KEY`;
- `VPS_KNOWN_HOSTS`.

La clave de despliegue será diferente de la clave SSH personal. La VPS conservará `deploy/.env.production` fuera de Git y actualizará el repositorio con `git pull --ff-only`, evitando sobrescribir cambios inesperados.
