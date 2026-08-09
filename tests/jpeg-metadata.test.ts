import { describe, expect, it } from 'vitest';

import { readJpegDimensions } from '../src/runtime/jpeg-metadata.js';

describe('metadatos JPEG', () => {
  it('lee dimensiones de un segmento SOF y rechaza contenido ajeno', () => {
    const jpegHeader = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);

    expect(readJpegDimensions(jpegHeader)).toEqual({ width: 1600, height: 1200 });
    expect(readJpegDimensions(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
