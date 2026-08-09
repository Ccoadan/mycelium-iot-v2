import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalPhotoStorage } from '../src/runtime/local-photo-storage.js';
import { MAX_STORED_PHOTO_BYTES } from '../src/services/photos/photo-storage.js';

describe('almacenamiento local de fotografias', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('rechaza recorridos de ruta y archivos que superan el limite', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mycelium-storage-quality-'));
    temporaryRoots.push(root);
    const oversized = join(root, 'oversized.jpg');
    await writeFile(oversized, new Uint8Array());
    await truncate(oversized, MAX_STORED_PHOTO_BYTES + 1);
    const storage = new LocalPhotoStorage(root);

    await expect(storage.read('../outside.jpg')).resolves.toBeNull();
    await expect(storage.read('oversized.jpg')).resolves.toBeNull();
  });
});
