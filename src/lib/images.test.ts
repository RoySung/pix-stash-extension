import { afterEach, expect, it, vi } from 'vitest';
import { createPreviewFromDataUrl, normalizeExternalImage } from './images';
import { IMAGE_LIMITS } from './image-limits';

function png(width = 1, height = 1) {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8,13); bytes.set([73,72,68,82],12);
  view.setUint32(16,width); view.setUint32(20,height);
  return bytes;
}
function decoder(width = 1, height = 1) {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({width,height,close}));
  return close;
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('retains source dimensions, reduces previews and releases bitmap memory', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(png(4000,2000))));
  const close = decoder(4000,2000);
  const canvasSize = vi.fn();
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(width: number, height: number) { canvasSize(width,height); }
    getContext() { return {drawImage:vi.fn()}; }
    async convertToBlob() { return new Blob(['preview'], {type:'image/webp'}); }
  });
  const preview = await createPreviewFromDataUrl('data:image/png;base64,');
  expect(canvasSize).toHaveBeenCalledWith(820,410);
  expect(preview).toEqual({dataUrl:'data:image/webp;base64,cHJldmlldw==',width:4000,height:2000});
  expect(close).toHaveBeenCalledOnce();
});
it('rejects an oversized Content-Length before reading or decoding', async () => {
  const body = new ReadableStream({start(controller) { controller.enqueue(new Uint8Array([1])); }});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body,{headers:{'content-length':String(IMAGE_LIMITS.bytes+1)}})));
  const close = decoder();
  await expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('too_large');
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});
it('limits actual streamed bytes even when Content-Length lies', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(IMAGE_LIMITS.bytes+1));}, cancel});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(body,{headers:{'content-length':'1'}})));
  decoder();
  await expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('too_large');
  expect(cancel).toHaveBeenCalled();
  expect(createImageBitmap).not.toHaveBeenCalled();
});
it('cancels a stalled download at the deadline', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal;
  vi.stubGlobal('fetch',vi.fn().mockImplementation((_url, options) => {signal=options.signal; return new Promise(()=>{});}));
  const result = expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('download_timeout');
  await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.downloadMs);
  await result;
  expect(signal!.aborted).toBe(true);
});
it('also times out a stalled response body', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new ReadableStream({pull() {return new Promise(()=>{});}}))));
  const result = expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('download_timeout');
  await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.downloadMs);
  await result;
});
it('rejects excessive header dimensions before native decode', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png(10000,10000))));
  decoder();
  await expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('dimensions');
  expect(createImageBitmap).not.toHaveBeenCalled();
});
it('closes a bitmap rejected after native dimension validation', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png())));
  const close = decoder(10000,10000);
  await expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('dimensions');
  expect(close).toHaveBeenCalledOnce();
});
it('times out decoding and closes a bitmap that arrives late', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(png())));
  let resolve: (value: unknown) => void;
  vi.stubGlobal('createImageBitmap',vi.fn().mockImplementation(()=>new Promise(done=>{resolve=done;})));
  const result = expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('processing_timeout');
  await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.decodeMs);
  await result;
  const close = vi.fn();
  resolve!({width:1,height:1,close});
  await vi.advanceTimersByTimeAsync(0);
  expect(close).toHaveBeenCalledOnce();
});
it('does not allow concurrent downloads to multiply the memory budget', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise(()=>{})));
  const first = expect(normalizeExternalImage('https://example.test/first')).rejects.toThrow('download_timeout');
  await expect(normalizeExternalImage('https://example.test/second')).rejects.toThrow('busy');
  await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.downloadMs);
  await first;
});
it('releases bitmap memory if preview encoding fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png(4000,2000))));
  const close = decoder(4000,2000);
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return {drawImage:vi.fn()}; }
    async convertToBlob() { throw new Error('encoding failed'); }
  });
  await expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('encoding failed');
  expect(close).toHaveBeenCalledOnce();
});
it('times out stuck encoding and releases its bitmap', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png(4000,2000))));
  const close = decoder(4000,2000);
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return {drawImage:vi.fn()}; }
    convertToBlob() { return new Promise<Blob>(()=>{}); }
  });
  const result=expect(normalizeExternalImage('https://example.test/image')).rejects.toThrow('processing_timeout');
  await vi.advanceTimersByTimeAsync(IMAGE_LIMITS.decodeMs);
  await result;
  expect(close).toHaveBeenCalledOnce();
});
