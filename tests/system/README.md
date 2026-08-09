# Pruebas funcionales Selenium

El script `selenium-dashboard.mjs` automatiza dos recorridos en Chrome:

1. acceso administrativo, carga de nueve bolsas, historial y controles habilitados;
2. acceso de solo lectura, con simulador y relés deshabilitados.

La aplicación y MongoDB deben estar activos y tener ambos usuarios sembrados. Las credenciales se reciben únicamente mediante variables de entorno:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:3000'
$env:E2E_ADMIN_USERNAME='admin'
$env:E2E_ADMIN_PASSWORD='contraseña-real-del-admin'
$env:E2E_VIEWER_USERNAME='viewer'
$env:E2E_VIEWER_PASSWORD='contraseña-real-del-viewer'
npm run test:selenium
```

Selenium Manager resuelve el controlador de Chrome. Las capturas se escriben en `reports/selenium/`, carpeta ignorada por Git y destinada a evidencia de ejecución.
