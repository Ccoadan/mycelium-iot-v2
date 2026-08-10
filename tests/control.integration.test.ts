import { randomBytes } from 'node:crypto';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { AuditLog, ControlState } from '../src/models/index.js';
import { ConnectionAuditRepository } from '../src/repositories/audit-repository.js';
import { ControlRepository } from '../src/repositories/control-repository.js';
import { UserRepository } from '../src/repositories/user-repository.js';
import { AuditService } from '../src/services/audit/audit-service.js';
import { AuthorizationError } from '../src/services/auth/auth-errors.js';
import type { AuthenticatedUser } from '../src/services/auth/auth-service.js';
import type { RequestAuthentication } from '../src/services/auth/cookie-authentication.js';
import { ControlService } from '../src/services/control/control-service.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

function fixedAuthentication(actor: AuthenticatedUser): RequestAuthentication {
  return {
    optionalUser: async () => actor,
    requireUser: async () => actor,
    requireAdmin: async () => {
      if (actor.role !== 'admin') throw new AuthorizationError('Requiere admin');
      return actor;
    },
    requireDashboardRequest: () => undefined,
  };
}

describe('control simulado de relés', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  let service: ControlService;

  const seedOptions = {
    admin: { username: 'control-admin', password: randomBytes(24).toString('base64url') },
    viewer: { username: 'control-viewer', password: randomBytes(24).toString('base64url') },
    bcryptRounds: 10,
  };
  const admin: AuthenticatedUser = {
    id: new ObjectId(), username: 'control-admin', role: 'admin', sessionVersion: 1,
  };
  const viewer: AuthenticatedUser = {
    id: new ObjectId(), username: 'control-viewer', role: 'viewer', sessionVersion: 1,
  };

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'control_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'control_test',
      serverSelectionTimeoutMs: 10_000,
    });
    await seedDatabase(await connection.getDatabase(), seedOptions);
    service = new ControlService(
      new ControlRepository(connection),
      new AuditService(new ConnectionAuditRepository(connection)),
      () => new Date('2026-08-09T15:30:00.000Z'),
    );
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('persiste cambios admin y registra una auditoría estructurada', async () => {
    const app = createApp({
      appEnv: 'test',
      database: connection,
      control: { service, authentication: fixedAuthentication(admin) },
    });

    const initialResponse = await app.request('/api/control');
    expect(initialResponse.status).toBe(200);
    expect(await initialResponse.json()).toMatchObject({
      control: {
        permissions: { canModify: true },
        actor: { username: 'control-admin', role: 'admin' },
        relays: [
          { key: 'relay1', name: 'Ventilador de entrada', enabled: false },
          { key: 'relay2', name: 'Ventilador de salida', enabled: false },
          { key: 'relay3', name: 'Iluminación de cámara', enabled: false },
          { key: 'relay4', name: 'Relé auxiliar 4', enabled: false },
        ],
      },
    });

    const updateResponse = await app.request('/api/control/relay1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(updateResponse.status).toBe(200);
    const updatePayload = (await updateResponse.json()) as {
      changed: boolean;
      control: { relays: ControlState['relays']; updatedBy: string };
    };
    expect(updatePayload).toMatchObject({ changed: true, control: { updatedBy: 'control-admin' } });
    expect(updatePayload.control.relays).toContainEqual(
      expect.objectContaining({ key: 'relay1', enabled: true }),
    );

    const database = await connection.getDatabase();
    const persisted = await database.collection<ControlState>(COLLECTIONS.controlState).findOne({ _id: 'current' });
    expect(persisted?.relays.find(({ key }) => key === 'relay1')?.enabled).toBe(true);
    expect(persisted?.updatedAt.toISOString()).toBe('2026-08-09T15:30:00.000Z');

    const audit = await database.collection<AuditLog>(COLLECTIONS.auditLogs).findOne({
      action: 'control.relay_changed',
      'details.relay': 'relay1',
    });
    expect(audit).toMatchObject({
      user: { username: 'control-admin', role: 'admin' },
      entity: 'controlState',
      entityId: 'current',
      details: { previousEnabled: false, enabled: true, source: 'dashboard' },
    });

    const repeatedResponse = await app.request('/api/control/relay1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(await repeatedResponse.json()).toMatchObject({ changed: false });
    expect(await database.collection<AuditLog>(COLLECTIONS.auditLogs).countDocuments({ action: 'control.relay_changed' })).toBe(1);
  });

  it('bloquea al viewer y valida la entrada sin alterar MongoDB', async () => {
    const app = createApp({
      appEnv: 'test',
      database: connection,
      control: { service, authentication: fixedAuthentication(viewer) },
    });

    const forbidden = await app.request('/api/control/relay2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });

    const invalidRelay = await app.request('/api/control/relay8', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(invalidRelay.status).toBe(403);

    const invalidState = await app.request('/api/control/relay2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 1 }),
    });
    expect(invalidState.status).toBe(403);

    const state = await service.getControl(viewer);
    expect(state.permissions.canModify).toBe(false);
    expect(state.relays.find(({ key }) => key === 'relay2')?.enabled).toBe(false);
  });

  it('valida rele y estado despues de autorizar al admin', async () => {
    const app = createApp({
      appEnv: 'test',
      database: connection,
      control: { service, authentication: fixedAuthentication(admin) },
    });

    const invalidRelay = await app.request('/api/control/relay8', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(invalidRelay.status).toBe(400);

    const invalidState = await app.request('/api/control/relay2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 1 }),
    });
    expect(invalidState.status).toBe(400);
  });

  it('mantiene roles en MongoDB y el seed preserva estados existentes', async () => {
    const users = new UserRepository(connection);
    await expect(users.findByUsername('control-viewer')).resolves.toMatchObject({
      username: 'control-viewer',
      role: 'viewer',
    });

    await seedDatabase(await connection.getDatabase(), seedOptions);
    const state = await service.getControl(admin);
    expect(state.relays.find(({ key }) => key === 'relay1')?.enabled).toBe(true);
  });
});
