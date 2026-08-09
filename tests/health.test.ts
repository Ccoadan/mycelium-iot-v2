import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('devuelve 200 cuando MongoDB responde', async () => {
    const app = createApp({
      appEnv: 'test',
      database: {
        databaseName: 'test_database',
        checkHealth: async () => ({ available: true, latencyMs: 1 }),
      },
    });

    const response = await app.request('/api/health');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'ok',
      timezone: { storage: 'UTC', presentation: 'America/Lima' },
      services: { api: { status: 'up' }, mongodb: { status: 'up' } },
    });
  });

  it('devuelve 503 sin filtrar detalles cuando MongoDB no responde', async () => {
    const app = createApp({
      appEnv: 'test',
      database: {
        databaseName: 'test_database',
        checkHealth: async () => ({ available: false, latencyMs: 20 }),
      },
    });

    const response = await app.request('/api/health');
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ status: 'degraded', services: { mongodb: { status: 'down' } } });
    expect(JSON.stringify(payload)).not.toContain('error');
  });
});
