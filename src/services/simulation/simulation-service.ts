import type { Measurement } from '../../models/index.js';
import type { SimulationPersistence } from '../../repositories/simulation-repository.js';
import { SimulationEngine } from './simulation-engine.js';

export const SIMULATION_INTERVAL_LIMITS = {
  minimumSeconds: 1,
  maximumSeconds: 86_400,
} as const;

export interface SimulationActor {
  username: string;
}

export interface SimulationCycleSummary {
  timestamp: string;
  measurements: number;
}

export interface SimulationStatus {
  running: boolean;
  intervalSeconds: number;
  cyclesCompleted: number;
  lastCycleAt: string | null;
  lastCycleMeasurements: number;
  lastError: 'SIMULATION_CYCLE_FAILED' | null;
}

export class SimulationService {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private currentCycle: Promise<SimulationCycleSummary> | undefined;
  private initialized = false;
  private cyclesCompleted = 0;
  private lastCycleAt: Date | undefined;
  private lastCycleMeasurements = 0;
  private lastError: 'SIMULATION_CYCLE_FAILED' | null = null;

  public constructor(
    private readonly persistence: SimulationPersistence,
    private readonly engine: SimulationEngine,
    private intervalSeconds: number,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.assertValidInterval(intervalSeconds);
  }

  public getStatus(): SimulationStatus {
    return {
      running: this.running,
      intervalSeconds: this.intervalSeconds,
      cyclesCompleted: this.cyclesCompleted,
      lastCycleAt: this.lastCycleAt?.toISOString() ?? null,
      lastCycleMeasurements: this.lastCycleMeasurements,
      lastError: this.lastError,
    };
  }

  public async start(actor: SimulationActor = { username: 'system' }): Promise<SimulationStatus> {
    if (this.running) {
      return this.getStatus();
    }

    this.running = true;
    try {
      const firstCycle = await this.runCycleInternal();
      await this.persistence.recordAudit({
        user: actor,
        action: 'simulation.started',
        entity: 'simulation',
        details: {
          intervalSeconds: this.intervalSeconds,
          firstCycleAt: firstCycle.timestamp,
          measurements: firstCycle.measurements,
        },
      });
      this.scheduleNextCycle();
      return this.getStatus();
    } catch (error) {
      this.running = false;
      this.captureCycleError(error);
      throw error;
    }
  }

  public async stop(actor: SimulationActor = { username: 'system' }): Promise<SimulationStatus> {
    if (!this.running) {
      return this.getStatus();
    }

    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.currentCycle;
    await this.persistence.recordAudit({
      user: actor,
      action: 'simulation.stopped',
      entity: 'simulation',
      details: {
        cyclesCompleted: this.cyclesCompleted,
        lastCycleAt: this.lastCycleAt?.toISOString() ?? null,
      },
    });
    return this.getStatus();
  }

  public async runOnce(actor: SimulationActor = { username: 'system' }): Promise<SimulationCycleSummary> {
    const result = await this.runCycleInternal();
    await this.persistence.recordAudit({
      user: actor,
      action: 'simulation.cycle_requested',
      entity: 'simulation',
      details: { ...result },
    });
    return result;
  }

  public async configureInterval(
    intervalSeconds: number,
    actor: SimulationActor = { username: 'system' },
  ): Promise<SimulationStatus> {
    this.assertValidInterval(intervalSeconds);
    const previousIntervalSeconds = this.intervalSeconds;
    this.intervalSeconds = intervalSeconds;

    if (this.running) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.scheduleNextCycle();
    }

    await this.persistence.recordAudit({
      user: actor,
      action: 'simulation.interval_changed',
      entity: 'simulation',
      details: { previousIntervalSeconds, intervalSeconds },
    });
    return this.getStatus();
  }

  private runCycleInternal(): Promise<SimulationCycleSummary> {
    if (this.currentCycle) {
      return this.currentCycle;
    }

    const operation = this.executeCycle();
    this.currentCycle = operation;
    void operation.then(
      () => {
        this.currentCycle = undefined;
      },
      () => {
        this.currentCycle = undefined;
      },
    );
    return operation;
  }

  private async executeCycle(): Promise<SimulationCycleSummary> {
    const sensors = await this.persistence.getActiveSensors();
    if (!this.initialized) {
      const latestMeasurements = await this.persistence.getLatestMeasurements();
      this.engine.initialize(sensors, latestMeasurements);
      this.initialized = true;
    }

    const timestamp = this.clock();
    const measurements: Measurement[] = this.engine.generateCycle(sensors, timestamp, this.intervalSeconds);
    await this.persistence.insertMeasurements(measurements);

    this.cyclesCompleted += 1;
    this.lastCycleAt = timestamp;
    this.lastCycleMeasurements = measurements.length;
    this.lastError = null;
    return { timestamp: timestamp.toISOString(), measurements: measurements.length };
  }

  private scheduleNextCycle(): void {
    if (!this.running) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runScheduledCycle();
    }, this.intervalSeconds * 1_000);
  }

  private async runScheduledCycle(): Promise<void> {
    try {
      await this.runCycleInternal();
    } catch (error) {
      this.captureCycleError(error);
    } finally {
      this.scheduleNextCycle();
    }
  }

  private captureCycleError(error: unknown): void {
    this.lastError = 'SIMULATION_CYCLE_FAILED';
    console.error('Simulation cycle failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  private assertValidInterval(intervalSeconds: number): void {
    if (
      !Number.isInteger(intervalSeconds) ||
      intervalSeconds < SIMULATION_INTERVAL_LIMITS.minimumSeconds ||
      intervalSeconds > SIMULATION_INTERVAL_LIMITS.maximumSeconds
    ) {
      throw new Error(
        `El intervalo debe ser un entero entre ${SIMULATION_INTERVAL_LIMITS.minimumSeconds} y ${SIMULATION_INTERVAL_LIMITS.maximumSeconds} segundos`,
      );
    }
  }
}
