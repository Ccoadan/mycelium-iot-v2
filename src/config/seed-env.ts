import { z } from 'zod';

const seedEnvironmentSchema = z.object({
  SEED_ADMIN_USERNAME: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(128),
  SEED_VIEWER_USERNAME: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  SEED_VIEWER_PASSWORD: z.string().min(12).max(128),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
});

export interface SeedConfig {
  admin: { username: string; password: string };
  viewer: { username: string; password: string };
  bcryptRounds: number;
}

export function loadSeedConfig(environment: NodeJS.ProcessEnv = process.env): SeedConfig {
  const parsed = seedEnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración del seed inválida: ${details}`);
  }

  const adminUsername = parsed.data.SEED_ADMIN_USERNAME.toLowerCase();
  const viewerUsername = parsed.data.SEED_VIEWER_USERNAME.toLowerCase();

  if (adminUsername === viewerUsername) {
    throw new Error('Los usuarios admin y viewer deben ser diferentes');
  }

  return {
    admin: { username: adminUsername, password: parsed.data.SEED_ADMIN_PASSWORD },
    viewer: { username: viewerUsername, password: parsed.data.SEED_VIEWER_PASSWORD },
    bcryptRounds: parsed.data.BCRYPT_ROUNDS,
  };
}
