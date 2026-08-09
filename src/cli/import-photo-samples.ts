import 'dotenv/config';

import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { ObjectId } from 'mongodb';

import { loadConfig } from '../config/env.js';
import { COLLECTIONS } from '../database/collections.js';
import { MongoConnection } from '../database/mongo-connection.js';
import { ensureDatabaseSchema } from '../database/schema.js';
import type { Photo } from '../models/index.js';
import { ConnectionAuditRepository } from '../repositories/audit-repository.js';
import { readJpegDimensions } from '../runtime/jpeg-metadata.js';
import { AuditService } from '../services/audit/audit-service.js';
import { MAX_STORED_PHOTO_BYTES } from '../services/photos/photo-storage.js';

const MAX_SAMPLE_PHOTOS = 24;
const HISTORICAL_FILENAME = /^cam_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.jpe?g$/i;

async function collectJpegs(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJpegs(fullPath));
    else if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function capturedAtFromFilename(filename: string): Date | null {
  const match = HISTORICAL_FILENAME.exec(filename);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  if (!year || !month || !day || !hour || !minute || !second) return null;
  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] =
    [year, month, day, hour, minute, second].map(Number);
  if (
    yearNumber === undefined || monthNumber === undefined || dayNumber === undefined ||
    hourNumber === undefined || minuteNumber === undefined || secondNumber === undefined
  ) return null;
  const normalized = new Date(Date.UTC(
    yearNumber,
    monthNumber - 1,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
  ));
  if (
    normalized.getUTCFullYear() !== yearNumber || normalized.getUTCMonth() + 1 !== monthNumber ||
    normalized.getUTCDate() !== dayNumber || normalized.getUTCHours() !== hourNumber ||
    normalized.getUTCMinutes() !== minuteNumber || normalized.getUTCSeconds() !== secondNumber
  ) return null;
  const capturedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-05:00`);
  return Number.isFinite(capturedAt.getTime()) ? capturedAt : null;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const root = resolve(config.photos.localRoot);
  const connection = new MongoConnection(config.mongodb);

  try {
    const database = await connection.getDatabase();
    await ensureDatabaseSchema(database);
    const files = (await collectJpegs(root)).sort();
    if (files.length > MAX_SAMPLE_PHOTOS) {
      throw new Error(`La carpeta contiene ${files.length} imágenes; el importador admite hasta ${MAX_SAMPLE_PHOTOS}`);
    }

    const collection = database.collection<Photo>(COLLECTIONS.photos);
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    const publishedAt = new Date();

    for (const filePath of files) {
      const filename = filePath.slice(filePath.lastIndexOf(sep) + 1);
      const capturedAt = capturedAtFromFilename(filename);
      const fileStat = await stat(filePath);
      if (!capturedAt || fileStat.size < 4 || fileStat.size > MAX_STORED_PHOTO_BYTES) {
        skipped += 1;
        continue;
      }
      const bytes = await readFile(filePath);
      const dimensions = readJpegDimensions(bytes);
      if (!dimensions) {
        skipped += 1;
        continue;
      }

      const storageKey = relative(root, filePath).split(sep).join('/');
      const existing = await collection.findOne({ storageKey }, { projection: { _id: 1 } });
      const id = existing?._id ?? new ObjectId();
      const result = await collection.updateOne(
        { storageKey },
        {
          $set: {
            filename,
            storageKey,
            publicUrl: `/api/photos/${id.toHexString()}/content`,
            source: 'historical',
            capturedAt,
            metadata: {
              contentType: 'image/jpeg',
              sizeBytes: fileStat.size,
              width: dimensions.width,
              height: dimensions.height,
            },
          },
          $setOnInsert: { _id: id, publishedAt },
        },
        { upsert: true },
      );
      if (result.upsertedCount) inserted += 1;
      else if (result.modifiedCount) updated += 1;
      else unchanged += 1;
    }

    await new AuditService(new ConnectionAuditRepository(connection)).register({
      user: { username: 'system:photo-import' },
      action: 'photos.historical_sample_imported',
      entity: 'photos',
      details: { discovered: files.length, inserted, updated, unchanged, skipped },
    });

    console.info(JSON.stringify({ photos: { discovered: files.length, inserted, updated, unchanged, skipped } }, null, 2));
  } finally {
    await connection.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No fue posible importar la muestra fotográfica');
  process.exitCode = 1;
});
