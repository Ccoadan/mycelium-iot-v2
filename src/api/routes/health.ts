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

export function createHealthRoutes(dependencies: HealthRouteDependencies): Hono {
  const routes = new Hono();

  routes.get('/health', async (context) => {
    const databaseHealth = await dependencies.database.checkHealth();
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
