import { ObjectId } from 'mongodb';

import { COLLECTIONS } from '../database/collections.js';
import type { MongoConnection } from '../database/mongo-connection.js';
import type { Photo } from '../models/index.js';

export interface PhotoPage {
  photos: Photo[];
  total: number;
}

export class PhotoRepository {
  public constructor(private readonly connection: MongoConnection) {}

  public async getLatest(): Promise<Photo | null> {
    const database = await this.connection.getDatabase();
    return database.collection<Photo>(COLLECTIONS.photos).findOne({}, { sort: { capturedAt: -1, _id: -1 } });
  }

  public async getPage(page: number, pageSize: number): Promise<PhotoPage> {
    const database = await this.connection.getDatabase();
    const collection = database.collection<Photo>(COLLECTIONS.photos);
    const [photos, total] = await Promise.all([
      collection
        .find()
        .sort({ capturedAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
      collection.countDocuments(),
    ]);

    return { photos, total };
  }

  public async getById(id: string): Promise<Photo | null> {
    if (!ObjectId.isValid(id)) return null;
    const database = await this.connection.getDatabase();
    return database.collection<Photo>(COLLECTIONS.photos).findOne({ _id: new ObjectId(id) });
  }
}
