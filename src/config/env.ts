import { z } from 'zod';

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return value;
}, z.boolean());

const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI es obligatoria'),
  MONGODB_DB_NAME: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'MONGODB_DB_NAME contiene caracteres no permitidos'),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  SIMULATION_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(86_400).default(10),
  SIMULATION_AUTO_START: booleanFromEnvironment.default(false),
  SIMULATION_API_CONTROL_ENABLED: booleanFromEnvironment.default(true),
  JWT_SECRET: z.string().min(32).max(512),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(28_800),
  AUTH_COOKIE_NAME: z.string().trim().regex(/^[a-zA-Z0-9_-]+$/).default('mycelium_session'),
  AUTH_LOGIN_MAX_FAILURES: z.coerce.number().int().min(3).max(100).default(5),
  AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3_600).default(300),
  AUTH_LOGIN_BLOCK_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),
  PHOTO_STORAGE_LOCAL_ROOT: z.string().trim().min(1).default('./public/photos'),
});

export interface AppConfig {
  appEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  mongodb: {
    uri: string;
    databaseName: string;
    serverSelectionTimeoutMs: number;
  };
  simulation: {
    intervalSeconds: number;
    autoStart: boolean;
    apiControlEnabled: boolean;
  };
  auth: {
    jwtSecret: string;
    sessionTtlSeconds: number;
    cookieName: string;
    secureCookies: boolean;
    loginRateLimit: {
      maxFailures: number;
      windowSeconds: number;
      blockSeconds: number;
    };
  };
  photos: {
    localRoot: string;
  };
  presentationTimezone: 'America/Lima';
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración inválida: ${details}`);
  }

  return {
    appEnv: parsed.data.APP_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    mongodb: {
      uri: parsed.data.MONGODB_URI,
      databaseName: parsed.data.MONGODB_DB_NAME,
      serverSelectionTimeoutMs: parsed.data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    },
    simulation: {
      intervalSeconds: parsed.data.SIMULATION_INTERVAL_SECONDS,
      autoStart: parsed.data.SIMULATION_AUTO_START,
      apiControlEnabled: parsed.data.SIMULATION_API_CONTROL_ENABLED,
    },
    auth: {
      jwtSecret: parsed.data.JWT_SECRET,
      sessionTtlSeconds: parsed.data.AUTH_SESSION_TTL_SECONDS,
      cookieName: parsed.data.AUTH_COOKIE_NAME,
      secureCookies: parsed.data.APP_ENV === 'production',
      loginRateLimit: {
        maxFailures: parsed.data.AUTH_LOGIN_MAX_FAILURES,
        windowSeconds: parsed.data.AUTH_LOGIN_WINDOW_SECONDS,
        blockSeconds: parsed.data.AUTH_LOGIN_BLOCK_SECONDS,
      },
    },
    photos: {
      localRoot: parsed.data.PHOTO_STORAGE_LOCAL_ROOT,
    },
    presentationTimezone: 'America/Lima',
  };
}
