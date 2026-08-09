import type { UpdateFilter } from 'mongodb';

import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { ControlState, RelayKey } from '../models/index.js';

export interface RelayUpdate {
  relay: RelayKey;
  enabled: boolean;
  updatedAt: Date;
  updatedBy: string;
}

export class ControlRepository {
  public constructor(private readonly connection: MongoConnection) {}

  public async getState(): Promise<ControlState | null> {
    const database = await this.connection.getDatabase();
    return database.collection<ControlState>(COLLECTIONS.controlState).findOne({ _id: 'current' });
  }

  public async updateRelay(update: RelayUpdate): Promise<ControlState | null> {
    const database = await this.connection.getDatabase();
    const setValues: Record<string, boolean | Date | string> = {
      'relays.$[target].enabled': update.enabled,
      updatedAt: update.updatedAt,
      updatedBy: update.updatedBy,
    };

    if (update.relay === 'relay3') {
      setValues.lightingSource = 'manual';
    }

    return database.collection<ControlState>(COLLECTIONS.controlState).findOneAndUpdate(
      { _id: 'current', 'relays.key': update.relay },
      { $set: setValues } as UpdateFilter<ControlState>,
      {
        arrayFilters: [{ 'target.key': update.relay }],
        returnDocument: 'after',
      },
    );
  }
}
