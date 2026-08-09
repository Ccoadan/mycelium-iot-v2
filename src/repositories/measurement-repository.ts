import type { Filter } from 'mongodb';

import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { Measurement, Sensor, SensorType } from '../models/index.js';

export interface MeasurementFilter {
  type?: SensorType;
  sensorId?: number;
  bag?: number;
  from: Date;
  to: Date;
}

export interface MeasurementHistoryFilter extends MeasurementFilter {
  page: number;
  pageSize: number;
  responseOrder: 'asc' | 'desc';
}

export interface MeasurementHistoryPage {
  measurements: Measurement[];
  total: number;
}

export interface MeasurementExportFilter extends MeasurementFilter {
  limit: number;
}

export class MeasurementRepository {
  public constructor(private readonly connection: MongoConnection) {}

  public async getSensors(): Promise<Sensor[]> {
    const database = await this.connection.getDatabase();
    return database.collection<Sensor>(COLLECTIONS.sensors).find().sort({ location: 1, bag: 1, type: 1 }).toArray();
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

  public async getHistory(filter: MeasurementHistoryFilter): Promise<MeasurementHistoryPage> {
    const database = await this.connection.getDatabase();
    const collection = database.collection<Measurement>(COLLECTIONS.measurements);
    const query = toMongoFilter(filter);
    const [measurements, total] = await Promise.all([
      collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip((filter.page - 1) * filter.pageSize)
        .limit(filter.pageSize)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return {
      measurements: filter.responseOrder === 'asc' ? measurements.reverse() : measurements,
      total,
    };
  }

  public async getForExport(filter: MeasurementExportFilter): Promise<Measurement[]> {
    const database = await this.connection.getDatabase();
    return database
      .collection<Measurement>(COLLECTIONS.measurements)
      .find(toMongoFilter(filter))
      .sort({ timestamp: 1, sensorId: 1, type: 1 })
      .limit(filter.limit)
      .toArray();
  }
}

function toMongoFilter(filter: MeasurementFilter): Filter<Measurement> {
  return {
    timestamp: { $gte: filter.from, $lte: filter.to },
    ...(filter.type !== undefined ? { type: filter.type } : {}),
    ...(filter.sensorId !== undefined ? { sensorId: filter.sensorId } : {}),
    ...(filter.bag !== undefined ? { bag: filter.bag } : {}),
  };
}
