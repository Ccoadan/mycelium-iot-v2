import { LoginRateLimitError } from './auth-errors.js';

export interface LoginAttemptLimiterOptions {
  maxFailures: number;
  windowSeconds: number;
  blockSeconds: number;
  maxTrackedIdentifiers?: number;
}

interface LoginAttemptState {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number | null;
}

export interface LoginAttemptLimiter {
  assertAllowed(identifier: string): void;
  recordFailure(identifier: string): void;
  reset(identifier: string): void;
}

export class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter {
  private readonly attempts = new Map<string, LoginAttemptState>();
  private readonly maxTrackedIdentifiers: number;

  public constructor(
    private readonly options: LoginAttemptLimiterOptions,
    private readonly clock: () => number = () => Date.now(),
  ) {
    if (!Number.isInteger(options.maxFailures) || options.maxFailures < 1) {
      throw new Error('maxFailures debe ser un entero positivo');
    }
    this.maxTrackedIdentifiers = options.maxTrackedIdentifiers ?? 1_000;
  }

  public assertAllowed(identifier: string): void {
    const now = this.clock();
    const state = this.getCurrentState(identifier, now);
    if (state?.blockedUntil && state.blockedUntil > now) {
      throw new LoginRateLimitError(Math.max(1, Math.ceil((state.blockedUntil - now) / 1_000)));
    }
  }

  public recordFailure(identifier: string): void {
    const now = this.clock();
    this.pruneExpired(now);
    const state = this.getCurrentState(identifier, now) ?? {
      failures: 0,
      windowStartedAt: now,
      blockedUntil: null,
    };
    state.failures += 1;
    if (state.failures >= this.options.maxFailures) {
      state.blockedUntil = now + this.options.blockSeconds * 1_000;
    }
    if (!this.attempts.has(identifier) && this.attempts.size >= this.maxTrackedIdentifiers) {
      const oldest = this.attempts.keys().next().value as string | undefined;
      if (oldest) this.attempts.delete(oldest);
    }
    this.attempts.set(identifier, state);
  }

  public reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  private getCurrentState(identifier: string, now: number): LoginAttemptState | null {
    const state = this.attempts.get(identifier);
    if (!state) return null;
    if (state.blockedUntil !== null) {
      if (state.blockedUntil > now) return state;
      this.attempts.delete(identifier);
      return null;
    }
    if (now - state.windowStartedAt >= this.options.windowSeconds * 1_000) {
      this.attempts.delete(identifier);
      return null;
    }
    return state;
  }

  private pruneExpired(now: number): void {
    for (const [identifier, state] of this.attempts) {
      const expired = state.blockedUntil !== null
        ? state.blockedUntil <= now
        : now - state.windowStartedAt >= this.options.windowSeconds * 1_000;
      if (expired) this.attempts.delete(identifier);
    }
  }
}
