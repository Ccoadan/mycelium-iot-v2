export interface StoredPhotoContent {
  bytes: Uint8Array;
  contentType: 'image/jpeg';
}

export const MAX_STORED_PHOTO_BYTES = 10 * 1024 * 1024;

export interface PhotoStorage {
  read(storageKey: string): Promise<StoredPhotoContent | null>;
}
