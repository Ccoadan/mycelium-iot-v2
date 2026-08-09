# Despliegue en VPS

La configuración está ajustada para la VPS académica de 1 GB de RAM con 2 GB de swap. MongoDB, la aplicación y Caddy tienen límites de memoria explícitos; el puerto de MongoDB no se publica en el host.

Esta configuración ejecuta Caddy, la aplicación, una inicialización idempotente y MongoDB sin publicar el puerto de la base.

## Preparación del archivo secreto

En la VPS:

```bash
cp deploy/.env.production.example deploy/.env.production
```

Genere secretos hexadecimales con `openssl rand -hex 24` para las dos claves MongoDB y `openssl rand -hex 32` para `JWT_SECRET`. Sustituya también las contraseñas admin/viewer y la IP o dominio. `deploy/.env.production` está ignorado por Git.

## Inicio

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml up -d --build
docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml ps
```

Con una IP utilice `SITE_ADDRESS=http://IP_PUBLICA`. Cuando exista un dominio apuntando a la VPS, utilice solo el dominio y Caddy solicitará HTTPS automáticamente.

Los volúmenes `mongodb_data`, `photo_data`, `caddy_data` y `caddy_config` son persistentes. No ejecute `down --volumes` en producción.

Las credenciales de MongoDB solo inicializan un volumen vacío. Si se cambian después, también deberá actualizarse el usuario dentro de MongoDB; cambiar únicamente el archivo `.env.production` no modifica una base ya creada.
