# Referencias legacy (solo lectura)

Los respaldos originales no se copiaron ni modificaron. Permanecen fuera de este proyecto:

- `C:\Users\Usuario\Desktop\Base de Datos\respaldo_sensores_20260803.tar.gz`
  - SHA-256: `8E76BD21F2FF1E1723AB1A3808616986FAA3EBCB12215FB3000D54DD4831AB57`
- `C:\Users\Usuario\Desktop\Base de Datos\respaldo_bd_20260803.sql`
  - SHA-256: `F92C5E320B59519F91702292EF81217958C709543B28F5F2091970071367CC87`

Comprobación estructural realizada el 7 de agosto de 2026:

- 586 entradas en el archivo comprimido, entre ellas 538 fotografías JPG y nueve imágenes de bolsas.
- Se localizaron los archivos funcionales de referencia descritos en la especificación.
- El SQL contiene `auditoria`, `control`, `datos`, `sensor_config`, `usuarios` y `versiones`.
- `versiones` no forma parte del modelo V2 por decisión explícita del proyecto.

Este directorio es únicamente un registro de procedencia. No debe recibir copias masivas del sistema PHP ni secretos del respaldo.

Para la Fase 8 se extrajeron seis JPEG representativos hacia `public/photos/sample`. La operación fue selectiva, verificó la firma de los archivos y no modificó el respaldo. No se trasladó código PHP ni se expuso ninguna credencial legacy.
