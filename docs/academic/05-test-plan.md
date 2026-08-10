# Fases 5 y 6 - Plan de pruebas

## Niveles

| Nivel | Alcance | Estado |
|---|---|---|
| Unitarias | Motor del simulador, límites, JPEG, almacenamiento y fixtures | Aprobado |
| Integración | MongoDB, autenticación, control, mediciones, fotos, exportación y seed | Aprobado |
| Sistema | Aplicación completa, MongoDB, proxy y persistencia | Pendiente ejecución en Docker/VPS |
| Aceptación | Flujos invitado/admin/viewer y criterios RNF seleccionados | Pendiente ejecución contra URL pública |
| Funcionales automáticas | Tres recorridos Selenium en Chrome contra un entorno aislado | Integrado como compuerta previa al despliegue |
| Carga | Login viewer, salud, últimas mediciones e historial | JMX implementado |

## Casos de aceptación

| ID | Resultado esperado | Automatización |
|---|---|---|
| PA-00 | Un invitado visualiza dashboard, historial, relés en lectura y última foto sin iniciar sesión | Selenium/API |
| PA-01 | Admin inicia sesión y visualiza nueve bolsas | Selenium |
| PA-02 | Admin dispone de control de simulador y relés | Selenium |
| PA-03 | Viewer inicia sesión y no puede modificar controles | Selenium |
| PA-03A | Invitado no accede a galería completa, CSV ni operaciones modificadoras | Selenium/API |
| PA-04 | Historial responde y presenta resultados o estado vacío válido | Selenium/API |
| PA-05 | Reiniciar contenedores conserva datos | Procedimiento Docker |
| PA-06 | La URL pública responde mediante HTTP/HTTPS según la etapa | Sistema |
| PA-07 | Diez usuarios cumplen los umbrales de rendimiento | JMeter |

## Criterio de salida

La entrega es aceptable cuando `npm run verify:ci` aprueba, SonarQube no presenta incidencias críticas nuevas, Selenium aprueba invitado y ambos roles, JMeter mantiene menos de 1 % de error y el despliegue conserva MongoDB y fotografías después de reiniciar.

La colección Postman no forma parte del alcance acordado.
