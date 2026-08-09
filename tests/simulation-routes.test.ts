import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { Measurement } from '../src/models/index.js';
import type { SimulationPersistence } from '../src/repositories/simulation-repository.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { SimulationService } from '../src/services/simulation/simulation-service.js';
import { createSensorFixtures } from '../src/services/seed/sensor-fixtures.js';

function createSimulationFixture(controlEnabled: boolean): {
  app: ReturnType<typeof createApp>;
  inserted: Measurement[];
} {
  const inserted: Measurement[] = [];
  const persistence: SimulationPersistence = {
    getActiveSensors: async () => createSensorFixtures(),
    getLatestMeasurements: async () => [],
    insertMeasurements: async (measurements) => {
      inserted.push(...measurements);
    },
    recordAudit: async () => undefined,
  };
  const service = new SimulationService(persistence, new SimulationEngine(() => 0.5), 10);
  const app = createApp({
    appEnv: 'test',
    database: {
      databaseName: 'simulation_route_test',
      checkHealth: async () => ({ available: true, latencyMs: 1 }),
    },
    simulation: { service, controlEnabled },
  });
  return { app, inserted };
}

describe('API local del simulador', () => {
  it('ejecuta un ciclo completo y rechaza intervalos inválidos', async () => {
    const { app, inserted } = createSimulationFixture(true);

    const cycleResponse = await app.request('/api/simulation/run-once', { method: 'POST' });
    expect(cycleResponse.status).toBe(201);
    expect(inserted).toHaveLength(21);

    const invalidResponse = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalSeconds: 0 }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('bloquea controles modificadores cuando están deshabilitados', async () => {
    const { app, inserted } = createSimulationFixture(false);
    const response = await app.request('/api/simulation/start', { method: 'POST' });

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
    expect(await response.json()).toMatchObject({ error: { code: 'SIMULATION_CONTROL_DISABLED' } });
  });

  it('rechaza JSON mal formado o con un tipo de contenido incorrecto', async () => {
    const { app } = createSimulationFixture(true);

    const wrongMediaType = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ intervalSeconds: 10 }),
    });
    expect(wrongMediaType.status).toBe(415);
    expect(await wrongMediaType.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });

    const malformed = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });
});
