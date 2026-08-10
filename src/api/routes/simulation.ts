import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { readJsonBody } from '../http/read-json-body.js';
import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import {
  SIMULATION_INTERVAL_LIMITS,
  type SimulationService,
} from '../../services/simulation/simulation-service.js';

const intervalSchema = z.object({
  intervalSeconds: z
    .number()
    .int()
    .min(SIMULATION_INTERVAL_LIMITS.minimumSeconds)
    .max(SIMULATION_INTERVAL_LIMITS.maximumSeconds),
}).strict();

export interface SimulationRouteDependencies {
  service: SimulationService;
  controlEnabled: boolean;
  authentication: RequestAuthentication;
}

export function createSimulationRoutes(dependencies: SimulationRouteDependencies): Hono {
  const routes = new Hono();
  routes.get('/', async (context) => {
    return context.json({ simulation: dependencies.service.getStatus() });
  });

  routes.post('/start', async (context) => {
    const actor = await dependencies.authentication.requireAdmin(context);
    dependencies.authentication.requireDashboardRequest(context);
    if (!dependencies.controlEnabled) {
      return controlDisabled(context);
    }
    const status = await dependencies.service.start(actor);
    return context.json({ simulation: status });
  });

  routes.post('/stop', async (context) => {
    const actor = await dependencies.authentication.requireAdmin(context);
    dependencies.authentication.requireDashboardRequest(context);
    if (!dependencies.controlEnabled) {
      return controlDisabled(context);
    }
    const status = await dependencies.service.stop(actor);
    return context.json({ simulation: status });
  });

  routes.post('/run-once', async (context) => {
    const actor = await dependencies.authentication.requireAdmin(context);
    dependencies.authentication.requireDashboardRequest(context);
    if (!dependencies.controlEnabled) {
      return controlDisabled(context);
    }
    const cycle = await dependencies.service.runOnce(actor);
    return context.json({ cycle }, 201);
  });

  routes.patch('/config', async (context) => {
    const actor = await dependencies.authentication.requireAdmin(context);
    dependencies.authentication.requireDashboardRequest(context);
    if (!dependencies.controlEnabled) {
      return controlDisabled(context);
    }

    const body = await readJsonBody(context);
    const parsed = intervalSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `intervalSeconds debe ser un entero entre ${SIMULATION_INTERVAL_LIMITS.minimumSeconds} y ${SIMULATION_INTERVAL_LIMITS.maximumSeconds}`,
          },
        },
        400,
      );
    }

    const status = await dependencies.service.configureInterval(parsed.data.intervalSeconds, actor);
    return context.json({ simulation: status });
  });

  return routes;
}

function controlDisabled(context: Context): Response | Promise<Response> {
  return context.json(
    {
      error: {
        code: 'SIMULATION_CONTROL_DISABLED',
        message: 'El control local del simulador está deshabilitado en este entorno',
      },
    },
    403,
  );
}
