import { randomBytes } from 'node:crypto';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { AuditLog, User } from '../src/models/index.js';
import { ConnectionAuditRepository } from '../src/repositories/audit-repository.js';
import { MeasurementRepository } from '../src/repositories/measurement-repository.js';
import { AuditService } from '../src/services/audit/audit-service.js';
import { AuthenticationRequiredError, AuthorizationError } from '../src/services/auth/auth-errors.js';
import type { AuthenticatedUser } from '../src/services/auth/auth-service.js';
import type { RequestAuthentication } from '../src/services/auth/cookie-authentication.js';
import { CsvExportService } from '../src/services/export/csv-export-service.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { SimulationService } from '../src/services/simulation/simulation-service.js';
import { MongoSimulationRepository } from '../src/repositories/simulation-repository.js';

function authenticationFor(user: AuthenticatedUser | null): RequestAuthentication {
  return {
    optionalUser: async () => user,
    requireUser: async () => {
      if (!user) throw new AuthenticationRequiredError('Debe iniciar sesión');
      return user;
    },
    requireAdmin: async () => {
      if (!user) throw new AuthenticationRequiredError('Debe iniciar sesión');
      if (user.role !== 'admin') throw new AuthorizationError('Requiere admin');
      return user;
    },
    requireDashboardRequest: () => undefined,
  };
}

describe('exportación CSV', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  let service: CsvExportService;
  let viewer: AuthenticatedUser;

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'export_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'export_test',
      serverSelectionTimeoutMs: 10_000,
    });
    const database = await connection.getDatabase();
    await seedDatabase(database, {
      admin: { username: 'export-admin', password: randomBytes(24).toString('base64url') },
      viewer: { username: 'export-viewer', password: randomBytes(24).toString('base64url') },
      bcryptRounds: 10,
    });

    let clockValue = Date.parse('2026-08-08T18:00:00.000Z');
    const simulator = new SimulationService(
      new MongoSimulationRepository(connection),
      new SimulationEngine(() => 0.5),
      10,
      () => {
        const current = new Date(clockValue);
        clockValue += 10_000;
        return current;
      },
    );
    await simulator.runOnce({ username: 'export-test' });
    await simulator.runOnce({ username: 'export-test' });
    await simulator.runOnce({ username: 'export-test' });

    const viewerDocument = await database.collection<User>(COLLECTIONS.users).findOne({ username: 'export-viewer' });
    if (!viewerDocument?._id) throw new Error('No se creó el viewer de prueba');
    viewer = {
      id: viewerDocument._id,
      username: viewerDocument.username,
      role: viewerDocument.role,
      sessionVersion: viewerDocument.sessionVersion,
    };
    service = new CsvExportService(
      new MeasurementRepository(connection),
      new AuditService(new ConnectionAuditRepository(connection)),
      () => new Date('2026-08-08T18:01:00.000Z'),
    );
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('genera un archivo válido, filtrado y compatible con Excel para viewer', async () => {
    const app = createApp({
      appEnv: 'test',
      database: connection,
      exportCsv: { service, authentication: authenticationFor(viewer) },
    });
    const response = await app.request(
      '/api/export/csv?from=2026-08-08T17:59:00.000Z&to=2026-08-08T18:01:00.000Z&type=temperature_bag&sensorId=1&bag=1',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('mycelium_measurements_2026-08-08_2026-08-08.csv');
    expect(response.headers.get('x-export-count')).toBe('3');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv.startsWith('timestamp_utc,timestamp_lima')).toBe(true);
    const rows = csv.trim().split('\r\n');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('"2026-08-08T18:00:00.000Z"');
    expect(rows[1]).toContain('"2026-08-08 13:00:00"');
    expect(rows.every((row) => !row.includes('undefined'))).toBe(true);

    const database = await connection.getDatabase();
    const audit = await database.collection<AuditLog>(COLLECTIONS.auditLogs).findOne({ action: 'export.csv_generated' });
    expect(audit).toMatchObject({
      user: { username: 'export-viewer', role: 'viewer' },
      entity: 'measurements',
      details: { type: 'temperature_bag', sensorId: 1, bag: 1, rows: 3 },
    });
  });

  it('valida filtros y exige autenticación', async () => {
    const authenticatedApp = createApp({
      appEnv: 'test',
      database: connection,
      exportCsv: { service, authentication: authenticationFor(viewer) },
    });
    const invalid = await authenticatedApp.request('/api/export/csv?type=co2_environment&bag=1');
    expect(invalid.status).toBe(400);

    const anonymousApp = createApp({
      appEnv: 'test',
      database: connection,
      exportCsv: { service, authentication: authenticationFor(null) },
    });
    const unauthorized = await anonymousApp.request('/api/export/csv');
    expect(unauthorized.status).toBe(401);
  });
});
