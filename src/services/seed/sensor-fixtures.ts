import type { Sensor } from '../../models/index.js';

type SensorSeed = Omit<Sensor, '_id' | 'createdAt' | 'updatedAt'>;

const environmentalSensors: SensorSeed[] = [
  {
    sensorId: 0,
    key: 'environment-temperature',
    type: 'temperature_environment',
    name: 'Temperatura ambiental',
    location: 'environment',
    unit: '°C',
    active: true,
  },
  {
    sensorId: 0,
    key: 'environment-humidity',
    type: 'humidity_environment',
    name: 'Humedad ambiental',
    location: 'environment',
    unit: '%',
    active: true,
  },
  {
    sensorId: 0,
    key: 'environment-co2',
    type: 'co2_environment',
    name: 'CO₂ ambiental',
    location: 'environment',
    unit: 'ppm',
    active: true,
  },
];

export function createSensorFixtures(now = new Date()): Sensor[] {
  const bagSensors = Array.from({ length: 9 }, (_, index): SensorSeed[] => {
    const bag = index + 1;
    return [
      {
        sensorId: bag,
        key: `bag-${bag}-temperature`,
        type: 'temperature_bag',
        name: `Temperatura Bolsa ${bag}`,
        location: 'bag',
        bag,
        unit: '°C',
        active: true,
      },
      {
        sensorId: bag,
        key: `bag-${bag}-humidity`,
        type: 'humidity_bag',
        name: `Humedad Bolsa ${bag}`,
        location: 'bag',
        bag,
        unit: '%',
        active: true,
      },
    ];
  }).flat();

  return [...environmentalSensors, ...bagSensors].map((sensor) => ({
    ...sensor,
    createdAt: now,
    updatedAt: now,
  }));
}
