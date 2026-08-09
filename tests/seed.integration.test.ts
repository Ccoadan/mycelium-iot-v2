import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { ControlState, Sensor, User } from '../src/models/index.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

describe('seed de MongoDB', () => {
  let mongodb: MongoMemoryServer;
  let connection: MongoConnection;
  const adminPassword = randomBytes(24).toString('base64url');
  const viewerPassword = randomBytes(24).toString('base64url');

  beforeAll(async () => {
    mongodb = await MongoMemoryServer.create({ instance: { dbName: 'seed_test' } });
    connection = new MongoConnection({
      uri: mongodb.getUri(),
      databaseName: 'seed_test',
      serverSelectionTimeoutMs: 10_000,
    });
  });

  afterAll(async () => {
    await connection.close();
    await mongodb.stop();
  });

  it('crea colecciones, documentos, hashes e índices de forma idempotente', async () => {
    const database = await connection.getDatabase();
    const options = {
      admin: { username: 'test-admin', password: adminPassword },
      viewer: { username: 'test-viewer', password: viewerPassword },
      bcryptRounds: 10,
    };

    await seedDatabase(database, options);
    const result = await seedDatabase(database, options);

    expect(result.sensors).toBe(21);
    expect(result.controlStates).toBe(1);
    expect(result.users).toBe(2);
    expect(await database.collection<Sensor>(COLLECTIONS.sensors).countDocuments({ bag: { $gte: 1, $lte: 9 } })).toBe(18);

    const control = await database.collection<ControlState>(COLLECTIONS.controlState).findOne({ _id: 'current' });
    expect(control?.relays).toHaveLength(4);

    const users = await database.collection<User>(COLLECTIONS.users).find().toArray();
    const admin = users.find(({ role }) => role === 'admin');
    const viewer = users.find(({ role }) => role === 'viewer');
    expect(admin && (await bcrypt.compare(adminPassword, admin.passwordHash))).toBe(true);
    expect(viewer && (await bcrypt.compare(viewerPassword, viewer.passwordHash))).toBe(true);
    expect(admin?.sessionVersion).toBeGreaterThanOrEqual(2);
    expect(viewer?.sessionVersion).toBeGreaterThanOrEqual(2);

    const indexes = await database.collection(COLLECTIONS.measurements).indexes();
    expect(indexes.map(({ name }) => name)).toContain('measurement_sensor_latest');
  });

  it('rechaza documentos que incumplen los validadores de dominio', async () => {
    const database = await connection.getDatabase();

    await expect(database.collection(COLLECTIONS.measurements).insertOne({
      sensorId: 0,
      type: 'invalid_measurement_type',
      value: 23.5,
      unit: '°C',
      timestamp: new Date(),
      source: 'simulator',
    })).rejects.toThrow();

    await expect(database.collection(COLLECTIONS.users).insertOne({
      username: 'Invalid Uppercase User',
      passwordHash: 'x'.repeat(60),
      role: 'viewer',
      active: true,
      sessionVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })).rejects.toThrow();
  });
});
