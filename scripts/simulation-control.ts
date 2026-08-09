import 'dotenv/config';

import { DASHBOARD_REQUEST_HEADER } from '../src/services/auth/cookie-authentication.js';

type Action = 'status' | 'start' | 'stop' | 'once' | 'interval';

const [rawAction, rawValue] = process.argv.slice(2);
const action = rawAction as Action | undefined;
const supportedActions: Action[] = ['status', 'start', 'stop', 'once', 'interval'];

if (!action || !supportedActions.includes(action)) {
  console.error('Uso: tsx scripts/simulation-control.ts <status|start|stop|once|interval> [segundos]');
  process.exit(1);
}

const host = process.env.HOST === '0.0.0.0' ? '127.0.0.1' : (process.env.HOST ?? '127.0.0.1');
const port = process.env.PORT ?? '3000';
const apiUrl = `http://${host}:${port}/api`;
const baseUrl = `${apiUrl}/simulation`;

let url = baseUrl;
let method = 'GET';
let body: string | undefined;

switch (action) {
  case 'start':
    url += '/start';
    method = 'POST';
    break;
  case 'stop':
    url += '/stop';
    method = 'POST';
    break;
  case 'once':
    url += '/run-once';
    method = 'POST';
    break;
  case 'interval': {
    const intervalSeconds = Number(rawValue);
    if (!Number.isInteger(intervalSeconds)) {
      console.error('Debe proporcionar un intervalo entero en segundos');
      process.exit(1);
    }
    url += '/config';
    method = 'PATCH';
    body = JSON.stringify({ intervalSeconds });
    break;
  }
  case 'status':
    break;
}

try {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('SEED_ADMIN_USERNAME y SEED_ADMIN_PASSWORD son obligatorios para el control CLI');
  }
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Requested-With': DASHBOARD_REQUEST_HEADER,
    },
    body: JSON.stringify({ username, password }),
  });
  if (!loginResponse.ok) {
    throw new Error('No se pudo autenticar el usuario administrador configurado en .env');
  }
  const sessionCookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
  if (!sessionCookie) throw new Error('La API no devolvió una cookie de sesión');

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Cookie: sessionCookie,
      'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exitCode = 1;
  } else {
    console.info(JSON.stringify(payload, null, 2));
  }
} catch (error) {
  console.error('No se pudo contactar la API local. Compruebe que `npm start` esté en ejecución.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
