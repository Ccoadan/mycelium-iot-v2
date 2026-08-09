import type { CreateIndexesOptions, Db, Document, IndexDescription } from 'mongodb';

import {
  CONTROL_SOURCES,
  RELAY_KEYS,
  SENSOR_TYPES,
  USER_ROLES,
  type AuditLog,
  type ControlState,
  type Measurement,
  type Photo,
  type Sensor,
  type User,
} from '../models/index.js';
import { COLLECTIONS } from './collections.js';

const collectionValidators: Record<string, Document> = {
  [COLLECTIONS.sensors]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sensorId', 'key', 'type', 'name', 'location', 'unit', 'active', 'createdAt', 'updatedAt'],
      properties: {
        sensorId: { bsonType: 'int', minimum: 0, maximum: 9 },
        key: { bsonType: 'string', minLength: 1, maxLength: 128 },
        name: { bsonType: 'string', minLength: 1, maxLength: 128 },
        type: {
          enum: SENSOR_TYPES,
        },
        location: { enum: ['environment', 'bag'] },
        bag: { bsonType: 'int', minimum: 1, maximum: 9 },
        unit: { enum: ['°C', '%', 'ppm'] },
        active: { bsonType: 'bool' },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
  [COLLECTIONS.measurements]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['sensorId', 'type', 'value', 'unit', 'timestamp', 'source'],
      properties: {
        sensorId: { bsonType: 'int', minimum: 0, maximum: 9 },
        type: {
          enum: SENSOR_TYPES,
        },
        bag: { bsonType: 'int', minimum: 1, maximum: 9 },
        value: { bsonType: ['double', 'int', 'long', 'decimal'] },
        unit: { enum: ['°C', '%', 'ppm'] },
        timestamp: { bsonType: 'date' },
        source: { enum: ['simulator', 'historical-import'] },
      },
    },
  },
  [COLLECTIONS.controlState]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'relays', 'lightingSource', 'updatedAt', 'updatedBy'],
      properties: {
        _id: { enum: ['current'] },
        relays: {
          bsonType: 'array',
          minItems: 4,
          maxItems: 4,
          items: {
            bsonType: 'object',
            required: ['key', 'name', 'enabled'],
            properties: {
              key: { enum: RELAY_KEYS },
              name: { bsonType: 'string' },
              enabled: { bsonType: 'bool' },
            },
          },
        },
        lightingSource: { enum: CONTROL_SOURCES },
        updatedAt: { bsonType: 'date' },
        updatedBy: { bsonType: 'string' },
      },
    },
  },
  [COLLECTIONS.users]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'passwordHash', 'role', 'active', 'sessionVersion', 'createdAt', 'updatedAt'],
      properties: {
        username: { bsonType: 'string', minLength: 3, maxLength: 64, pattern: '^[a-z0-9._-]+$' },
        passwordHash: { bsonType: 'string', minLength: 20, maxLength: 128 },
        role: { enum: USER_ROLES },
        active: { bsonType: 'bool' },
        sessionVersion: { bsonType: 'int', minimum: 0 },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
  [COLLECTIONS.auditLogs]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['timestamp', 'user', 'action', 'entity', 'details'],
      properties: {
        timestamp: { bsonType: 'date' },
        user: {
          bsonType: 'object',
          required: ['username'],
          properties: {
            id: { bsonType: 'objectId' },
            username: { bsonType: 'string', minLength: 1, maxLength: 128 },
            role: { enum: USER_ROLES },
          },
        },
        action: { bsonType: 'string', minLength: 1, maxLength: 128 },
        entity: { bsonType: 'string', minLength: 1, maxLength: 128 },
        entityId: { bsonType: 'string' },
        details: { bsonType: 'object' },
      },
    },
  },
  [COLLECTIONS.photos]: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['filename', 'storageKey', 'publicUrl', 'source', 'capturedAt', 'publishedAt', 'metadata'],
      properties: {
        filename: { bsonType: 'string', minLength: 1, maxLength: 255 },
        storageKey: { bsonType: 'string', minLength: 1, maxLength: 512 },
        publicUrl: { bsonType: 'string', minLength: 1, maxLength: 512 },
        source: { enum: ['historical', 'simulated-camera'] },
        capturedAt: { bsonType: 'date' },
        publishedAt: { bsonType: 'date' },
        metadata: {
          bsonType: 'object',
          required: ['contentType'],
          properties: {
            contentType: { enum: ['image/jpeg'] },
            sizeBytes: { bsonType: ['int', 'long'], minimum: 0, maximum: 10485760 },
            width: { bsonType: 'int', minimum: 1, maximum: 20000 },
            height: { bsonType: 'int', minimum: 1, maximum: 20000 },
          },
        },
      },
    },
  },
};

async function ensureCollections(database: Db): Promise<void> {
  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));

  for (const [name, validator] of Object.entries(collectionValidators)) {
    if (!existing.has(name)) {
      await database.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await database.command({
        collMod: name,
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
  }
}

async function createIndexes<T extends Document>(
  database: Db,
  collectionName: string,
  indexes: (IndexDescription & CreateIndexesOptions)[],
): Promise<void> {
  await database.collection<T>(collectionName).createIndexes(indexes);
}

export async function ensureDatabaseSchema(database: Db): Promise<void> {
  await ensureCollections(database);

  await Promise.all([
    createIndexes<Sensor>(database, COLLECTIONS.sensors, [
      { key: { sensorId: 1, type: 1 }, name: 'sensor_identity_unique', unique: true },
      { key: { key: 1 }, name: 'sensor_key_unique', unique: true },
      { key: { type: 1, bag: 1 }, name: 'sensor_type_bag' },
      { key: { active: 1 }, name: 'sensor_active' },
    ]),
    createIndexes<Measurement>(database, COLLECTIONS.measurements, [
      { key: { sensorId: 1, type: 1, timestamp: -1 }, name: 'measurement_sensor_latest' },
      { key: { type: 1, bag: 1, timestamp: -1 }, name: 'measurement_type_bag_history' },
      { key: { timestamp: -1 }, name: 'measurement_timestamp' },
    ]),
    createIndexes<ControlState>(database, COLLECTIONS.controlState, [
      { key: { updatedAt: -1 }, name: 'control_updated_at' },
    ]),
    createIndexes<User>(database, COLLECTIONS.users, [
      { key: { username: 1 }, name: 'user_username_unique', unique: true },
      { key: { role: 1, active: 1 }, name: 'user_role_active' },
    ]),
    createIndexes<AuditLog>(database, COLLECTIONS.auditLogs, [
      { key: { timestamp: -1 }, name: 'audit_timestamp' },
      { key: { 'user.username': 1, timestamp: -1 }, name: 'audit_user_history' },
      { key: { action: 1, entity: 1, timestamp: -1 }, name: 'audit_action_entity_history' },
    ]),
    createIndexes<Photo>(database, COLLECTIONS.photos, [
      { key: { storageKey: 1 }, name: 'photo_storage_key_unique', unique: true },
      { key: { capturedAt: -1 }, name: 'photo_captured_at' },
      { key: { source: 1, publishedAt: -1 }, name: 'photo_source_published' },
    ]),
  ]);
}
