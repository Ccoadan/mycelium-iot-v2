import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { AuthenticationRequiredError, AuthorizationError } from './auth-errors.js';
import {
  AuthService,
  type AuthSession,
  type AuthenticatedUser,
} from './auth-service.js';

export const DASHBOARD_REQUEST_HEADER = 'mycelium-dashboard';

export interface SessionCookieOptions {
  name: string;
  maxAgeSeconds: number;
  secure: boolean;
}

export interface RequestAuthentication {
  optionalUser(context: Context): Promise<AuthenticatedUser | null>;
  requireUser(context: Context): Promise<AuthenticatedUser>;
  requireAdmin(context: Context): Promise<AuthenticatedUser>;
  requireDashboardRequest(context: Context): void;
}

export class CookieAuthentication implements RequestAuthentication {
  public constructor(
    private readonly service: AuthService,
    private readonly cookie: SessionCookieOptions,
  ) {}

  public async login(username: string, password: string): Promise<AuthSession> {
    return this.service.login(username, password);
  }

  public setSession(context: Context, session: AuthSession): void {
    setCookie(context, this.cookie.name, session.token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: this.cookie.secure,
      path: '/',
      maxAge: this.cookie.maxAgeSeconds,
    });
  }

  public clearSession(context: Context): void {
    deleteCookie(context, this.cookie.name, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: this.cookie.secure,
      path: '/',
    });
  }

  public async optionalUser(context: Context): Promise<AuthenticatedUser | null> {
    const token = getCookie(context, this.cookie.name);
    if (!token) return null;
    try {
      return await this.service.authenticateToken(token);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) return null;
      throw error;
    }
  }

  public async requireUser(context: Context): Promise<AuthenticatedUser> {
    const token = getCookie(context, this.cookie.name);
    if (!token) throw new AuthenticationRequiredError('Debe iniciar sesión');
    return this.service.authenticateToken(token);
  }

  public async requireAdmin(context: Context): Promise<AuthenticatedUser> {
    const user = await this.requireUser(context);
    if (user.role !== 'admin') {
      throw new AuthorizationError('Esta acción requiere permisos de administrador');
    }
    return user;
  }

  public requireDashboardRequest(context: Context): void {
    if (context.req.header('X-Requested-With') !== DASHBOARD_REQUEST_HEADER) {
      throw new AuthorizationError('La solicitud modificadora no procede del dashboard');
    }
  }

  public async logout(user: AuthenticatedUser): Promise<void> {
    await this.service.logout(user);
  }
}
