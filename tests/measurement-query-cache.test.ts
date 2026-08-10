import { describe, expect, it, vi } from 'vitest';

import type { MeasurementRepository } from '../src/repositories/measurement-repository.js';
import {
  LATEST_MEASUREMENTS_CACHE_TTL_MS,
  MeasurementQueryService,
} from '../src/services/measurements/measurement-query-service.js';
import { createSensorFixtures } from '../src/services/seed/sensor-fixtures.js';

describe('caché de últimas mediciones', () => {
  it('combina solicitudes concurrentes y renueva el resultado al vencer el TTL', async () => {
    const sensors = createSensorFixtures(new Date('2026-08-10T12:00:00.000Z'));
    const getSensors = vi.fn(async () => sensors);
    const getLatestMeasurements = vi.fn(async () => []);
    const repository = { getSensors, getLatestMeasurements } as unknown as MeasurementRepository;
    let currentTime = Date.parse('2026-08-10T12:00:00.000Z');
    const service = new MeasurementQueryService(repository, 60, () => new Date(currentTime));

    const [first, concurrent] = await Promise.all([service.getLatest(), service.getLatest()]);
    expect(concurrent).toBe(first);
    expect(getSensors).toHaveBeenCalledTimes(1);
    expect(getLatestMeasurements).toHaveBeenCalledTimes(1);

    const cached = await service.getLatest();
    expect(cached).toBe(first);
    expect(getLatestMeasurements).toHaveBeenCalledTimes(1);

    currentTime += LATEST_MEASUREMENTS_CACHE_TTL_MS;
    const refreshed = await service.getLatest();
    expect(refreshed).not.toBe(first);
    expect(getSensors).toHaveBeenCalledTimes(2);
    expect(getLatestMeasurements).toHaveBeenCalledTimes(2);
  });
});
