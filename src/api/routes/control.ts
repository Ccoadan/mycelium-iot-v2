import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { RELAY_KEYS } from '../../models/index.js';
import { readJsonBody } from '../http/read-json-body.js';
import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import {
  ControlPermissionError,
  type ControlService,
  ControlStateNotFoundError,
} from '../../services/control/control-service.js';

const relaySchema = z.enum(RELAY_KEYS);
const updateSchema = z.object({ enabled: z.boolean() }).strict();

export interface ControlRouteDependencies {
  service: ControlService;
  authentication: RequestAuthentication;
}

export function createControlRoutes(dependencies: ControlRouteDependencies): Hono {
  const routes = new Hono();

  routes.get('/', async (context) => {
    try {
      const actor = await dependencies.authentication.optionalUser(context);
      return context.json({ control: await dependencies.service.getControl(actor) });
    } catch (error) {
      return controlError(context, error);
    }
  });

  routes.patch('/:relay', async (context) => {
    try {
      const actor = await dependencies.authentication.requireAdmin(context);
      dependencies.authentication.requireDashboardRequest(context);
      const relay = relaySchema.safeParse(context.req.param('relay'));
      const body = await readJsonBody(context);
      const parsed = updateSchema.safeParse(body);
      if (!relay.success || !parsed.success) {
        return context.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El relé o su estado no son válidos',
            },
          },
          400,
        );
      }

      return context.json(await dependencies.service.setRelay(relay.data, parsed.data.enabled, actor));
    } catch (error) {
      return controlError(context, error);
    }
  });

  return routes;
}

function controlError(context: Context, error: unknown): Response | Promise<Response> {
  if (error instanceof ControlPermissionError) {
    return context.json({ error: { code: 'FORBIDDEN', message: error.message } }, 403);
  }
  if (error instanceof ControlStateNotFoundError) {
    return context.json({ error: { code: 'CONTROL_STATE_NOT_FOUND', message: error.message } }, 404);
  }
  throw error;
}
