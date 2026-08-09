# Prueba de carga JMeter

El plan ejecuta autenticación de un usuario `viewer` y carga concurrente sobre salud, últimas mediciones e historial. Los valores predeterminados son 10 usuarios, 10 segundos de rampa y 5 ciclos.

Copie `jmeter.example.properties` como `jmeter.properties`, introduzca las credenciales reales y ejecute:

```powershell
npm run test:jmeter
```

El comando utiliza modo CLI y genera `reports/jmeter/results.jtl` junto con el dashboard HTML. No ejecute carga intensa contra la VPS sin ajustar primero `threads` y `loops`; la prueba predeterminada está limitada para la VPS de 2 GB.
