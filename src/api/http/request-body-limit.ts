import type { MiddlewareHandler } from 'hono';

export function requestBodyLimit(maxBytes: number): MiddlewareHandler {
  return async (context, next) => {
    const body = context.req.raw.body;
    if (!body) return next();

    const declaredLength = Number(context.req.header('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return payloadTooLarge(context);
    }

    let size = 0;
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return payloadTooLarge(context);
      }
      chunks.push(value);
    }

    const requestInit: RequestInit & { duplex: 'half' } = {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: 'half',
      headers: context.req.raw.headers,
    };
    context.req.raw = new Request(context.req.raw, requestInit);
    await next();
  };
}

function payloadTooLarge(context: Parameters<MiddlewareHandler>[0]): Response {
  return context.json(
    { error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud supera el límite permitido' } },
    413,
  );
}
