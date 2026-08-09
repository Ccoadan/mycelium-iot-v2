import type { RecordAuditEvent } from '../../repositories/audit-repository.js';

export interface AuditEventRepository {
  record(event: RecordAuditEvent): Promise<void>;
}

export class AuditService {
  public constructor(private readonly repository: AuditEventRepository) {}

  public async register(event: RecordAuditEvent): Promise<void> {
    await this.repository.record(event);
  }
}
