import { CaptureError, withCaptureDeadline } from './capture-errors';
import { IMAGE_LIMITS, checkDimensions, inspectRaster } from './image-limits';
import type { RegionSelection } from './types';

interface DataUrlAsset {
  dataUrl: string;
  // Dimensions of the source image, independent of the preview resolution.
  width: number;
  height: number;
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function readRaster(url: string) {
  if (!/^(https?:|data:image\/)/i.test(url)) throw new CaptureError('unsupported');
  if (url.slice(0, 5).toLowerCase() === 'data:' && url.length > Math.ceil(IMAGE_LIMITS.bytes * 4 / 3) + 512) throw new CaptureError('too_large');
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); reject(new CaptureError('download_timeout')); }, IMAGE_LIMITS.downloadMs);
  });
  const download = async () => {
    let response: Response;
    try { response = await fetch(url, {signal: controller.signal}); }
    catch { throw new CaptureError('download_failed'); }
    if (!response.ok) throw new CaptureError('download_failed');
    if (Number(response.headers.get('content-length')) > IMAGE_LIMITS.bytes) {
      controller.abort();
      throw new CaptureError('too_large');
    }
    if (!response.body) throw new CaptureError('decode_failed');
    reader = response.body.getReader();
    const buffer = new Uint8Array(IMAGE_LIMITS.bytes);
    let length = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (length + value.byteLength > IMAGE_LIMITS.bytes) throw new CaptureError('too_large');
        buffer.set(value, length);
        length += value.byteLength;
      }
      const bytes = buffer.subarray(0, length);
      const info = inspectRaster(bytes);
      return {blob: new Blob([bytes], {type:info.mime}), ...info};
    } finally {
      // Cancellation is best effort and must not extend the operation's deadline.
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  try { return await Promise.race([download(), timeout]); }
  catch (error) {
    controller.abort();
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('download_failed');
  } finally { clearTimeout(timer!); }
}

async function decodeBitmap(blob: Blob) {
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const decode = createImageBitmap(blob).then(bitmap => {
    if (expired) { bitmap.close(); throw new CaptureError('processing_timeout'); }
    try { checkDimensions(bitmap.width, bitmap.height); }
    catch (error) { bitmap.close(); throw error; }
    return bitmap;
  });
  try {
    return await Promise.race([decode, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new CaptureError('processing_timeout')); }, IMAGE_LIMITS.decodeMs);
    })]);
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('decode_failed');
  } finally { clearTimeout(timer!); }
}

async function dataUrlToBitmap(dataUrl: string) {
  const raster = await readRaster(dataUrl);
  return decodeBitmap(raster.blob);
}

async function renderBitmap(bitmap: ImageBitmap, width: number, height: number, quality = 0.82) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await withCaptureDeadline(canvas.convertToBlob({ type: 'image/webp', quality }), IMAGE_LIMITS.decodeMs, 'processing_timeout');
  return blobToDataUrl(blob);
}

export async function createPreviewFromDataUrl(dataUrl: string, maxEdge = 820): Promise<DataUrlAsset> {
  const bitmap = await dataUrlToBitmap(dataUrl);
  try {
    const dominantEdge = Math.max(bitmap.width, bitmap.height);

    if (dominantEdge <= maxEdge) {
      return {
        dataUrl,
        width: bitmap.width,
        height: bitmap.height,
      };
    }

    const scale = maxEdge / dominantEdge;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    return {
      dataUrl: await renderBitmap(bitmap, width, height),
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally { bitmap.close(); }
}

export async function cropDataUrl(dataUrl: string, region: RegionSelection) {
  const bitmap = await dataUrlToBitmap(dataUrl);
  try {
    for (const value of [region.x, region.y, region.width, region.height, region.viewportWidth, region.viewportHeight]) {
      if (!Number.isFinite(value)) throw new CaptureError('dimensions');
    }
    if (region.viewportWidth <= 0 || region.viewportHeight <= 0 || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > region.viewportWidth + 1 || region.y + region.height > region.viewportHeight + 1) throw new CaptureError('dimensions');
    const scaleX = bitmap.width / region.viewportWidth;
    const scaleY = bitmap.height / region.viewportHeight;
    const sx = Math.max(0, Math.round(region.x * scaleX));
    const sy = Math.max(0, Math.round(region.y * scaleY));
    const sw = Math.max(1, Math.round(region.width * scaleX));
    const sh = Math.max(1, Math.round(region.height * scaleY));

    checkDimensions(sw, sh);
    const canvas = new OffscreenCanvas(sw, sh);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await withCaptureDeadline(canvas.convertToBlob({ type: 'image/png', quality: 0.96 }), IMAGE_LIMITS.decodeMs, 'processing_timeout');
    return blobToDataUrl(blob);
  } finally { bitmap.close(); }
}

let normalizing = false;
export async function normalizeExternalImage(url: string) {
  if (normalizing) throw new CaptureError('busy');
  normalizing = true;
  let bitmap: ImageBitmap | undefined;
  try {
    const raster = await readRaster(url);
    bitmap = await decodeBitmap(raster.blob);
    const original = await blobToDataUrl(raster.blob);
    const scale = Math.min(1, 820 / Math.max(bitmap.width, bitmap.height));
    const preview = scale === 1 ? original : await renderBitmap(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    return {original, preview, width:bitmap.width, height:bitmap.height};
  } finally {
    bitmap?.close();
    normalizing = false;
  }
}
