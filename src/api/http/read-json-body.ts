import type { Context } from 'hono';

import { ApiRequestError } from './api-request-error.js';

export async function readJsonBody(context: Context): Promise<unknown> {
  const mediaType = context.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json' && !mediaType?.endsWith('+json')) {
    throw new ApiRequestError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'La solicitud debe utilizar Content-Type application/json',
    );
  }

  try {
    return await context.req.json();
  } catch {
    throw new ApiRequestError(400, 'INVALID_JSON', 'El cuerpo JSON de la solicitud no es válido');
  }
}
