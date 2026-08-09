import type { ObjectId } from 'mongodb';

export const SENSOR_TYPES = [
  'temperature_environment',
  'humidity_environment',
  'co2_environment',
  'temperature_bag',
  'humidity_bag',
] as const;

export type SensorType = (typeof SENSOR_TYPES)[number];
export type SensorLocation = 'environment' | 'bag';
export type MeasurementUnit = '°C' | '%' | 'ppm';

export interface Sensor {
  _id?: ObjectId;
  sensorId: number;
  key: string;
  type: SensorType;
  name: string;
  location: SensorLocation;
  bag?: number;
  unit: MeasurementUnit;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
