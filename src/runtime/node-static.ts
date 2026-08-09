import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

export function attachNodeStaticRoutes(app: Hono): void {
  app.get('/', serveStatic({ path: './public/index.html' }));
  app.get('/css/*', serveStatic({ root: './public' }));
  app.get('/js/*', serveStatic({ root: './public' }));
  app.get('/images/*', serveStatic({ root: './public' }));
}
