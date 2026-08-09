import { describe, expect, it } from 'vitest';

import type { Measurement, SensorType } from '../src/models/index.js';
import { SimulationEngine } from '../src/services/simulation/simulation-engine.js';
import { createSensorFixtures } from '../src/services/seed/sensor-fixtures.js';

function createDeterministicRandom(seed = 123_456): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1_664_525 * state + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function valuesByIdentity(measurements: Measurement[]): Map<string, number> {
  return new Map(measurements.map(({ sensorId, type, value }) => [`${sensorId}:${type}`, value]));
}

function valuesOfType(measurements: Measurement[], type: SensorType): number[] {
  return measurements.filter((measurement) => measurement.type === type).map(({ value }) => value);
}

function expectInRange(value: number | undefined, minimum: number, maximum: number): void {
  expect(value).toBeDefined();
  expect(value ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(minimum);
  expect(value ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(maximum);
}

describe('SimulationEngine', () => {
  const sensors = createSensorFixtures(new Date('2026-08-08T00:00:00.000Z'));

  it('genera exactamente 21 mediciones coherentes y físicamente acotadas', () => {
    const engine = new SimulationEngine(createDeterministicRandom());
    engine.initialize(sensors, []);
    const timestamp = new Date('2026-08-08T15:00:00.000Z');
    const cycle = engine.generateCycle(sensors, timestamp, 10);

    expect(cycle).toHaveLength(21);
    expect(cycle.every((measurement) => measurement.timestamp === timestamp)).toBe(true);
    expect(cycle.every(({ source }) => source === 'simulator')).toBe(true);
    expect(valuesOfType(cycle, 'temperature_environment')).toHaveLength(1);
    expect(valuesOfType(cycle, 'humidity_environment')).toHaveLength(1);
    expect(valuesOfType(cycle, 'co2_environment')).toHaveLength(1);
    expect(valuesOfType(cycle, 'temperature_bag')).toHaveLength(9);
    expect(valuesOfType(cycle, 'humidity_bag')).toHaveLength(9);

    expectInRange(valuesOfType(cycle, 'temperature_environment')[0], 18, 30);
    expectInRange(valuesOfType(cycle, 'humidity_environment')[0], 65, 95);
    expectInRange(valuesOfType(cycle, 'co2_environment')[0], 450, 3_000);
    expect(valuesOfType(cycle, 'temperature_bag').every((value) => value >= 18 && value <= 30)).toBe(true);
    expect(valuesOfType(cycle, 'humidity_bag').every((value) => value >= 55 && value <= 92)).toBe(true);
    expect(cycle.filter(({ type, unit }) => type === 'humidity_bag' && unit === '%')).toHaveLength(9);
  });

  it('mantiene continuidad temporal entre ciclos y al reiniciarse desde el último dato', () => {
    const engine = new SimulationEngine(createDeterministicRandom(77));
    engine.initialize(sensors, []);
    const first = engine.generateCycle(sensors, new Date('2026-08-08T15:00:00.000Z'), 10);
    const second = engine.generateCycle(sensors, new Date('2026-08-08T15:00:10.000Z'), 10);
    const firstValues = valuesByIdentity(first);

    for (const measurement of second) {
      const previous = firstValues.get(`${measurement.sensorId}:${measurement.type}`);
      expect(previous).toBeDefined();
      const change = Math.abs(measurement.value - (previous ?? measurement.value));
      if (measurement.unit === '°C') expect(change).toBeLessThan(0.3);
      if (measurement.unit === '%') expect(change).toBeLessThan(0.8);
      if (measurement.unit === 'ppm') expect(change).toBeLessThan(60);
    }

    const restartedEngine = new SimulationEngine(createDeterministicRandom(88));
    restartedEngine.initialize(sensors, second);
    const afterRestart = restartedEngine.generateCycle(sensors, new Date('2026-08-08T15:00:20.000Z'), 10);
    const secondValues = valuesByIdentity(second);
    for (const measurement of afterRestart) {
      const previous = secondValues.get(`${measurement.sensorId}:${measurement.type}`) ?? measurement.value;
      const change = Math.abs(measurement.value - previous);
      if (measurement.unit === '°C') expect(change).toBeLessThan(0.3);
      if (measurement.unit === '%') expect(change).toBeLessThan(0.8);
      if (measurement.unit === 'ppm') expect(change).toBeLessThan(60);
    }
  });
});
