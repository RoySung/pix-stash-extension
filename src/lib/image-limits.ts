import { CaptureError } from './capture-errors';

export const IMAGE_LIMITS = { bytes: 20 * 1024 * 1024, pixels: 24_000_000, edge: 16_384, downloadMs: 15_000, decodeMs: 15_000 } as const;
export function checkDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new CaptureError('decode_failed');
  if (width > IMAGE_LIMITS.edge || height > IMAGE_LIMITS.edge || width * height > IMAGE_LIMITS.pixels) throw new CaptureError('dimensions');
}

// Inspect bounded raster bytes before invoking a native decoder. Unknown formats
// (including SVG) and animated formats fail closed and offer screenshot capture.
export function inspectRaster(bytes: Uint8Array): {width: number; height: number; mime: string} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  const result = (width: number, height: number, mime: string) => {
    checkDimensions(width, height);
    return {width, height, mime};
  };
  const invalid = (): never => { throw new CaptureError('decode_failed'); };
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 7) === 'PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR') {
    checkDimensions(view.getUint32(16), view.getUint32(20));
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + 12 + length > bytes.length) invalid();
      if (ascii(offset + 4, 4) === 'IHDR' && (offset !== 8 || length !== 13)) invalid();
      if (ascii(offset + 4, 4) === 'acTL') throw new CaptureError('unsupported');
      offset += length + 12;
    }
    return result(view.getUint32(16), view.getUint32(20), 'image/png');
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let dimensions: {width:number; height:number; mime:string} | undefined;
    for (let offset = 2; offset < bytes.length;) {
      if (bytes[offset++] !== 0xff) invalid();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) { if (dimensions) return dimensions; break; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) invalid();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) invalid();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) invalid();
        if (dimensions) invalid();
        dimensions = result(view.getUint16(offset + 5), view.getUint16(offset + 3), 'image/jpeg');
      }
      offset += length;
    }
    return invalid();
  }
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    const width = view.getUint16(6, true), height = view.getUint16(8, true);
    checkDimensions(width, height);
    let offset = 13 + ((bytes[10] & 128) ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0);
    let frames = 0;
    const skipBlocks = () => {
      while (offset < bytes.length) {
        const size = bytes[offset++];
        if (size === 0) return;
        offset += size;
      }
      invalid();
    };
    while (offset < bytes.length) {
      const tag = bytes[offset++];
      if (tag === 0x3b && frames === 1) return result(width, height, 'image/gif');
      if (tag === 0x21) { offset++; skipBlocks(); continue; }
      if (tag !== 0x2c || offset + 9 > bytes.length) invalid();
      if (++frames > 1) throw new CaptureError('unsupported');
      const frameWidth = view.getUint16(offset + 4, true), frameHeight = view.getUint16(offset + 6, true);
      checkDimensions(frameWidth, frameHeight);
      if (view.getUint16(offset, true) + frameWidth > width || view.getUint16(offset + 2, true) + frameHeight > height) invalid();
      const packed = bytes[offset + 8];
      offset += 9 + ((packed & 128) ? 3 * (2 ** ((packed & 7) + 1)) : 0);
      offset++; // LZW minimum code size
      skipBlocks();
    }
    return invalid();
  }
  if (bytes.length >= 25 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let canvas: {width:number; height:number; mime:string} | undefined;
    let image: {width:number; height:number; mime:string} | undefined;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = ascii(offset, 4);
      const length = view.getUint32(offset + 4, true);
      const data = offset + 8;
      if (data + length > bytes.length) invalid();
      if (chunk === 'ANIM' || chunk === 'ANMF') throw new CaptureError('unsupported');
      if (chunk === 'VP8X') {
        if (length !== 10) invalid();
        if (bytes[data] & 2) throw new CaptureError('unsupported');
        canvas = result(1 + (bytes[data+4] | bytes[data+5] << 8 | bytes[data+6] << 16), 1 + (bytes[data+7] | bytes[data+8] << 8 | bytes[data+9] << 16), 'image/webp');
      }
      if (chunk === 'VP8 ') {
        if (length < 10 || bytes[data+3] !== 0x9d || bytes[data+4] !== 0x01 || bytes[data+5] !== 0x2a) invalid();
        if (image) invalid();
        image = result(view.getUint16(data+6,true) & 0x3fff, view.getUint16(data+8,true) & 0x3fff, 'image/webp');
      }
      if (chunk === 'VP8L') {
        if (length < 5 || bytes[data] !== 0x2f || image) invalid();
        const bits = view.getUint32(data+1,true);
        image = result(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff), 'image/webp');
      }
      offset = data + length + (length & 1);
    }
    if (!image) return invalid();
    if (canvas && (canvas.width !== image.width || canvas.height !== image.height)) invalid();
    return canvas ?? image;
  }
  throw new CaptureError('unsupported');
}
