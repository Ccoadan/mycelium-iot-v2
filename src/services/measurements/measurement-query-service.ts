import type { Measurement, Sensor, SensorType } from '../../models/index.js';
import type { MeasurementRepository } from '../../repositories/measurement-repository.js';

export type SensorReportingStatus = 'online' | 'stale' | 'no_data' | 'disabled';

export interface LatestMeasurementView {
  sensorId: number;
  key: string;
  type: SensorType;
  name: string;
  location: 'environment' | 'bag';
  bag: number | null;
  active: boolean;
  status: SensorReportingStatus;
  value: number | null;
  unit: '°C' | '%' | 'ppm';
  timestamp: string | null;
}

export interface HistoryQuery {
  type?: SensorType;
  sensorId?: number;
  bag?: number;
  from?: Date;
  to?: Date;
  hours?: number;
  page: number;
  pageSize: number;
  responseOrder: 'asc' | 'desc';
}

export class HistoryValidationError extends Error {}

export const HISTORY_MAX_RANGE_DAYS = 366;

export interface ResolvedMeasurementRange {
  from: Date;
  to: Date;
}

export class MeasurementQueryService {
  public constructor(
    private readonly repository: MeasurementRepository,
    private readonly staleAfterSeconds: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async getSensors(): Promise<Sensor[]> {
    return this.repository.getSensors();
  }

  public async getLatest(): Promise<{
    generatedAt: string;
    summary: { configured: number; active: number; reporting: number; stale: number };
    measurements: LatestMeasurementView[];
  }> {
    const [sensors, latestMeasurements] = await Promise.all([
      this.repository.getSensors(),
      this.repository.getLatestMeasurements(),
    ]);
    const now = this.clock();
    const latestByIdentity = new Map(
      latestMeasurements.map((measurement) => [identity(measurement.sensorId, measurement.type), measurement]),
    );
    const measurements = sensors.map((sensor) => this.toLatestView(sensor, latestByIdentity.get(identity(sensor.sensorId, sensor.type)), now));

    return {
      generatedAt: now.toISOString(),
      summary: {
        configured: sensors.length,
        active: sensors.filter(({ active }) => active).length,
        reporting: measurements.filter(({ status }) => status === 'online').length,
        stale: measurements.filter(({ status }) => status === 'stale').length,
      },
      measurements,
    };
  }

  public async getHistory(query: HistoryQuery): Promise<{
    query: {
      type: SensorType | null;
      sensorId: number | null;
      bag: number | null;
      from: string;
      to: string;
      responseOrder: 'asc' | 'desc';
    };
    count: number;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    measurements: Array<{
      sensorId: number;
      type: SensorType;
      bag: number | null;
      value: number;
      unit: '°C' | '%' | 'ppm';
      timestamp: string;
      source: Measurement['source'];
    }>;
  }> {
    validateFilterCombination(query);
    const range = resolveMeasurementRange(query, this.clock());
    const page = await this.repository.getHistory({
      from: range.from,
      to: range.to,
      page: query.page,
      pageSize: query.pageSize,
      responseOrder: query.responseOrder,
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.sensorId !== undefined ? { sensorId: query.sensorId } : {}),
      ...(query.bag !== undefined ? { bag: query.bag } : {}),
    });

    return {
      query: {
        type: query.type ?? null,
        sensorId: query.sensorId ?? null,
        bag: query.bag ?? null,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        responseOrder: query.responseOrder,
      },
      count: page.measurements.length,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: page.total,
        totalPages: page.total === 0 ? 0 : Math.ceil(page.total / query.pageSize),
      },
      measurements: page.measurements.map((measurement) => ({
        sensorId: measurement.sensorId,
        type: measurement.type,
        bag: measurement.bag ?? null,
        value: measurement.value,
        unit: measurement.unit,
        timestamp: measurement.timestamp.toISOString(),
        source: measurement.source,
      })),
    };
  }

  private toLatestView(sensor: Sensor, measurement: Measurement | undefined, now: Date): LatestMeasurementView {
    let status: SensorReportingStatus;
    if (!sensor.active) {
      status = 'disabled';
    } else if (!measurement) {
      status = 'no_data';
    } else {
      const ageSeconds = (now.getTime() - measurement.timestamp.getTime()) / 1_000;
      status = ageSeconds <= this.staleAfterSeconds ? 'online' : 'stale';
    }

    return {
      sensorId: sensor.sensorId,
      key: sensor.key,
      type: sensor.type,
      name: sensor.name,
      location: sensor.location,
      bag: sensor.bag ?? null,
      active: sensor.active,
      status,
      value: measurement?.value ?? null,
      unit: sensor.unit,
      timestamp: measurement?.timestamp.toISOString() ?? null,
    };
  }
}

export function resolveMeasurementRange(
  input: Pick<HistoryQuery, 'from' | 'to' | 'hours'>,
  now: Date,
): ResolvedMeasurementRange {
  const to = input.to ?? now;
  const hours = input.hours ?? 24;
  const from = input.from ?? new Date(to.getTime() - hours * 60 * 60 * 1_000);

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new HistoryValidationError('Las fechas del historial no son válidas');
  }
  if (from.getTime() > to.getTime()) {
    throw new HistoryValidationError('La fecha inicial no puede ser posterior a la fecha final');
  }
  const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1_000);
  if (rangeDays > HISTORY_MAX_RANGE_DAYS) {
    throw new HistoryValidationError(`El rango máximo es de ${HISTORY_MAX_RANGE_DAYS} días`);
  }

  return { from, to };
}

export function validateFilterCombination(
  filter: Pick<HistoryQuery, 'type' | 'sensorId' | 'bag'>,
): void {
  if (filter.bag !== undefined && filter.sensorId !== undefined && filter.sensorId !== filter.bag) {
    throw new HistoryValidationError('sensorId y bag deben identificar la misma bolsa');
  }
  if (filter.bag !== undefined && filter.type?.endsWith('_environment')) {
    throw new HistoryValidationError('Un sensor ambiental no puede filtrarse por bolsa');
  }
  if (filter.sensorId === 0 && filter.type?.endsWith('_bag')) {
    throw new HistoryValidationError('El sensor ambiental 0 no contiene mediciones de bolsa');
  }
  if (filter.sensorId !== undefined && filter.sensorId > 0 && filter.type?.endsWith('_environment')) {
    throw new HistoryValidationError('Los sensores de bolsa no contienen mediciones ambientales');
  }
}

function identity(sensorId: number, type: SensorType): string {
  return `${sensorId}:${type}`;
}
