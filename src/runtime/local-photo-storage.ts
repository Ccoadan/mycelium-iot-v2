import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  MAX_STORED_PHOTO_BYTES,
  type PhotoStorage,
  type StoredPhotoContent,
} from '../services/photos/photo-storage.js';

export class LocalPhotoStorage implements PhotoStorage {
  private readonly root: string;

  public constructor(rootPath: string) {
    this.root = resolve(rootPath);
  }

  public async read(storageKey: string): Promise<StoredPhotoContent | null> {
    const filePath = this.resolveStorageKey(storageKey);
    if (!filePath) return null;

    try {
      const [realRoot, realFile] = await Promise.all([realpath(this.root), realpath(filePath)]);
      const relativePath = relative(realRoot, realFile);
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null;
      const fileStat = await stat(realFile);
      if (!fileStat.isFile() || fileStat.size < 4 || fileStat.size > MAX_STORED_PHOTO_BYTES) return null;
      const bytes = await readFile(realFile);
      if (!isJpeg(bytes)) return null;
      return { bytes, contentType: 'image/jpeg' };
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
  }

  private resolveStorageKey(storageKey: string): string | null {
    if (!/^[a-zA-Z0-9_./-]+\.jpe?g$/i.test(storageKey)) return null;
    const resolved = resolve(this.root, storageKey);
    const relativePath = relative(this.root, resolved);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null;
    return resolved;
  }
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isMissingFileError(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) return false;
  return ['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '');
}
