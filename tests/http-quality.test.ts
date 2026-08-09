import { describe, expect, it } from 'vitest';

import { API_MAX_REQUEST_BODY_BYTES, createApp } from '../src/app.js';

function qualityApp() {
  return createApp({
    appEnv: 'test',
    database: {
      databaseName: 'http_quality_test',
      checkHealth: async () => ({ available: true, latencyMs: 1 }),
    },
  });
}

describe('calidad transversal de HTTP', () => {
  it('protege las respuestas API con cabeceras seguras y sin cache', async () => {
    const response = await qualityApp().request('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).toBeNull();
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('rechaza cuerpos mayores de 16 KiB antes de llegar a una ruta', async () => {
    const oversizedBody = 'x'.repeat(API_MAX_REQUEST_BODY_BYTES + 1);
    const response = await qualityApp().request('/api/unknown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(oversizedBody.length),
      },
      body: oversizedBody,
    });

    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
