import { describe, expect, it } from 'vitest';
import { ToastSessions } from './toast-sessions';

describe('capture toast authorization', () => {
  it('requires the secret, originating tab and an embedded frame; prevents replay', () => {
    const sessions = new ToastSessions();
    const token = sessions.create(1, 'private-item', false, 100);
    expect(sessions.claim('invented', 1, 2, 101)).toBeUndefined();
    expect(sessions.claim(token, 2, 2, 101)).toBeUndefined();
    expect(sessions.claim(token, 1, 0, 101)).toBeUndefined();
    expect(sessions.claim(token, 1, 2, 101)?.itemId).toBe('private-item');
    expect(sessions.claim(token, 1, 3, 102)).toBeUndefined();
    expect(sessions.get(token, 1, 3, 102)).toBeUndefined();
    expect(sessions.get(token, 2, 2, 102)).toBeUndefined();
    expect(sessions.get(token, 1, 2, 102)?.itemId).toBe('private-item');
  });
  it('expires authorization and allows revocation only by its tab', () => {
    const sessions = new ToastSessions();
    const token = sessions.create(1, 'item', false, 0);
    sessions.claim(token, 1, 2, 1);
    sessions.revoke(token, 2);
    expect(sessions.get(token, 1, 2, 2)).toBeDefined();
    expect(sessions.get(token, 1, 2, 300_000)).toBeUndefined();
    sessions.revoke(token, 1);
    expect(sessions.get(token, 1, 2, 2)).toBeUndefined();
  });
  it('revokes previous prompts and navigation/tab closure authorization', () => {
    const sessions = new ToastSessions();
    const first = sessions.create(1, 'first', false, 0);
    const second = sessions.create(1, 'second', true, 1);
    expect(sessions.claim(first, 1, 2, 2)).toBeUndefined();
    expect(sessions.claim(second, 1, 2, 2)?.duplicate).toBe(true);
    sessions.revokeTab(1);
    expect(sessions.get(second, 1, 2, 3)).toBeUndefined();
  });
});
