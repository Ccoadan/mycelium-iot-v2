import type { Collection, OptionalUnlessRequiredId } from 'mongodb';

import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { AuditActor, AuditLog } from '../models/index.js';

export interface RecordAuditEvent {
  user: AuditActor;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

export class AuditRepository {
  public constructor(private readonly collection: Collection<AuditLog>) {}

  public async record(event: RecordAuditEvent): Promise<void> {
    const document: OptionalUnlessRequiredId<AuditLog> = {
      timestamp: event.timestamp ?? new Date(),
      user: event.user,
      action: event.action,
      entity: event.entity,
      details: event.details ?? {},
      ...(event.entityId ? { entityId: event.entityId } : {}),
    };

    await this.collection.insertOne(document);
  }
}

export class ConnectionAuditRepository {
  public constructor(private readonly connection: MongoConnection) {}

  public async record(event: RecordAuditEvent): Promise<void> {
    const database = await this.connection.getDatabase();
    const repository = new AuditRepository(database.collection<AuditLog>(COLLECTIONS.auditLogs));
    await repository.record(event);
  }
}
