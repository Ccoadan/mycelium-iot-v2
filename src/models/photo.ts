import type { ObjectId } from 'mongodb';

export interface Photo {
  _id?: ObjectId;
  filename: string;
  storageKey: string;
  publicUrl: string;
  source: 'historical' | 'simulated-camera';
  capturedAt: Date;
  publishedAt: Date;
  metadata: {
    contentType: 'image/jpeg';
    sizeBytes?: number;
    width?: number;
    height?: number;
  };
}
