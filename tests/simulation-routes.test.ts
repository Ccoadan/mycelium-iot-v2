import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import type { Measurement } from '../src/models/index.js';
import type { SimulationPersistence } from '../src/repositories/simulation-repository.js';
import { AuthenticationRequiredError, AuthorizationError } from '../src/services/auth/auth-errors.js';
import type { AuthenticatedUser } from '../src/services/auth/auth-service.js';
import {
  DASHBOARD_REQUEST_HEADER,
  type RequestAuthentication,
} from '../src/services/auth/cookie-authentication.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { SimulationService } from '../src/services/simulation/simulation-service.js';
import { createSensorFixtures } from '../src/services/seed/sensor-fixtures.js';

const admin: AuthenticatedUser = {
  id: new ObjectId(), username: 'simulation-admin', role: 'admin', sessionVersion: 1,
};
const viewer: AuthenticatedUser = {
  id: new ObjectId(), username: 'simulation-viewer', role: 'viewer', sessionVersion: 1,
};
const dashboardHeaders = { 'X-Requested-With': DASHBOARD_REQUEST_HEADER };

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
    requireDashboardRequest: (context) => {
      if (context.req.header('X-Requested-With') !== DASHBOARD_REQUEST_HEADER) {
        throw new AuthorizationError('La solicitud no procede del dashboard');
      }
    },
  };
}

function createSimulationFixture(
  controlEnabled: boolean,
  user: AuthenticatedUser | null = admin,
): {
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
    simulation: { service, controlEnabled, authentication: authenticationFor(user) },
  });
  return { app, inserted };
}

describe('API del simulador con lectura pública', () => {
  it('publica el estado y mantiene las mutaciones protegidas por rol', async () => {
    const anonymous = createSimulationFixture(true, null);
    expect((await anonymous.app.request('/api/simulation')).status).toBe(200);

    const unauthorized = await anonymous.app.request('/api/simulation/run-once', {
      method: 'POST', headers: dashboardHeaders,
    });
    expect(unauthorized.status).toBe(401);
    expect(anonymous.inserted).toHaveLength(0);

    const readOnly = createSimulationFixture(true, viewer);
    const forbidden = await readOnly.app.request('/api/simulation/run-once', {
      method: 'POST', headers: dashboardHeaders,
    });
    expect(forbidden.status).toBe(403);
    expect(readOnly.inserted).toHaveLength(0);

    const adminWithoutDashboardHeader = createSimulationFixture(true, admin);
    const rejectedDashboardOrigin = await adminWithoutDashboardHeader.app.request('/api/simulation/run-once', {
      method: 'POST',
    });
    expect(rejectedDashboardOrigin.status).toBe(403);
    expect(adminWithoutDashboardHeader.inserted).toHaveLength(0);
  });

  it('ejecuta un ciclo admin y rechaza intervalos inválidos', async () => {
    const { app, inserted } = createSimulationFixture(true);

    const cycleResponse = await app.request('/api/simulation/run-once', {
      method: 'POST', headers: dashboardHeaders,
    });
    expect(cycleResponse.status).toBe(201);
    expect(inserted).toHaveLength(21);

    const invalidResponse = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { ...dashboardHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalSeconds: 0 }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('bloquea controles modificadores cuando están deshabilitados', async () => {
    const { app, inserted } = createSimulationFixture(false);
    const response = await app.request('/api/simulation/start', {
      method: 'POST', headers: dashboardHeaders,
    });

    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
    expect(await response.json()).toMatchObject({ error: { code: 'SIMULATION_CONTROL_DISABLED' } });
  });

  it('rechaza JSON mal formado o con un tipo de contenido incorrecto', async () => {
    const { app } = createSimulationFixture(true);

    const wrongMediaType = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { ...dashboardHeaders, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ intervalSeconds: 10 }),
    });
    expect(wrongMediaType.status).toBe(415);
    expect(await wrongMediaType.json()).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });

    const malformed = await app.request('/api/simulation/config', {
      method: 'PATCH',
      headers: { ...dashboardHeaders, 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });
});
