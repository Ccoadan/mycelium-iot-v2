import type { ObjectId } from 'mongodb';

import type { MeasurementUnit, SensorType } from './sensor.js';

export interface Measurement {
  _id?: ObjectId;
  sensorId: number;
  type: SensorType;
  bag?: number;
  value: number;
  unit: MeasurementUnit;
  timestamp: Date;
  source: 'simulator' | 'historical-import';
}
