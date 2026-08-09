const START_OF_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export interface ImageDimensions {
  width: number;
  height: number;
}

export function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;

  while (offset + 8 < bytes.length) {
    offset = skipMarkerPrefix(bytes, offset);
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = readUint16(bytes, offset);
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (START_OF_FRAME_MARKERS.has(marker)) {
      const height = readUint16(bytes, offset + 3);
      const width = readUint16(bytes, offset + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    offset += segmentLength;
  }

  return null;
}

function skipMarkerPrefix(bytes: Uint8Array, offset: number): number {
  while (bytes[offset] === 0xff) offset += 1;
  return offset;
}

function readUint16(bytes: Uint8Array, offset: number): number | null {
  const high = bytes[offset];
  const low = bytes[offset + 1];
  return high === undefined || low === undefined ? null : (high << 8) | low;
}
