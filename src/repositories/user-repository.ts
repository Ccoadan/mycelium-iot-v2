import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { User } from '../models/index.js';

export class UserRepository {
  public constructor(private readonly connection: MongoConnection) {}

  public async findByUsername(username: string): Promise<User | null> {
    const database = await this.connection.getDatabase();
    return database.collection<User>(COLLECTIONS.users).findOne({ username });
  }

  public async findActiveById(id: ObjectId): Promise<User | null> {
    const database = await this.connection.getDatabase();
    return database.collection<User>(COLLECTIONS.users).findOne({ _id: id, active: true });
  }

  public async invalidateSessions(id: ObjectId, updatedAt: Date): Promise<void> {
    const database = await this.connection.getDatabase();
    await database.collection<User>(COLLECTIONS.users).updateOne(
      { _id: id },
      { $inc: { sessionVersion: 1 }, $set: { updatedAt } },
    );
  }
}
import { ObjectId } from 'mongodb';
