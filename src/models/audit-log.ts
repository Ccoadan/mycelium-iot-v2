import type { ObjectId } from 'mongodb';

import type { UserRole } from './user.js';

export interface AuditActor {
  id?: ObjectId;
  username: string;
  role?: UserRole;
}

export interface AuditLog {
  _id?: ObjectId;
  timestamp: Date;
  user: AuditActor;
  action: string;
  entity: string;
  entityId?: string;
  details: Record<string, unknown>;
}
