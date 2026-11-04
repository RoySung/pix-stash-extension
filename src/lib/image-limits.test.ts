import { describe, expect, it } from 'vitest';
import { inspectRaster, checkDimensions } from './image-limits';

function pngHeader(width = 1, height = 1) {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73,72,68,82], 12);
  view.setUint32(16, width); view.setUint32(20, height);
  return bytes;
}
describe('raster preflight', () => {
  it('reads PNG dimensions and rejects a pixel bomb before decode', () => {
    expect(inspectRaster(pngHeader(4000, 2000))).toEqual({width:4000, height:2000, mime:'image/png'});
    expect(() => inspectRaster(pngHeader(10000, 10000))).toThrow('dimensions');
    expect(() => checkDimensions(16_385, 1)).toThrow('dimensions');
    expect(() => checkDimensions(0, 1)).toThrow('decode_failed');
  });
  it('does not trust MIME labels or accept vectors and truncated files', () => {
    expect(() => inspectRaster(new TextEncoder().encode('<svg width="100000" height="100000"/>'))).toThrow('unsupported');
    expect(() => inspectRaster(pngHeader().subarray(0, 24))).toThrow('decode_failed');
  });
  it('rejects animated PNG and animated WebP before decoding', () => {
    const apng = new Uint8Array(53); apng.set(pngHeader());
    new DataView(apng.buffer).setUint32(33, 8);
    apng.set([97,99,84,76], 37);
    expect(() => inspectRaster(apng)).toThrow('unsupported');
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'),0); webp.set(new TextEncoder().encode('WEBPVP8X'),8);
    new DataView(webp.buffer).setUint32(16,10,true);
    webp[20] = 2;
    expect(() => inspectRaster(webp)).toThrow('unsupported');
  });
  it('reads GIF and JPEG dimensions', () => {
    const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), c=>c.charCodeAt(0));
    expect(inspectRaster(gif)).toEqual({width:1, height:1, mime:'image/gif'});
    const jpeg = new Uint8Array([255,216,255,192,0,8,8,0,10,0,20,1,255,218]);
    expect(inspectRaster(jpeg)).toEqual({width:20, height:10, mime:'image/jpeg'});
  });
});
