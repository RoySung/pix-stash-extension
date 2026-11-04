import { afterEach, expect, it, vi } from 'vitest';
import { withCaptureDeadline, captureErrorCode, CaptureError } from './capture-errors';
afterEach(()=>vi.useRealTimers());
it('ends a UI wait when the background never responds', async()=>{
  vi.useFakeTimers();
  const result=expect(withCaptureDeadline(new Promise(()=>{}),100)).rejects.toThrow('no_response');
  await vi.advanceTimersByTimeAsync(100);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
it('clears waiting timers after both success and failure',async()=>{
  vi.useFakeTimers();
  expect(await withCaptureDeadline(Promise.resolve('saved'))).toBe('saved');
  await expect(withCaptureDeadline(Promise.reject(new CaptureError('too_large')))).rejects.toThrow('too_large');
  expect(captureErrorCode(new CaptureError('too_large'))).toBe('too_large');
  expect(vi.getTimerCount()).toBe(0);
});
