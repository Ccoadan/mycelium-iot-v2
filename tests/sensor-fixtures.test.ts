import { describe, expect, it } from 'vitest';

import { createSensorFixtures } from '../src/services/seed/sensor-fixtures.js';

describe('createSensorFixtures', () => {
  it('crea exactamente 21 canales con nueve pares de bolsa', () => {
    const sensors = createSensorFixtures(new Date('2026-08-07T12:00:00.000Z'));

    expect(sensors).toHaveLength(21);
    expect(sensors.filter(({ location }) => location === 'environment')).toHaveLength(3);
    expect(sensors.filter(({ type }) => type === 'temperature_bag')).toHaveLength(9);
    expect(sensors.filter(({ type }) => type === 'humidity_bag')).toHaveLength(9);
    expect(new Set(sensors.map(({ key }) => key)).size).toBe(21);
  });

  it('representa la humedad de las bolsas como porcentaje y no como ADC', () => {
    const humiditySensors = createSensorFixtures().filter(({ type }) => type === 'humidity_bag');

    expect(humiditySensors).toHaveLength(9);
    expect(humiditySensors.every(({ unit }) => unit === '%')).toBe(true);
  });
});
