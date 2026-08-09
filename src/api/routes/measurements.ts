import { Hono } from 'hono';
import { z } from 'zod';

import { SENSOR_TYPES } from '../../models/index.js';
import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import {
  HistoryValidationError,
  type MeasurementQueryService,
} from '../../services/measurements/measurement-query-service.js';

const historyQuerySchema = z.object({
  type: z.enum(SENSOR_TYPES).optional(),
  sensorId: z.coerce.number().int().min(0).max(9).optional(),
  bag: z.coerce.number().int().min(1).max(9).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  hours: z.coerce.number().positive().max(8_784).optional(),
  page: z.coerce.number().int().positive().max(100_000).default(1),
  pageSize: z.coerce.number().int().positive().max(500).optional(),
  limit: z.coerce.number().int().positive().max(2_000).optional(),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export interface MeasurementRouteDependencies {
  service: MeasurementQueryService;
  authentication?: RequestAuthentication;
}

export function createMeasurementRoutes(dependencies: MeasurementRouteDependencies): Hono {
  const routes = new Hono();

  routes.get('/latest', async (context) => {
    await dependencies.authentication?.requireUser(context);
    return context.json(await dependencies.service.getLatest());
  });

  routes.get('/history', async (context) => {
    await dependencies.authentication?.requireUser(context);
    const parsed = historyQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los filtros de historial no son válidos',
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        400,
      );
    }

    const query = parsed.data;
    try {
      return context.json(
        await dependencies.service.getHistory({
          page: query.page,
          pageSize: query.pageSize ?? query.limit ?? 25,
          responseOrder: query.sort,
          ...(query.type !== undefined ? { type: query.type } : {}),
          ...(query.sensorId !== undefined ? { sensorId: query.sensorId } : {}),
          ...(query.bag !== undefined ? { bag: query.bag } : {}),
          ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
          ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
          ...(query.hours !== undefined ? { hours: query.hours } : {}),
        }),
      );
    } catch (error) {
      if (error instanceof HistoryValidationError) {
        return context.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, 400);
      }
      throw error;
    }
  });

  return routes;
}
