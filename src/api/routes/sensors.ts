import { Hono } from 'hono';

import type { MeasurementQueryService } from '../../services/measurements/measurement-query-service.js';

export function createSensorRoutes(service: MeasurementQueryService): Hono {
  const routes = new Hono();
  routes.get('/', async (context) => {
    const sensors = await service.getSensors();
    const publicSensors = sensors.map(({ sensorId, key, type, name, location, bag, unit, active }) => ({
      sensorId,
      key,
      type,
      name,
      location,
      ...(bag !== undefined ? { bag } : {}),
      unit,
      active,
    }));
    return context.json({ count: publicSensors.length, sensors: publicSensors });
  });
  return routes;
}
