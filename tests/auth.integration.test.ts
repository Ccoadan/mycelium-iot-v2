import { randomBytes } from 'node:crypto';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { AuditLog } from '../src/models/index.js';
import { ConnectionAuditRepository } from '../src/repositories/audit-repository.js';
import { ControlRepository } from '../src/repositories/control-repository.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import { AuditService } from '../src/services/audit/audit-service.js';
import { AuthService } from '../src/services/auth/auth-service.js';
import { InMemoryLoginAttemptLimiter } from '../src/services/auth/login-attempt-limiter.js';
import {
  CookieAuthentication,
  DASHBOARD_REQUEST_HEADER,
} from '../src/services/auth/cookie-authentication.js';
import { ControlService } from '../src/services/control/control-service.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('La respuesta no incluyó Set-Cookie');
  return setCookie.split(';', 1)[0] ?? '';
}

describe('autenticación y autorización', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  let app: ReturnType<typeof createApp>;
  const adminPassword = randomBytes(24).toString('base64url');
  const viewerPassword = randomBytes(24).toString('base64url');

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'auth_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'auth_test',
      serverSelectionTimeoutMs: 10_000,
    });
    await seedDatabase(await connection.getDatabase(), {
      admin: { username: 'auth-admin', password: adminPassword },
      viewer: { username: 'auth-viewer', password: viewerPassword },
      bcryptRounds: 10,
    });

    const audit = new AuditService(new ConnectionAuditRepository(connection));
    const authentication = new CookieAuthentication(
      new AuthService(
        new UserRepository(connection),
        audit,
        'test-secret-with-more-than-thirty-two-characters',
        3_600,
      ),
      { name: 'test_session', maxAgeSeconds: 3_600, secure: false },
    );
    app = createApp({
      appEnv: 'test',
      database: connection,
      auth: {
        authentication,
        loginAttemptLimiter: new InMemoryLoginAttemptLimiter({
          maxFailures: 2,
          windowSeconds: 300,
          blockSeconds: 120,
        }),
      },
      control: {
        service: new ControlService(new ControlRepository(connection), audit),
        authentication,
      },
    });
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('rechaza credenciales incorrectas sin crear una cookie', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ username: 'auth-admin', password: 'incorrecta' }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    const database = await connection.getDatabase();
    expect(await database.collection<AuditLog>(COLLECTIONS.auditLogs).countDocuments({ action: 'auth.login_failed' })).toBe(1);
  });

  it('crea una cookie HttpOnly, identifica al admin y revoca la sesión al salir', async () => {
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ username: 'auth-admin', password: adminPassword }),
    });
    expect(login.status).toBe(200);
    const loginPayload = await login.json();
    expect(loginPayload).toMatchObject({
      authenticated: true,
      user: { username: 'auth-admin', role: 'admin' },
    });
    expect(loginPayload).not.toHaveProperty('token');
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const cookie = cookieFrom(login);

    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { username: 'auth-admin', role: 'admin' } });

    const missingCsrfHeader = await app.request('/api/control/relay1', {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(missingCsrfHeader.status).toBe(403);

    const relayUpdate = await app.request('/api/control/relay1', {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ enabled: true }),
    });
    expect(relayUpdate.status).toBe(200);

    const logout = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Requested-With': DASHBOARD_REQUEST_HEADER },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

    const revoked = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
    expect(revoked.status).toBe(401);

    const publicControl = await app.request('/api/control', { headers: { Cookie: cookie } });
    expect(publicControl.status).toBe(200);
    expect(await publicControl.json()).toMatchObject({
      control: { actor: null, permissions: { canModify: false }, updatedBy: 'Identidad protegida' },
    });

    const database = await connection.getDatabase();
    expect(await database.collection<AuditLog>(COLLECTIONS.auditLogs).countDocuments({ action: 'auth.login' })).toBe(1);
    expect(await database.collection<AuditLog>(COLLECTIONS.auditLogs).countDocuments({ action: 'auth.logout' })).toBe(1);
  });

  it('permite lectura al viewer pero bloquea acciones administrativas', async () => {
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ username: 'auth-viewer', password: viewerPassword }),
    });
    const cookie = cookieFrom(login);

    const read = await app.request('/api/control', { headers: { Cookie: cookie } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      control: {
        actor: { username: 'auth-viewer', role: 'viewer' },
        permissions: { canModify: false },
      },
    });

    const update = await app.request('/api/control/relay2', {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ enabled: true }),
    });
    expect(update.status).toBe(403);
    expect(await update.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('publica el estado de control y exige admin para modificarlo', async () => {
    const response = await app.request('/api/control');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      control: { actor: null, permissions: { canModify: false }, updatedBy: 'Identidad protegida' },
    });

    const update = await app.request('/api/control/relay1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': DASHBOARD_REQUEST_HEADER },
      body: JSON.stringify({ enabled: true }),
    });
    expect(update.status).toBe(401);
    expect(await update.json()).toMatchObject({ error: { code: 'AUTHENTICATION_REQUIRED' } });
  });

  it('limita temporalmente los intentos de acceso fallidos', async () => {
    const request = () => app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': DASHBOARD_REQUEST_HEADER,
      },
      body: JSON.stringify({ username: 'blocked-user', password: 'incorrecta' }),
    });

    expect((await request()).status).toBe(401);
    expect((await request()).status).toBe(401);
    const blocked = await request();

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('120');
    expect(blocked.headers.get('set-cookie')).toBeNull();
    expect(await blocked.json()).toMatchObject({ error: { code: 'LOGIN_RATE_LIMITED' } });
  });
});
