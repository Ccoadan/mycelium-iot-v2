import { randomBytes } from 'node:crypto';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import { MeasurementRepository } from '../src/repositories/measurement-repository.js';
import { MongoSimulationRepository } from '../src/repositories/simulation-repository.js';
import { MeasurementQueryService } from '../src/services/measurements/measurement-query-service.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { SimulationService } from '../src/services/simulation/simulation-service.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

describe('consultas del dashboard con MongoDB', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  let queryService: MeasurementQueryService;

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'dashboard_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'dashboard_test',
      serverSelectionTimeoutMs: 10_000,
    });
    const database = await connection.getDatabase();
    await seedDatabase(database, {
      admin: { username: 'dashboard-admin', password: randomBytes(24).toString('base64url') },
      viewer: { username: 'dashboard-viewer', password: randomBytes(24).toString('base64url') },
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
    await simulator.runOnce({ username: 'dashboard-test' });
    await simulator.runOnce({ username: 'dashboard-test' });

    queryService = new MeasurementQueryService(
      new MeasurementRepository(connection),
      60,
      () => new Date('2026-08-08T18:00:20.000Z'),
    );
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('devuelve el dato más reciente para los 21 sensores', async () => {
    const latest = await queryService.getLatest();

    expect(latest.measurements).toHaveLength(21);
    expect(latest.summary).toEqual({ configured: 21, active: 21, reporting: 21, stale: 0 });
    expect(latest.measurements.every(({ status }) => status === 'online')).toBe(true);
    expect(latest.measurements.every(({ timestamp }) => timestamp === '2026-08-08T18:00:10.000Z')).toBe(true);
    expect(latest.measurements.filter(({ type, unit }) => type === 'humidity_bag' && unit === '%')).toHaveLength(9);
  });

  it('devuelve historial ascendente y valida filtros HTTP', async () => {
    const history = await queryService.getHistory({
      type: 'temperature_bag',
      sensorId: 1,
      bag: 1,
      hours: 24,
      page: 1,
      pageSize: 500,
      responseOrder: 'asc',
    });
    expect(history.count).toBe(2);
    expect(history.pagination).toEqual({ page: 1, pageSize: 500, total: 2, totalPages: 1 });
    expect(history.measurements.map(({ timestamp }) => timestamp)).toEqual([
      '2026-08-08T18:00:00.000Z',
      '2026-08-08T18:00:10.000Z',
    ]);

    const app = createApp({
      appEnv: 'test',
      database: connection,
      measurements: { service: queryService },
    });
    const latestResponse = await app.request('/api/measurements/latest');
    expect(latestResponse.status).toBe(200);

    const paginatedResponse = await app.request(
      '/api/measurements/history?from=2026-08-08T17:59:00.000Z&to=2026-08-08T18:01:00.000Z&page=1&pageSize=10&sort=desc',
    );
    expect(paginatedResponse.status).toBe(200);
    const paginated = await paginatedResponse.json();
    expect(paginated).toMatchObject({
      count: 10,
      pagination: { page: 1, pageSize: 10, total: 42, totalPages: 5 },
    });
    expect(paginated.measurements).toHaveLength(10);

    const invalidResponse = await app.request('/api/measurements/history?type=invalid');
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const invalidRange = await app.request(
      '/api/measurements/history?from=2026-08-09T00:00:00.000Z&to=2026-08-08T00:00:00.000Z',
    );
    expect(invalidRange.status).toBe(400);

    const incompatibleFilters = await app.request(
      '/api/measurements/history?type=co2_environment&bag=1',
    );
    expect(incompatibleFilters.status).toBe(400);
  });
});
