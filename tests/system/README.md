# Pruebas funcionales Selenium

El script `selenium-dashboard.mjs` automatiza tres recorridos en Chrome:

1. acceso público al dashboard, historial y última fotografía, comprobando que galería y CSV soliciten sesión;
2. acceso administrativo, carga de nueve bolsas, galería y controles habilitados, con cambio y restauración de un relé cuando se autoricen mutaciones;
3. acceso de solo lectura, apertura de una fotografía y descarga real de un CSV validado, con simulador y relés deshabilitados.

La aplicación y MongoDB deben estar activos y tener ambos usuarios sembrados. Las credenciales se reciben únicamente mediante variables de entorno:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:3000'
$env:E2E_ADMIN_USERNAME='admin'
$env:E2E_ADMIN_PASSWORD='contraseña-real-del-admin'
$env:E2E_VIEWER_USERNAME='viewer'
$env:E2E_VIEWER_PASSWORD='contraseña-real-del-viewer'
$env:E2E_ALLOW_MUTATIONS='false'
npm run test:selenium
```

`E2E_ALLOW_MUTATIONS` permanece desactivado por defecto. Solo debe habilitarse en un entorno aislado; la prueba restaura el relé a su estado inicial incluso cuando la comprobación intermedia falla.

Selenium Manager resuelve el controlador de Chrome. En `reports/selenium/` se guardan las capturas, el CSV descargado y `results.json`, con el resultado, duración y evidencia de cada recorrido. Si ocurre un fallo se añade `99-failure.png`.

GitHub Actions ejecuta estos recorridos antes del despliegue con MongoDB temporal, credenciales aleatorias, seis fotografías de muestra y un ciclo de 21 mediciones. El job no utiliza usuarios ni datos de producción y publica su carpeta de evidencia como artefacto durante 30 días.
