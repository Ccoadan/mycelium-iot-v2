# Prueba de carga JMeter

El plan ejecuta autenticación de un usuario `viewer` y carga concurrente sobre salud, últimas mediciones e historial. Los valores académicos son 10 usuarios, 10 segundos de rampa y 10 ciclos.

Copie `jmeter.example.properties` como `jmeter.properties`, introduzca las credenciales reales y ejecute:

```powershell
npm run test:jmeter
```

El comando utiliza modo CLI y genera `reports/jmeter/results.jtl` junto con el dashboard HTML. No ejecute carga intensa contra la VPS sin ajustar primero `threads` y `loops`; comience con un usuario y aumente de forma gradual hasta la prueba académica de 10 usuarios en la VPS de 1 GB con 2 GB de swap.

La ejecución final del 10 de agosto de 2026 contra la VPS produjo 310 muestras, 0 % de errores y 10.50 solicitudes por segundo. Los p95 fueron 357 ms para salud, 848 ms para últimas mediciones y 1,460 ms para historial.

## Ejecución manual en GitHub

El workflow `.github/workflows/jmeter-manual.yml` solo se inicia desde **Actions → Prueba de carga JMeter → Run workflow**. Exige confirmar explícitamente la VPS y permite seleccionar 1, 5 o 10 usuarios y ciclos. GitHub debe contener los secretos `JMETER_VIEWER_USERNAME` y `JMETER_VIEWER_PASSWORD`.

La ejecución descarga JMeter desde Apache, verifica SHA-512, prueba la URL pública, evalúa automáticamente los cuatro umbrales y conserva JTL, dashboard HTML y `thresholds.json` como artefacto durante 30 días. No forma parte del despliegue cotidiano y dos pruebas de carga nunca se ejecutan al mismo tiempo.

Evidencia remota aprobada: [1 usuario](https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31439032008) y [10 usuarios](https://github.com/Ccoadan/mycelium-iot-v2/actions/runs/31439172088).
