import type { Measurement, Sensor, SensorType } from '../../models/index.js';

const EXPECTED_SENSOR_COUNT = 21;

type RandomSource = () => number;

function sensorKey(sensorId: number, type: SensorType): string {
  return `${sensorId}:${type}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export class SimulationEngine {
  private readonly values = new Map<string, number>();
  private initialized = false;

  public constructor(private readonly random: RandomSource = Math.random) {}

  public initialize(sensors: Sensor[], latestMeasurements: Measurement[]): void {
    this.assertCompleteSensorSet(sensors);
    const latestBySensor = new Map(
      latestMeasurements.map((measurement) => [sensorKey(measurement.sensorId, measurement.type), measurement.value]),
    );

    for (const sensor of sensors) {
      const key = sensorKey(sensor.sensorId, sensor.type);
      const latest = latestBySensor.get(key);
      this.values.set(key, latest ?? this.initialValue(sensor));
    }

    this.initialized = true;
  }

  public generateCycle(sensors: Sensor[], timestamp: Date, intervalSeconds: number): Measurement[] {
    if (!this.initialized) {
      throw new Error('El motor de simulación debe inicializarse antes de generar un ciclo');
    }
    this.assertCompleteSensorSet(sensors);

    const timeScale = clamp(Math.sqrt(intervalSeconds / 10), 0.3, 4);
    const limaHour = (timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60 + 19) % 24;
    const dailyPhase = (2 * Math.PI * limaHour) / 24;

    const environmentTemperature = this.evolve(
      this.currentValue(0, 'temperature_environment'),
      23.4 + 0.65 * Math.sin(dailyPhase - Math.PI / 2),
      0.045,
      0.035,
      18,
      30,
      timeScale,
    );
    const environmentHumidity = this.evolve(
      this.currentValue(0, 'humidity_environment'),
      82.5 - 1.2 * Math.sin(dailyPhase - Math.PI / 2),
      0.04,
      0.16,
      65,
      95,
      timeScale,
    );
    const environmentCo2 = this.evolve(
      this.currentValue(0, 'co2_environment'),
      1_150 + 170 * Math.sin(dailyPhase + Math.PI / 5),
      0.035,
      13,
      450,
      3_000,
      timeScale,
    );

    this.setValue(0, 'temperature_environment', environmentTemperature);
    this.setValue(0, 'humidity_environment', environmentHumidity);
    this.setValue(0, 'co2_environment', environmentCo2);

    for (let bag = 1; bag <= 9; bag += 1) {
      const temperatureOffset = (bag - 5) * 0.055 + Math.sin(bag * 1.7) * 0.11;
      const humidityOffset = (bag - 5) * 0.32 + Math.cos(bag * 1.3) * 0.65;
      const bagTemperature = this.evolve(
        this.currentValue(bag, 'temperature_bag'),
        environmentTemperature + temperatureOffset,
        0.055,
        0.025,
        18,
        30,
        timeScale,
      );
      const bagHumidity = this.evolve(
        this.currentValue(bag, 'humidity_bag'),
        76 + humidityOffset + (environmentHumidity - 82.5) * 0.08,
        0.035,
        0.1,
        55,
        92,
        timeScale,
      );

      this.setValue(bag, 'temperature_bag', bagTemperature);
      this.setValue(bag, 'humidity_bag', bagHumidity);
    }

    return sensors.map((sensor) => {
      const value = this.currentValue(sensor.sensorId, sensor.type);
      const decimals = sensor.unit === 'ppm' ? 0 : sensor.unit === '%' ? 1 : 2;
      return {
        sensorId: sensor.sensorId,
        type: sensor.type,
        ...(sensor.bag ? { bag: sensor.bag } : {}),
        value: round(value, decimals),
        unit: sensor.unit,
        timestamp,
        source: 'simulator',
      };
    });
  }

  private initialValue(sensor: Sensor): number {
    const centeredNoise = this.centeredNoise();
    switch (sensor.type) {
      case 'temperature_environment':
        return 23.4 + centeredNoise * 0.5;
      case 'humidity_environment':
        return 82.5 + centeredNoise * 1.5;
      case 'co2_environment':
        return 1_150 + centeredNoise * 180;
      case 'temperature_bag':
        return 23.5 + ((sensor.bag ?? 5) - 5) * 0.055 + centeredNoise * 0.35;
      case 'humidity_bag':
        return 76 + ((sensor.bag ?? 5) - 5) * 0.32 + centeredNoise * 1.2;
    }
  }

  private evolve(
    current: number,
    target: number,
    meanReversion: number,
    noiseAmplitude: number,
    minimum: number,
    maximum: number,
    timeScale: number,
  ): number {
    const reversion = (target - current) * clamp(meanReversion * timeScale, 0, 0.4);
    const boundedNoise = this.centeredNoise() * noiseAmplitude * timeScale;
    return clamp(current + reversion + boundedNoise, minimum, maximum);
  }

  private centeredNoise(): number {
    return (this.random() + this.random() + this.random()) / 3 - 0.5;
  }

  private currentValue(sensorId: number, type: SensorType): number {
    const value = this.values.get(sensorKey(sensorId, type));
    if (value === undefined) {
      throw new Error(`No existe estado para el sensor ${sensorId}:${type}`);
    }
    return value;
  }

  private setValue(sensorId: number, type: SensorType, value: number): void {
    this.values.set(sensorKey(sensorId, type), value);
  }

  private assertCompleteSensorSet(sensors: Sensor[]): void {
    if (sensors.length !== EXPECTED_SENSOR_COUNT) {
      throw new Error(`El simulador requiere ${EXPECTED_SENSOR_COUNT} sensores activos; se encontraron ${sensors.length}`);
    }

    const identities = new Set(sensors.map(({ sensorId, type }) => sensorKey(sensorId, type)));
    if (identities.size !== EXPECTED_SENSOR_COUNT) {
      throw new Error('La configuración contiene identidades de sensor duplicadas');
    }
  }
}
