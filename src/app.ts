import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { createAuthRoutes, type AuthRouteDependencies } from './api/routes/auth.js';
import { createControlRoutes, type ControlRouteDependencies } from './api/routes/control.js';
import { createExportRoutes, type ExportRouteDependencies } from './api/routes/export.js';
import { createHealthRoutes, type HealthRouteDependencies } from './api/routes/health.js';
import { createMeasurementRoutes, type MeasurementRouteDependencies } from './api/routes/measurements.js';
import { createPhotoRoutes, type PhotoRouteDependencies } from './api/routes/photos.js';
import { createSensorRoutes } from './api/routes/sensors.js';
import { createSimulationRoutes, type SimulationRouteDependencies } from './api/routes/simulation.js';
import { ApiRequestError } from './api/http/api-request-error.js';
import { requestBodyLimit } from './api/http/request-body-limit.js';
import {
  AuthenticationRequiredError,
  AuthorizationError,
  InvalidCredentialsError,
  LoginRateLimitError,
} from './services/auth/auth-errors.js';

export const API_MAX_REQUEST_BODY_BYTES = 16 * 1024;

export interface AppDependencies extends Omit<HealthRouteDependencies, 'simulation'> {
  requestLogging?: boolean;
  measurements?: MeasurementRouteDependencies;
  simulation?: SimulationRouteDependencies;
  control?: ControlRouteDependencies;
  auth?: AuthRouteDependencies;
  exportCsv?: ExportRouteDependencies;
  photos?: PhotoRouteDependencies;
}

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();

  app.use('*', requestId());
  if (dependencies.requestLogging) {
    app.use('*', logger());
  }
  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'none'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    },
    permissionsPolicy: {
      camera: [],
      geolocation: [],
      microphone: [],
    },
    strictTransportSecurity: dependencies.appEnv === 'production',
    xFrameOptions: 'DENY',
  }));
  app.use('/api/*', async (context, next) => {
    await next();
    if (!context.res.headers.has('Cache-Control')) {
      context.res.headers.set('Cache-Control', 'no-store');
    }
  });
  app.use('/api/*', requestBodyLimit(API_MAX_REQUEST_BODY_BYTES));
  if (dependencies.auth) {
    app.route('/api/auth', createAuthRoutes(dependencies.auth));
  }
  app.route(
    '/api',
    createHealthRoutes({
      appEnv: dependencies.appEnv,
      database: dependencies.database,
      ...(dependencies.simulation ? { simulation: dependencies.simulation.service } : {}),
    }),
  );
  if (dependencies.simulation) {
    app.route('/api/simulation', createSimulationRoutes(dependencies.simulation));
  }
  if (dependencies.measurements) {
    app.route('/api/measurements', createMeasurementRoutes(dependencies.measurements));
    app.route(
      '/api/sensors',
      createSensorRoutes(dependencies.measurements.service, dependencies.measurements.authentication),
    );
  }
  if (dependencies.control) {
    app.route('/api/control', createControlRoutes(dependencies.control));
  }
  if (dependencies.exportCsv) {
    app.route('/api/export', createExportRoutes(dependencies.exportCsv));
  }
  if (dependencies.photos) {
    app.route('/api/photos', createPhotoRoutes(dependencies.photos));
  }

  app.onError((error, context) => {
    if (error instanceof InvalidCredentialsError) {
      return context.json({ error: { code: 'INVALID_CREDENTIALS', message: error.message } }, 401);
    }
    if (error instanceof AuthenticationRequiredError) {
      return context.json({ error: { code: 'AUTHENTICATION_REQUIRED', message: error.message } }, 401);
    }
    if (error instanceof AuthorizationError) {
      return context.json({ error: { code: 'FORBIDDEN', message: error.message } }, 403);
    }
    if (error instanceof LoginRateLimitError) {
      context.header('Retry-After', String(error.retryAfterSeconds));
      return context.json({ error: { code: 'LOGIN_RATE_LIMITED', message: error.message } }, 429);
    }
    if (error instanceof ApiRequestError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error('Unhandled request error', {
      requestId: context.get('requestId'),
      method: context.req.method,
      path: context.req.path,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return context.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Ocurrió un error inesperado',
          requestId: context.get('requestId'),
        },
      },
      500,
    );
  });

  app.notFound((context) => {
    if (context.req.path.startsWith('/api/')) {
      return context.json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } }, 404);
    }
    return context.text('Recurso no encontrado', 404);
  });

  return app;
}
