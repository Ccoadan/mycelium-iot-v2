import type { SensorType } from '../../models/index.js';
import type { MeasurementRepository } from '../../repositories/measurement-repository.js';
import type { AuditService } from '../audit/audit-service.js';
import type { AuthenticatedUser } from '../auth/auth-service.js';
import { toAuditActor } from '../auth/auth-service.js';
import {
  resolveMeasurementRange,
  validateFilterCombination,
} from '../measurements/measurement-query-service.js';

export const CSV_EXPORT_MAX_ROWS = 50_000;

export class CsvExportLimitError extends Error {}

export interface CsvExportQuery {
  type?: SensorType;
  sensorId?: number;
  bag?: number;
  from?: Date;
  to?: Date;
  hours?: number;
}

export interface CsvExportResult {
  content: string;
  filename: string;
  count: number;
}

export class CsvExportService {
  public constructor(
    private readonly measurements: MeasurementRepository,
    private readonly audit: AuditService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async create(query: CsvExportQuery, actor: AuthenticatedUser): Promise<CsvExportResult> {
    validateFilterCombination(query);
    const range = resolveMeasurementRange(query, this.clock());
    const measurements = await this.measurements.getForExport({
      from: range.from,
      to: range.to,
      limit: CSV_EXPORT_MAX_ROWS + 1,
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.sensorId !== undefined ? { sensorId: query.sensorId } : {}),
      ...(query.bag !== undefined ? { bag: query.bag } : {}),
    });

    if (measurements.length > CSV_EXPORT_MAX_ROWS) {
      throw new CsvExportLimitError(
        `La exportación supera ${CSV_EXPORT_MAX_ROWS} filas; reduzca el rango o aplique más filtros`,
      );
    }

    const content = [
      'timestamp_utc,timestamp_lima,sensor_id,type,bag,value,unit,source',
      ...measurements.map((measurement) =>
        [
          csvCell(measurement.timestamp.toISOString()),
          csvCell(formatLimaTimestamp(measurement.timestamp)),
          measurement.sensorId,
          csvCell(measurement.type),
          measurement.bag ?? '',
          measurement.value,
          csvCell(measurement.unit),
          csvCell(measurement.source),
        ].join(','),
      ),
    ].join('\r\n');

    await this.audit.register({
      user: toAuditActor(actor),
      action: 'export.csv_generated',
      entity: 'measurements',
      details: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        type: query.type ?? null,
        sensorId: query.sensorId ?? null,
        bag: query.bag ?? null,
        rows: measurements.length,
      },
      timestamp: this.clock(),
    });

    return {
      content: `\uFEFF${content}\r\n`,
      filename: `mycelium_measurements_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`,
      count: measurements.length,
    };
  }
}

function csvCell(value: string): string {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function formatLimaTimestamp(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
