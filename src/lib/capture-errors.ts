export const CAPTURE_ERROR_CODES = ['saved_notice_failed', 'busy', 'too_large', 'dimensions', 'download_timeout', 'processing_timeout', 'unsupported', 'download_failed', 'decode_failed', 'capture_failed', 'no_response'] as const;
export type CaptureErrorCode = typeof CAPTURE_ERROR_CODES[number];
export class CaptureError extends Error {
  constructor(public readonly code: CaptureErrorCode) { super(code); }
}
export function captureErrorCode(error: unknown): CaptureErrorCode {
  return error instanceof CaptureError ? error.code : 'capture_failed';
}
export function isCaptureErrorCode(value: unknown): value is CaptureErrorCode {
  return CAPTURE_ERROR_CODES.includes(value as CaptureErrorCode);
}
export const CAPTURE_WAIT_MS = 45_000;
// This ends the UI wait; it cannot cancel an operation already running in the background.
export function withCaptureDeadline<T>(operation: Promise<T>, ms = CAPTURE_WAIT_MS, code: CaptureErrorCode = 'no_response'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CaptureError(code)), ms);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
