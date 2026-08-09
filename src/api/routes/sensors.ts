import { Hono } from 'hono';

import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import type { MeasurementQueryService } from '../../services/measurements/measurement-query-service.js';

export function createSensorRoutes(service: MeasurementQueryService, authentication?: RequestAuthentication): Hono {
  const routes = new Hono();
  routes.get('/', async (context) => {
    await authentication?.requireUser(context);
    const sensors = await service.getSensors();
    return context.json({ count: sensors.length, sensors });
  });
  return routes;
}
