import { Hono } from 'hono';

import type { DatabaseHealth } from '../../database/mongo-connection.js';
import type { SimulationStatus } from '../../services/simulation/simulation-service.js';

export interface HealthDatabase {
  databaseName: string;
  checkHealth(): Promise<DatabaseHealth>;
}

export interface HealthRouteDependencies {
  appEnv: string;
  database: HealthDatabase;
  simulation?: { getStatus(): SimulationStatus };
}

export const HEALTH_DATABASE_CACHE_TTL_MS = 2_000;

export function createHealthRoutes(dependencies: HealthRouteDependencies): Hono {
  const routes = new Hono();
  let cachedDatabaseHealth: { expiresAt: number; value: DatabaseHealth } | undefined;
  let databaseHealthRequest: Promise<DatabaseHealth> | undefined;

  async function getDatabaseHealth(): Promise<DatabaseHealth> {
    const now = Date.now();
    if (cachedDatabaseHealth && cachedDatabaseHealth.expiresAt > now) {
      return cachedDatabaseHealth.value;
    }
    if (databaseHealthRequest) {
      return databaseHealthRequest;
    }

    const request = dependencies.database.checkHealth();
    databaseHealthRequest = request;
    try {
      const value = await request;
      cachedDatabaseHealth = { expiresAt: now + HEALTH_DATABASE_CACHE_TTL_MS, value };
      return value;
    } finally {
      if (databaseHealthRequest === request) databaseHealthRequest = undefined;
    }
  }

  routes.get('/health', async (context) => {
    const databaseHealth = await getDatabaseHealth();
    const simulationStatus = dependencies.simulation?.getStatus();
    const response = {
      status: databaseHealth.available ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      timezone: {
        storage: 'UTC',
        presentation: 'America/Lima',
      },
      environment: dependencies.appEnv,
      services: {
        api: { status: 'up' },
        mongodb: {
          status: databaseHealth.available ? 'up' : 'down',
          database: dependencies.database.databaseName,
          latencyMs: databaseHealth.latencyMs,
        },
        ...(simulationStatus
          ? {
              simulator: {
                status: simulationStatus.running ? 'running' : 'stopped',
                intervalSeconds: simulationStatus.intervalSeconds,
                lastCycleAt: simulationStatus.lastCycleAt,
              },
            }
          : {}),
      },
    };

    return databaseHealth.available ? context.json(response, 200) : context.json(response, 503);
  });

  return routes;
}
