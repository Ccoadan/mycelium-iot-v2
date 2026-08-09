import bcrypt from 'bcryptjs';
import type { Db, UpdateFilter } from 'mongodb';

import { COLLECTIONS } from '../../database/collections.js';
import { ensureDatabaseSchema } from '../../database/schema.js';
import type { AuditLog, ControlState, Sensor, User, UserRole } from '../../models/index.js';
import { AuditRepository } from '../../repositories/audit-repository.js';
import { AuditService } from '../audit/audit-service.js';
import { createSensorFixtures } from './sensor-fixtures.js';

export interface SeedUserInput {
  username: string;
  password: string;
}

export interface SeedDatabaseOptions {
  admin: SeedUserInput;
  viewer: SeedUserInput;
  bcryptRounds: number;
}

export interface SeedDatabaseResult {
  sensors: number;
  controlStates: number;
  users: number;
  auditLogs: number;
}

async function upsertUser(
  database: Db,
  input: SeedUserInput,
  role: UserRole,
  bcryptRounds: number,
  now: Date,
): Promise<void> {
  const passwordHash = await bcrypt.hash(input.password, bcryptRounds);
  const update: UpdateFilter<User> = {
    $set: {
      passwordHash,
      role,
      active: true,
      updatedAt: now,
    },
    $setOnInsert: {
      username: input.username,
      createdAt: now,
    },
    $inc: {
      sessionVersion: 1,
    },
  };

  await database.collection<User>(COLLECTIONS.users).updateOne({ username: input.username }, update, { upsert: true });
}

export async function seedDatabase(database: Db, options: SeedDatabaseOptions): Promise<SeedDatabaseResult> {
  await ensureDatabaseSchema(database);
  const now = new Date();
  const sensors = createSensorFixtures(now);
  const sensorCollection = database.collection<Sensor>(COLLECTIONS.sensors);

  await sensorCollection.bulkWrite(
    sensors.map((sensor) => ({
      updateOne: {
        filter: { sensorId: sensor.sensorId, type: sensor.type },
        update: {
          $set: {
            key: sensor.key,
            name: sensor.name,
            location: sensor.location,
            unit: sensor.unit,
            active: sensor.active,
            updatedAt: now,
            ...(sensor.bag ? { bag: sensor.bag } : {}),
          },
          $setOnInsert: {
            sensorId: sensor.sensorId,
            type: sensor.type,
            createdAt: now,
          },
          ...(!sensor.bag ? { $unset: { bag: '' } } : {}),
        },
        upsert: true,
      },
    })),
  );

  const initialControlState: ControlState = {
    _id: 'current',
    relays: [
      { key: 'relay1', name: 'Ventilador de entrada', enabled: false },
      { key: 'relay2', name: 'Ventilador de salida', enabled: false },
      { key: 'relay3', name: 'Iluminación de cámara', enabled: false },
      { key: 'relay4', name: 'Relé auxiliar 4', enabled: false },
    ],
    lightingSource: 'simulation',
    updatedAt: now,
    updatedBy: 'system:seed',
  };

  const controlCollection = database.collection<ControlState>(COLLECTIONS.controlState);
  await controlCollection.updateOne(
    { _id: 'current' },
    { $setOnInsert: initialControlState },
    { upsert: true },
  );
  await Promise.all(
    initialControlState.relays.map((relay) =>
      controlCollection.updateOne(
        { _id: 'current' },
        { $set: { 'relays.$[target].name': relay.name } },
        { arrayFilters: [{ 'target.key': relay.key }] },
      ),
    ),
  );

  await Promise.all([
    upsertUser(database, options.admin, 'admin', options.bcryptRounds, now),
    upsertUser(database, options.viewer, 'viewer', options.bcryptRounds, now),
  ]);

  const auditService = new AuditService(
    new AuditRepository(database.collection<AuditLog>(COLLECTIONS.auditLogs)),
  );
  await auditService.register({
    user: { username: 'system' },
    action: 'database.seeded',
    entity: 'database',
    details: {
      sensorsConfigured: sensors.length,
      relaysConfigured: initialControlState.relays.length,
      usersConfigured: 2,
    },
    timestamp: now,
  });

  const [sensorCount, controlStateCount, userCount, auditLogCount] = await Promise.all([
    sensorCollection.countDocuments(),
    database.collection<ControlState>(COLLECTIONS.controlState).countDocuments(),
    database.collection<User>(COLLECTIONS.users).countDocuments(),
    database.collection<AuditLog>(COLLECTIONS.auditLogs).countDocuments(),
  ]);

  return {
    sensors: sensorCount,
    controlStates: controlStateCount,
    users: userCount,
    auditLogs: auditLogCount,
  };
}
