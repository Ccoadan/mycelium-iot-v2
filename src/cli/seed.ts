import 'dotenv/config';

import { loadConfig } from '../config/env.js';
import { loadSeedConfig } from '../config/seed-env.js';
import { MongoConnection } from '../database/mongo-connection.js';
import { seedDatabase } from '../services/seed/seed-database.js';

const config = loadConfig();
const seedConfig = loadSeedConfig();
const connection = new MongoConnection(config.mongodb);

try {
  const database = await connection.getDatabase();
  const result = await seedDatabase(database, seedConfig);
  console.info('Seed completado', result);
} catch (error) {
  console.error('No se pudo ejecutar el seed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await connection.close();
}
