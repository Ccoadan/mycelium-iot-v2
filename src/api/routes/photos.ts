import { Hono, type Context } from 'hono';
import { z } from 'zod';

import type { RequestAuthentication } from '../../services/auth/cookie-authentication.js';
import { PhotoNotFoundError, type PhotoService } from '../../services/photos/photo-service.js';

const galleryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
const photoIdSchema = z.string().regex(/^[a-f0-9]{24}$/i);

export interface PhotoRouteDependencies {
  service: PhotoService;
  authentication: RequestAuthentication;
}

export function createPhotoRoutes(dependencies: PhotoRouteDependencies): Hono {
  const routes = new Hono();

  routes.get('/latest', async (context) => {
    return context.json(await dependencies.service.getLatest(), 200, { 'Cache-Control': 'no-store' });
  });

  routes.get('/latest/content', async (context) => {
    try {
      return photoContentResponse(await dependencies.service.getLatestContent(), 'no-store');
    } catch (error) {
      return photoError(context, error);
    }
  });

  routes.get('/', async (context) => {
    await dependencies.authentication.requireUser(context);
    const parsed = galleryQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json({ error: { code: 'VALIDATION_ERROR', message: 'La paginación de fotografías no es válida' } }, 400);
    }
    return context.json(
      await dependencies.service.getGallery(parsed.data.page, parsed.data.pageSize),
      200,
      { 'Cache-Control': 'no-store' },
    );
  });

  routes.get('/:id/content', async (context) => {
    await dependencies.authentication.requireUser(context);
    const parsedId = photoIdSchema.safeParse(context.req.param('id'));
    if (!parsedId.success) {
      return context.json({ error: { code: 'PHOTO_NOT_FOUND', message: 'La fotografía solicitada no existe' } }, 404);
    }
    try {
      const content = await dependencies.service.getContent(parsedId.data);
      return photoContentResponse(content, 'private, no-store');
    } catch (error) {
      return photoError(context, error);
    }
  });

  return routes;
}

function photoContentResponse(
  content: Awaited<ReturnType<PhotoService['getContent']>>,
  cacheControl: string,
): Response {
  const filename = content.filename.replace(/["\\\r\n]/g, '_');
  return new Response(Uint8Array.from(content.bytes).buffer, {
    status: 200,
    headers: {
      'Cache-Control': cacheControl,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(content.bytes.byteLength),
      'Content-Type': content.contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function photoError(context: Context, error: unknown): Response | Promise<Response> {
  if (error instanceof PhotoNotFoundError) {
    return context.json({ error: { code: 'PHOTO_NOT_FOUND', message: error.message } }, 404);
  }
  throw error;
}
