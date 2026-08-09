import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';

import { USER_ROLES, type AuditActor, type UserRole } from '../../models/index.js';
import type { UserRepository } from '../../repositories/user-repository.js';
import type { AuditService } from '../audit/audit-service.js';
import { AuthenticationRequiredError, InvalidCredentialsError } from './auth-errors.js';

const TOKEN_ISSUER = 'mycelium-iot-v2';
const TOKEN_AUDIENCE = 'mycelium-dashboard';
const tokenPayloadSchema = z.object({
  sub: z.string().regex(/^[a-f\d]{24}$/i),
  username: z.string().min(1),
  role: z.enum(USER_ROLES),
  ver: z.number().int().min(0),
  iat: z.number().int(),
  exp: z.number().int(),
  iss: z.literal(TOKEN_ISSUER),
  aud: z.union([z.literal(TOKEN_AUDIENCE), z.array(z.literal(TOKEN_AUDIENCE))]),
}).strict();

export interface AuthenticatedUser {
  id: ObjectId;
  username: string;
  role: UserRole;
  sessionVersion: number;
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export class AuthService {
  private dummyPasswordHash?: Promise<string>;

  public constructor(
    private readonly users: UserRepository,
    private readonly audit: AuditService,
    private readonly jwtSecret: string,
    private readonly sessionTtlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async login(username: string, password: string): Promise<AuthSession> {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await this.users.findByUsername(normalizedUsername);
    const passwordHash = user?.passwordHash ?? await this.getDummyPasswordHash();
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!user || !user.active || !user._id || !passwordMatches) {
      await this.audit.register({
        user: { username: normalizedUsername || 'unknown' },
        action: 'auth.login_failed',
        entity: 'user',
        details: { reason: 'invalid_credentials' },
        timestamp: this.now(),
      });
      throw new InvalidCredentialsError('Usuario o contraseña incorrectos');
    }

    const nowSeconds = Math.floor(this.now().getTime() / 1_000);
    const expiresAtSeconds = nowSeconds + this.sessionTtlSeconds;
    const token = await sign(
      {
        sub: user._id.toHexString(),
        username: user.username,
        role: user.role,
        ver: user.sessionVersion,
        iat: nowSeconds,
        exp: expiresAtSeconds,
        iss: TOKEN_ISSUER,
        aud: TOKEN_AUDIENCE,
      },
      this.jwtSecret,
      'HS256',
    );
    const authenticatedUser = toAuthenticatedUser(user);

    await this.audit.register({
      user: toAuditActor(authenticatedUser),
      action: 'auth.login',
      entity: 'user',
      entityId: user._id.toHexString(),
      details: { role: user.role, expiresAt: new Date(expiresAtSeconds * 1_000).toISOString() },
      timestamp: new Date(nowSeconds * 1_000),
    });

    return {
      token,
      expiresAt: new Date(expiresAtSeconds * 1_000).toISOString(),
      user: authenticatedUser,
    };
  }

  public async authenticateToken(token: string): Promise<AuthenticatedUser> {
    try {
      const payload = tokenPayloadSchema.parse(
        await verify(token, this.jwtSecret, {
          alg: 'HS256',
          iss: TOKEN_ISSUER,
          aud: TOKEN_AUDIENCE,
        }),
      );
      const user = await this.users.findActiveById(new ObjectId(payload.sub));
      if (
        !user ||
        !user._id ||
        user.username !== payload.username ||
        user.role !== payload.role ||
        user.sessionVersion !== payload.ver
      ) {
        throw new AuthenticationRequiredError('La sesión ya no es válida');
      }
      return toAuthenticatedUser(user);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) throw error;
      throw new AuthenticationRequiredError('Debe iniciar sesión');
    }
  }

  public async logout(user: AuthenticatedUser): Promise<void> {
    const timestamp = this.now();
    await this.users.invalidateSessions(user.id, timestamp);
    await this.audit.register({
      user: toAuditActor(user),
      action: 'auth.logout',
      entity: 'user',
      entityId: user.id.toHexString(),
      details: { sessionsInvalidated: true },
      timestamp,
    });
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= bcrypt.hash(randomUUID(), 12);
    return this.dummyPasswordHash;
  }
}

export function toAuditActor(user: AuthenticatedUser): AuditActor {
  return { id: user.id, username: user.username, role: user.role };
}

export function toPublicUser(user: AuthenticatedUser): { username: string; role: UserRole } {
  return { username: user.username, role: user.role };
}

function toAuthenticatedUser(user: {
  _id?: ObjectId;
  username: string;
  role: UserRole;
  sessionVersion: number;
}): AuthenticatedUser {
  if (!user._id) throw new AuthenticationRequiredError('El usuario no tiene una identidad válida');
  return {
    id: user._id,
    username: user.username,
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}
