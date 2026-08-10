import type { Photo } from '../../models/index.js';
import type { PhotoRepository } from '../../repositories/photo-repository.js';
import type { PhotoStorage } from './photo-storage.js';

export interface PhotoView {
  id: string;
  filename: string;
  imageUrl: string;
  source: Photo['source'];
  capturedAt: string;
  publishedAt: string;
  metadata: Photo['metadata'];
}

export class PhotoNotFoundError extends Error {
  public constructor(message = 'La fotografía solicitada no existe') {
    super(message);
    this.name = 'PhotoNotFoundError';
  }
}

export class PhotoService {
  public constructor(
    private readonly repository: PhotoRepository,
    private readonly storage: PhotoStorage,
  ) {}

  public async getLatest(): Promise<{ photo: PhotoView | null }> {
    const photo = await this.repository.getLatest();
    return {
      photo: photo ? { ...toPhotoView(photo), imageUrl: '/api/photos/latest/content' } : null,
    };
  }

  public async getGallery(page: number, pageSize: number): Promise<{
    photos: PhotoView[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const result = await this.repository.getPage(page, pageSize);
    return {
      photos: result.photos.map(toPhotoView),
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  public async getContent(id: string): Promise<{
    bytes: Uint8Array;
    contentType: 'image/jpeg';
    filename: string;
  }> {
    const photo = await this.repository.getById(id);
    if (!photo) throw new PhotoNotFoundError();
    return this.readContent(photo);
  }

  public async getLatestContent(): Promise<{
    bytes: Uint8Array;
    contentType: 'image/jpeg';
    filename: string;
  }> {
    const photo = await this.repository.getLatest();
    if (!photo) throw new PhotoNotFoundError();
    return this.readContent(photo);
  }

  private async readContent(photo: Photo): Promise<{
    bytes: Uint8Array;
    contentType: 'image/jpeg';
    filename: string;
  }> {
    const content = await this.storage.read(photo.storageKey);
    if (!content) throw new PhotoNotFoundError('El archivo de la fotografía no está disponible');
    return { ...content, filename: photo.filename };
  }
}

function toPhotoView(photo: Photo): PhotoView {
  if (!photo._id) throw new Error('La fotografía persistida no tiene identificador');
  return {
    id: photo._id.toHexString(),
    filename: photo.filename,
    imageUrl: photo.publicUrl,
    source: photo.source,
    capturedAt: photo.capturedAt.toISOString(),
    publishedAt: photo.publishedAt.toISOString(),
    metadata: photo.metadata,
  };
}
