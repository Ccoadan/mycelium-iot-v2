import { describe, expect, it } from 'vitest';

import { validateJmeterStatistics } from '../scripts/validate-jmeter-results.js';

function statistic(overrides: Record<string, number> = {}) {
  return {
    sampleCount: 100,
    errorPct: 0,
    meanResTime: 100,
    pct2ResTime: 100,
    maxResTime: 200,
    throughput: 10,
    ...overrides,
  };
}

describe('umbrales JMeter', () => {
  it('aprueba cuando todos los criterios están dentro de los límites', () => {
    const validation = validateJmeterStatistics({
      Total: statistic(),
      '02 - Salud': statistic({ pct2ResTime: 357 }),
      '03 - Últimas mediciones': statistic({ pct2ResTime: 848 }),
      '04 - Historial 24 horas': statistic({ pct2ResTime: 1_460 }),
    });

    expect(validation.passed).toBe(true);
    expect(validation.checks.every(({ passed }) => passed)).toBe(true);
  });

  it('falla si un umbral se alcanza o supera', () => {
    const validation = validateJmeterStatistics({
      Total: statistic({ errorPct: 1 }),
      '02 - Salud': statistic({ pct2ResTime: 500 }),
      '03 - Últimas mediciones': statistic({ pct2ResTime: 2_000 }),
      '04 - Historial 24 horas': statistic({ pct2ResTime: 2_000 }),
    });

    expect(validation.passed).toBe(false);
    expect(validation.checks.every(({ passed }) => !passed)).toBe(true);
  });
});
