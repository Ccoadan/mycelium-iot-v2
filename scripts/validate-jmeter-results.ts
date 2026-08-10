import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface JmeterStatistic {
  sampleCount: number;
  errorPct: number;
  meanResTime: number;
  pct2ResTime: number;
  maxResTime: number;
  throughput: number;
}

type JmeterStatistics = Record<string, JmeterStatistic>;

export interface ThresholdResult {
  name: string;
  actual: number;
  maximum: number;
  unit: '%' | 'ms';
  passed: boolean;
}

export interface JmeterValidation {
  passed: boolean;
  checks: ThresholdResult[];
}

export function validateJmeterStatistics(statistics: JmeterStatistics): JmeterValidation {
  const total = requiredStatistic(statistics, 'Total');
  const health = requiredStatistic(statistics, '02 - Salud');
  const latest = requiredStatistic(statistics, '03 - Últimas mediciones');
  const history = requiredStatistic(statistics, '04 - Historial 24 horas');
  const definitions: Array<Omit<ThresholdResult, 'passed'>> = [
    { name: 'Errores totales', actual: total.errorPct, maximum: 1, unit: '%' },
    { name: 'Salud p95', actual: health.pct2ResTime, maximum: 500, unit: 'ms' },
    { name: 'Últimas mediciones p95', actual: latest.pct2ResTime, maximum: 2_000, unit: 'ms' },
    { name: 'Historial p95', actual: history.pct2ResTime, maximum: 2_000, unit: 'ms' },
  ];
  const checks = definitions.map((definition) => ({
    ...definition,
    passed: definition.actual < definition.maximum,
  }));
  return { passed: checks.every(({ passed }) => passed), checks };
}

function requiredStatistic(statistics: JmeterStatistics, name: string): JmeterStatistic {
  const statistic = statistics[name];
  if (!statistic) throw new Error(`El reporte JMeter no contiene la operación: ${name}`);
  return statistic;
}

function summaryMarkdown(statistics: JmeterStatistics, validation: JmeterValidation): string {
  const total = requiredStatistic(statistics, 'Total');
  const rows = validation.checks
    .map(({ name, actual, maximum, unit, passed }) =>
      `| ${name} | ${actual.toFixed(2)} ${unit} | < ${maximum} ${unit} | ${passed ? 'Aprobado' : 'Fallido'} |`,
    )
    .join('\n');
  return [
    '## Resultado JMeter',
    '',
    `**${validation.passed ? 'APROBADO' : 'FALLIDO'}** — ${total.sampleCount} muestras, ${total.throughput.toFixed(2)} solicitudes/s.`,
    '',
    '| Criterio | Resultado | Umbral | Estado |',
    '|---|---:|---:|---|',
    rows,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const statisticsPath = resolve(process.argv[2] ?? 'reports/jmeter/html/statistics.json');
  const statistics = JSON.parse(await readFile(statisticsPath, 'utf8')) as JmeterStatistics;
  const validation = validateJmeterStatistics(statistics);
  const outputPath = resolve(dirname(statisticsPath), '..', 'thresholds.json');
  await writeFile(outputPath, `${JSON.stringify(validation, null, 2)}\n`, 'utf8');
  const markdown = summaryMarkdown(statistics, validation);
  console.info(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
  }
  validation.checks.filter(({ passed }) => !passed).forEach(({ name, actual, maximum, unit }) => {
    console.error(`::error title=Umbral JMeter · ${name}::Resultado ${actual.toFixed(2)} ${unit}; debe ser menor que ${maximum} ${unit}.`);
  });
  if (!validation.passed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
