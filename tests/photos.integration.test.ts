import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import { ensureDatabaseSchema } from '../src/database/schema.js';
import type { Photo } from '../src/models/index.js';
import { PhotoRepository } from '../src/repositories/photo-repository.js';
import { LocalPhotoStorage } from '../src/runtime/local-photo-storage.js';
import { AuthenticationRequiredError } from '../src/services/auth/auth-errors.js';
import type { AuthenticatedUser } from '../src/services/auth/auth-service.js';
import type { RequestAuthentication } from '../src/services/auth/cookie-authentication.js';
import { PhotoService } from '../src/services/photos/photo-service.js';

const viewer: AuthenticatedUser = {
  id: new ObjectId(),
  username: 'photo-viewer',
  role: 'viewer',
  sessionVersion: 1,
};

function authenticationFor(user: AuthenticatedUser | null): RequestAuthentication {
  return {
    optionalUser: async () => user,
    requireUser: async () => {
      if (!user) throw new AuthenticationRequiredError('Debe iniciar sesión');
      return user;
    },
    requireAdmin: async () => {
      if (!user) throw new AuthenticationRequiredError('Debe iniciar sesión');
      return user;
    },
    requireDashboardRequest: () => undefined,
  };
}

describe('API pública y protegida de fotografías', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  let storageRoot: string;
  let newestId: ObjectId;
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'photos_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'photos_test',
      serverSelectionTimeoutMs: 10_000,
    });
    const database = await connection.getDatabase();
    await ensureDatabaseSchema(database);

    storageRoot = await mkdtemp(join(tmpdir(), 'mycelium-photo-test-'));
    await mkdir(join(storageRoot, 'sample'));
    await Promise.all([
      writeFile(join(storageRoot, 'sample', 'older.jpg'), jpeg),
      writeFile(join(storageRoot, 'sample', 'newest.jpg'), jpeg),
    ]);
    newestId = new ObjectId();
    const olderId = new ObjectId();
    await database.collection<Photo>(COLLECTIONS.photos).insertMany([
      {
        _id: olderId,
        filename: 'older.jpg',
        storageKey: 'sample/older.jpg',
        publicUrl: `/api/photos/${olderId.toHexString()}/content`,
        source: 'historical',
        capturedAt: new Date('2026-07-01T06:00:00.000Z'),
        publishedAt: new Date('2026-08-09T16:00:00.000Z'),
        metadata: { contentType: 'image/jpeg', sizeBytes: jpeg.byteLength, width: 1600, height: 1200 },
      },
      {
        _id: newestId,
        filename: 'newest.jpg',
        storageKey: 'sample/newest.jpg',
        publicUrl: `/api/photos/${newestId.toHexString()}/content`,
        source: 'historical',
        capturedAt: new Date('2026-08-01T10:00:00.000Z'),
        publishedAt: new Date('2026-08-09T16:00:00.000Z'),
        metadata: { contentType: 'image/jpeg', sizeBytes: jpeg.byteLength, width: 1600, height: 1200 },
      },
    ]);
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
    await rm(storageRoot, { recursive: true, force: true });
  });

  function appFor(user: AuthenticatedUser | null) {
    return createApp({
      appEnv: 'test',
      database: connection,
      photos: {
        service: new PhotoService(new PhotoRepository(connection), new LocalPhotoStorage(storageRoot)),
        authentication: authenticationFor(user),
      },
    });
  }

  it('publica únicamente la última captura y protege la galería histórica', async () => {
    const anonymous = appFor(null);
    const latest = await anonymous.request('/api/photos/latest');
    expect(latest.status).toBe(200);
    expect(await latest.json()).toMatchObject({
      photo: {
        id: newestId.toHexString(),
        filename: 'newest.jpg',
        imageUrl: '/api/photos/latest/content',
        source: 'historical',
        capturedAt: '2026-08-01T10:00:00.000Z',
        metadata: { width: 1600, height: 1200 },
      },
    });

    const latestContent = await anonymous.request('/api/photos/latest/content');
    expect(latestContent.status).toBe(200);
    expect(latestContent.headers.get('content-type')).toBe('image/jpeg');
    expect(latestContent.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await latestContent.arrayBuffer())).toEqual(jpeg);

    const app = appFor(viewer);
    const gallery = await app.request('/api/photos?page=1&pageSize=1');
    expect(gallery.status).toBe(200);
    const galleryPayload = await gallery.json();
    expect(galleryPayload).toMatchObject({
      pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
      photos: [{ id: newestId.toHexString() }],
    });
    expect(JSON.stringify(galleryPayload)).not.toContain('storageKey');

    const content = await app.request(`/api/photos/${newestId.toHexString()}/content`);
    expect(content.status).toBe(200);
    expect(content.headers.get('content-type')).toBe('image/jpeg');
    expect(content.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(jpeg);
  });

  it('exige sesión para la galería y responde 404 para identificadores o archivos inexistentes', async () => {
    const anonymous = appFor(null);
    expect((await anonymous.request('/api/photos/latest')).status).toBe(200);
    expect((await anonymous.request('/api/photos')).status).toBe(401);
    expect((await anonymous.request(`/api/photos/${newestId.toHexString()}/content`)).status).toBe(401);

    const authenticated = appFor(viewer);
    const invalid = await authenticated.request('/api/photos/not-an-object-id/content');
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toMatchObject({ error: { code: 'PHOTO_NOT_FOUND' } });
    expect((await authenticated.request(`/api/photos/${new ObjectId().toHexString()}/content`)).status).toBe(404);
  });
});
