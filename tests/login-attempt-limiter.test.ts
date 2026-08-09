import { describe, expect, it } from 'vitest';

import { LoginRateLimitError } from '../src/services/auth/auth-errors.js';
import { InMemoryLoginAttemptLimiter } from '../src/services/auth/login-attempt-limiter.js';

describe('limitador de intentos de inicio de sesion', () => {
  it('mantiene el bloqueo completo aunque termine la ventana de conteo', () => {
    let now = 0;
    const limiter = new InMemoryLoginAttemptLimiter(
      { maxFailures: 2, windowSeconds: 60, blockSeconds: 120 },
      () => now,
    );

    limiter.recordFailure('admin');
    limiter.recordFailure('admin');
    expect(() => limiter.assertAllowed('admin')).toThrow(LoginRateLimitError);

    now = 61_000;
    expect(() => limiter.assertAllowed('admin')).toThrow(LoginRateLimitError);

    now = 120_001;
    expect(() => limiter.assertAllowed('admin')).not.toThrow();
  });

  it('elimina los fallos acumulados despues de un acceso correcto', () => {
    const limiter = new InMemoryLoginAttemptLimiter({
      maxFailures: 2,
      windowSeconds: 60,
      blockSeconds: 120,
    });

    limiter.recordFailure('viewer');
    limiter.reset('viewer');
    expect(() => limiter.assertAllowed('viewer')).not.toThrow();
  });
});
