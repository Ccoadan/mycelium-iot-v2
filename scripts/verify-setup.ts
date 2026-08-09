import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';

import { serve } from '@hono/node-server';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app.js';
import { COLLECTIONS } from '../src/database/collections.js';
import { MongoConnection } from '../src/database/mongo-connection.js';
import type { AuditLog, ControlState, Sensor, User } from '../src/models/index.js';
import { attachNodeStaticRoutes } from '../src/runtime/node-static.js';
import { seedDatabase } from '../src/services/seed/seed-database.js';

const databaseName = 'mycelium_iot_v2_verification';
const adminPassword = randomBytes(24).toString('base64url');
const viewerPassword = randomBytes(24).toString('base64url');
const mongodb = await MongoMemoryServer.create({
  instance: { dbName: databaseName },
});
const connection = new MongoConnection({
  uri: mongodb.getUri(),
  databaseName,
  serverSelectionTimeoutMs: 10_000,
});

try {
  const database = await connection.getDatabase();
  const seedOptions = {
    admin: { username: 'verification-admin', password: adminPassword },
    viewer: { username: 'verification-viewer', password: viewerPassword },
    bcryptRounds: 10,
  };

  await seedDatabase(database, seedOptions);
  const secondSeedResult = await seedDatabase(database, seedOptions);

  const sensorCollection = database.collection<Sensor>(COLLECTIONS.sensors);
  const controlCollection = database.collection<ControlState>(COLLECTIONS.controlState);
  const userCollection = database.collection<User>(COLLECTIONS.users);
  const auditCollection = database.collection<AuditLog>(COLLECTIONS.auditLogs);

  const [environmentSensors, bagSensors, controlState, users, collections] = await Promise.all([
    sensorCollection.countDocuments({ location: 'environment' }),
    sensorCollection.countDocuments({ location: 'bag' }),
    controlCollection.findOne({ _id: 'current' }),
    userCollection.find().sort({ role: 1 }).toArray(),
    database.listCollections({}, { nameOnly: true }).toArray(),
  ]);

  assert.equal(secondSeedResult.sensors, 21, 'El seed debe conservar exactamente 21 sensores');
  assert.equal(secondSeedResult.controlStates, 1, 'Debe existir un único estado de control');
  assert.equal(secondSeedResult.users, 2, 'Deben existir dos usuarios de desarrollo');
  assert.equal(environmentSensors, 3, 'Deben existir tres sensores ambientales');
  assert.equal(bagSensors, 18, 'Deben existir dieciocho sensores de bolsa');
  assert.equal(controlState?.relays.length, 4, 'Deben existir cuatro relés');
  assert.equal(await database.collection(COLLECTIONS.measurements).countDocuments(), 0);
  assert.equal(await database.collection(COLLECTIONS.photos).countDocuments(), 0);
  assert.equal(collections.length, 6, 'Deben existir las seis colecciones de la fase 2');
  assert.equal(await auditCollection.countDocuments({ action: 'database.seeded' }), 2);

  const admin = users.find(({ role }) => role === 'admin');
  const viewer = users.find(({ role }) => role === 'viewer');
  assert.ok(admin && viewer, 'Deben existir los roles admin y viewer');
  assert.notEqual(admin.passwordHash, adminPassword, 'La contraseña admin no puede almacenarse en texto plano');
  assert.notEqual(viewer.passwordHash, viewerPassword, 'La contraseña viewer no puede almacenarse en texto plano');
  assert.equal(await bcrypt.compare(adminPassword, admin.passwordHash), true);
  assert.equal(await bcrypt.compare(viewerPassword, viewer.passwordHash), true);

  const measurementIndexes = await database.collection(COLLECTIONS.measurements).indexes();
  assert.ok(measurementIndexes.some(({ name }) => name === 'measurement_sensor_latest'));
  assert.ok(measurementIndexes.some(({ name }) => name === 'measurement_type_bag_history'));

  const app = createApp({ appEnv: 'test', database: connection });
  attachNodeStaticRoutes(app);
  const listening = await new Promise<{ server: ReturnType<typeof serve>; port: number }>((resolve) => {
    let httpServer!: ReturnType<typeof serve>;
    httpServer = serve({ fetch: app.fetch, port: 0 }, ({ port }) => resolve({ server: httpServer, port }));
  });

  let healthPayload: { status: string; services: { mongodb: { status: string } } };
  try {
    const [frontendResponse, healthResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${listening.port}/`),
      fetch(`http://127.0.0.1:${listening.port}/api/health`),
    ]);
    const frontendHtml = await frontendResponse.text();
    healthPayload = (await healthResponse.json()) as typeof healthPayload;
    assert.equal(frontendResponse.status, 200);
    assert.match(frontendHtml, /Mycelium IoT · V2/);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthPayload.status, 'ok');
    assert.equal(healthPayload.services.mongodb.status, 'up');
  } finally {
    await new Promise<void>((resolve, reject) => {
      listening.server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  console.info(
    JSON.stringify(
      {
        verification: 'ok',
        mongodb: 'real ephemeral mongod',
        collections: collections.map(({ name }) => name).sort(),
        documents: {
          sensors: secondSeedResult.sensors,
          environmentSensors,
          bagSensors,
          controlStates: secondSeedResult.controlStates,
          relays: controlState?.relays.length,
          users: secondSeedResult.users,
          auditLogs: secondSeedResult.auditLogs,
          measurements: 0,
          photos: 0,
        },
        frontendHttpStatus: 200,
        healthEndpoint: healthPayload.status,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.close();
  await mongodb.stop();
}
