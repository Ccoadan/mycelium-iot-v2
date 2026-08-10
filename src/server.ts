import 'dotenv/config';

import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { MongoConnection } from './database/mongo-connection.js';
import { ConnectionAuditRepository } from './repositories/audit-repository.js';
import { ControlRepository } from './repositories/control-repository.js';
import { MeasurementRepository } from './repositories/measurement-repository.js';
import { PhotoRepository } from './repositories/photo-repository.js';
import { MongoSimulationRepository } from './repositories/simulation-repository.js';
import { UserRepository } from './repositories/user-repository.js';
import { attachNodeStaticRoutes } from './runtime/node-static.js';
import { LocalPhotoStorage } from './runtime/local-photo-storage.js';
import { AuditService } from './services/audit/audit-service.js';
import { AuthService } from './services/auth/auth-service.js';
import { CookieAuthentication } from './services/auth/cookie-authentication.js';
import { InMemoryLoginAttemptLimiter } from './services/auth/login-attempt-limiter.js';
import { ControlService } from './services/control/control-service.js';
import { CsvExportService } from './services/export/csv-export-service.js';
import { MeasurementQueryService } from './services/measurements/measurement-query-service.js';
import { PhotoService } from './services/photos/photo-service.js';
import { SimulationEngine } from './services/simulation/simulation-engine.js';
import { SimulationService } from './services/simulation/simulation-service.js';

const config = loadConfig();
const database = new MongoConnection(config.mongodb);
const simulationService = new SimulationService(
  new MongoSimulationRepository(database),
  new SimulationEngine(),
  config.simulation.intervalSeconds,
);
const measurementRepository = new MeasurementRepository(database);
const measurementQueryService = new MeasurementQueryService(
  measurementRepository,
  Math.max(config.simulation.intervalSeconds * 3, 60),
);
const auditService = new AuditService(new ConnectionAuditRepository(database));
const authentication = new CookieAuthentication(
  new AuthService(
    new UserRepository(database),
    auditService,
    config.auth.jwtSecret,
    config.auth.sessionTtlSeconds,
  ),
  {
    name: config.auth.cookieName,
    maxAgeSeconds: config.auth.sessionTtlSeconds,
    secure: config.auth.secureCookies,
  },
);
const controlService = new ControlService(
  new ControlRepository(database),
  auditService,
);
const app = createApp({
  appEnv: config.appEnv,
  database,
  requestLogging: true,
  auth: {
    authentication,
    loginAttemptLimiter: new InMemoryLoginAttemptLimiter(config.auth.loginRateLimit),
  },
  measurements: { service: measurementQueryService },
  simulation: {
    service: simulationService,
    controlEnabled: config.simulation.apiControlEnabled,
    authentication,
  },
  control: {
    service: controlService,
    authentication,
  },
  exportCsv: {
    service: new CsvExportService(measurementRepository, auditService),
    authentication,
  },
  photos: {
    service: new PhotoService(
      new PhotoRepository(database),
      new LocalPhotoStorage(config.photos.localRoot),
    ),
    authentication,
  },
});

attachNodeStaticRoutes(app);

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.info(`Mycelium IoT V2 disponible en http://${config.host}:${info.port}`);
    if (config.simulation.autoStart) {
      void simulationService.start({ username: 'system:auto-start' }).catch((error: unknown) => {
        console.error('No se pudo iniciar automáticamente el simulador', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }
  },
);

let shutdownStarted = false;

async function closeHttpServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.info(`Cierre solicitado por ${signal}`);
  try {
    await simulationService.stop({ username: 'system:shutdown' });
    await closeHttpServer();
    await database.close();
    process.exitCode = 0;
  } catch (error) {
    console.error('El servidor no pudo cerrarse limpiamente', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

export { app };
