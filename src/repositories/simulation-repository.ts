import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { AuditLog, Measurement, Sensor } from '../models/index.js';
import { AuditRepository, type RecordAuditEvent } from './audit-repository.js';

export interface SimulationPersistence {
  getActiveSensors(): Promise<Sensor[]>;
  getLatestMeasurements(): Promise<Measurement[]>;
  insertMeasurements(measurements: Measurement[]): Promise<void>;
  recordAudit(event: RecordAuditEvent): Promise<void>;
}

export class MongoSimulationRepository implements SimulationPersistence {
  public constructor(private readonly connection: MongoConnection) {}

  public async getActiveSensors(): Promise<Sensor[]> {
    const database = await this.connection.getDatabase();
    return database
      .collection<Sensor>(COLLECTIONS.sensors)
      .find({ active: true })
      .sort({ sensorId: 1, type: 1 })
      .toArray();
  }

  public async getLatestMeasurements(): Promise<Measurement[]> {
    const database = await this.connection.getDatabase();
    return database
      .collection<Measurement>(COLLECTIONS.measurements)
      .aggregate<Measurement>([
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: { sensorId: '$sensorId', type: '$type' },
            measurement: { $first: '$$ROOT' },
          },
        },
        { $replaceRoot: { newRoot: '$measurement' } },
      ])
      .toArray();
  }

  public async insertMeasurements(measurements: Measurement[]): Promise<void> {
    if (measurements.length === 0) {
      return;
    }

    const database = await this.connection.getDatabase();
    await database.collection<Measurement>(COLLECTIONS.measurements).insertMany(measurements, { ordered: true });
  }

  public async recordAudit(event: RecordAuditEvent): Promise<void> {
    const database = await this.connection.getDatabase();
    const repository = new AuditRepository(database.collection<AuditLog>(COLLECTIONS.auditLogs));
    await repository.record(event);
  }
}
