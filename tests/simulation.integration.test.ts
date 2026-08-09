import { randomBytes } from 'node:crypto';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { AuditLog, Measurement } from '../src/models/index.js';
import { MongoSimulationRepository } from '../src/repositories/simulation-repository.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { SimulationService } from '../src/services/simulation/simulation-service.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

describe('SimulationService con MongoDB', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'simulation_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'simulation_test',
      serverSelectionTimeoutMs: 10_000,
    });
    const database = await connection.getDatabase();
    await seedDatabase(database, {
      admin: { username: 'simulation-admin', password: randomBytes(24).toString('base64url') },
      viewer: { username: 'simulation-viewer', password: randomBytes(24).toString('base64url') },
      bcryptRounds: 10,
    });
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('persiste 21 documentos por ciclo y controla inicio, intervalo y detención', async () => {
    const database = await connection.getDatabase();
    let clockValue = Date.parse('2026-08-08T16:00:00.000Z');
    const service = new SimulationService(
      new MongoSimulationRepository(connection),
      new SimulationEngine(() => 0.5),
      60,
      () => {
        const current = new Date(clockValue);
        clockValue += 60_000;
        return current;
      },
    );

    await service.runOnce({ username: 'test-operator' });
    await service.runOnce({ username: 'test-operator' });

    const measurements = database.collection<Measurement>(COLLECTIONS.measurements);
    expect(await measurements.countDocuments()).toBe(42);
    const cycles = await measurements
      .aggregate<{ _id: Date; count: number }>([
        { $group: { _id: '$timestamp', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    expect(cycles).toHaveLength(2);
    expect(cycles.every(({ count }) => count === 21)).toBe(true);

    const started = await service.start({ username: 'test-operator' });
    expect(started.running).toBe(true);
    expect(started.lastCycleMeasurements).toBe(21);
    const configured = await service.configureInterval(30, { username: 'test-operator' });
    expect(configured.intervalSeconds).toBe(30);
    const stopped = await service.stop({ username: 'test-operator' });
    expect(stopped.running).toBe(false);
    expect(await measurements.countDocuments()).toBe(63);

    const auditLogs = database.collection<AuditLog>(COLLECTIONS.auditLogs);
    expect(await auditLogs.countDocuments({ action: 'simulation.cycle_requested' })).toBe(2);
    expect(await auditLogs.countDocuments({ action: 'simulation.started' })).toBe(1);
    expect(await auditLogs.countDocuments({ action: 'simulation.interval_changed' })).toBe(1);
    expect(await auditLogs.countDocuments({ action: 'simulation.stopped' })).toBe(1);
  });
});
