import { Hono } from 'hono';
import { z } from 'zod';

import { SENSOR_TYPES } from '../../models/index.js';
import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import {
  CsvExportLimitError,
  type CsvExportService,
} from '../../services/export/csv-export-service.js';
import { HistoryValidationError } from '../../services/measurements/measurement-query-service.js';

const exportQuerySchema = z.object({
  type: z.enum(SENSOR_TYPES).optional(),
  sensorId: z.coerce.number().int().min(0).max(9).optional(),
  bag: z.coerce.number().int().min(1).max(9).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  hours: z.coerce.number().positive().max(8_784).optional(),
});

export interface ExportRouteDependencies {
  service: CsvExportService;
  authentication: RequestAuthentication;
}

export function createExportRoutes(dependencies: ExportRouteDependencies): Hono {
  const routes = new Hono();

  routes.get('/csv', async (context) => {
    const actor = await dependencies.authentication.requireUser(context);
    const parsed = exportQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Los filtros de exportación no son válidos' } },
        400,
      );
    }

    try {
      const query = parsed.data;
      const result = await dependencies.service.create(
        {
          ...(query.type !== undefined ? { type: query.type } : {}),
          ...(query.sensorId !== undefined ? { sensorId: query.sensorId } : {}),
          ...(query.bag !== undefined ? { bag: query.bag } : {}),
          ...(query.from !== undefined ? { from: new Date(query.from) } : {}),
          ...(query.to !== undefined ? { to: new Date(query.to) } : {}),
          ...(query.hours !== undefined ? { hours: query.hours } : {}),
        },
        actor,
      );
      return new Response(result.content, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'Content-Type': 'text/csv; charset=utf-8',
          'X-Export-Count': String(result.count),
        },
      });
    } catch (error) {
      if (error instanceof HistoryValidationError) {
        return context.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, 400);
      }
      if (error instanceof CsvExportLimitError) {
        return context.json({ error: { code: 'EXPORT_TOO_LARGE', message: error.message } }, 413);
      }
      throw error;
    }
  });

  return routes;
}
