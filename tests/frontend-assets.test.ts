import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('dashboard estático', () => {
  it('usa la interfaz V2 sin dependencias PHP ni el error ADC', async () => {
    const [html, javascript, css] = await Promise.all([
      readFile(resolve('public/index.html'), 'utf8'),
      readFile(resolve('public/js/dashboard.js'), 'utf8'),
      readFile(resolve('public/css/base.css'), 'utf8'),
    ]);

    expect(html).toContain('Módulo Hongos');
    expect(html).toContain('/js/dashboard.js');
    expect(javascript).toContain('/api/measurements/latest');
    expect(javascript).toContain('/api/control');
    expect(javascript).toContain('/api/auth/login');
    expect(javascript).toContain('/api/auth/logout');
    expect(javascript).toContain('/api/export/csv');
    expect(html).toContain('id="login-form"');
    expect(html).toContain('id="history-filters"');
    expect(html).toContain('id="history-table-body"');
    expect(html).toContain('/js/dashboard.js?v=9');
    expect(javascript).toContain("const { headers: additionalHeaders = {}, ...requestOptions } = options;");
    expect(html).toContain('id="photo-gallery"');
    expect(html).toContain('id="latest-photo-image"');
    expect(javascript).toContain('/api/photos/latest');
    expect(javascript).toContain("to: limaInputToIso(elements['history-to'].value, true)");
    expect(javascript).toContain('/api/photos?page=');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('data-relay="relay3"');
    expect(html).toContain('Iluminación de cámara');
    expect(css).toContain('.ios-toggle input:checked + i');
    expect(css).toContain('.auth-overlay');
    expect(html).toMatch(/id="auth-overlay"[^>]*hidden/);
    expect(html).toContain('id="login-continue"');
    expect(html).toContain('El monitoreo es público');
    expect(javascript).toContain('async function refreshLatestPhoto()');
    expect(javascript).toContain('async function refreshGallery(page = 1)');
    expect(javascript).toContain("showLogin('Inicia sesión para descargar las mediciones en formato CSV.')");
    expect(javascript).toContain("state.user?.role === 'admin'");
    expect(javascript).not.toMatch(/\.php\b/);
    expect(javascript).not.toContain('Humedad (ADC)');
    expect(css).toContain('--green: #34c759');
  });

  it('incluye las nueve ilustraciones legacy autorizadas', async () => {
    const sizes = await Promise.all(
      Array.from({ length: 9 }, (_, index) => stat(resolve(`public/images/bags/b${index + 1}.png`))),
    );

    expect(sizes).toHaveLength(9);
    expect(sizes.every(({ size }) => size > 100_000)).toBe(true);
  });
});
