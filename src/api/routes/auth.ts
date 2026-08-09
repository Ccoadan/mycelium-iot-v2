import { Hono } from 'hono';
import { z } from 'zod';

import { readJsonBody } from '../http/read-json-body.js';
import { InvalidCredentialsError } from '../../services/auth/auth-errors.js';
import type { CookieAuthentication } from '../../services/auth/cookie-authentication.js';
import { toPublicUser } from '../../services/auth/auth-service.js';
import type { LoginAttemptLimiter } from '../../services/auth/login-attempt-limiter.js';

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(1).max(128),
}).strict();

export interface AuthRouteDependencies {
  authentication: CookieAuthentication;
  loginAttemptLimiter?: LoginAttemptLimiter;
}

export function createAuthRoutes(dependencies: AuthRouteDependencies): Hono {
  const routes = new Hono();

  routes.post('/login', async (context) => {
    dependencies.authentication.requireDashboardRequest(context);
    const body = await readJsonBody(context);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Usuario o contraseña no válidos' } },
        400,
      );
    }

    const loginIdentifier = parsed.data.username.toLowerCase();
    dependencies.loginAttemptLimiter?.assertAllowed(loginIdentifier);
    try {
      const session = await dependencies.authentication.login(parsed.data.username, parsed.data.password);
      dependencies.loginAttemptLimiter?.reset(loginIdentifier);
      dependencies.authentication.setSession(context, session);
      return context.json({
        authenticated: true,
        user: toPublicUser(session.user),
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        dependencies.loginAttemptLimiter?.recordFailure(loginIdentifier);
      }
      throw error;
    }
  });

  routes.get('/me', async (context) => {
    const user = await dependencies.authentication.requireUser(context);
    return context.json({ authenticated: true, user: toPublicUser(user) });
  });

  routes.post('/logout', async (context) => {
    dependencies.authentication.requireDashboardRequest(context);
    const user = await dependencies.authentication.optionalUser(context);
    if (user) await dependencies.authentication.logout(user);
    dependencies.authentication.clearSession(context);
    return context.json({ authenticated: false });
  });

  return routes;
}
