// Secrets stay in extension/content-script memory, never in the host DOM or URL.
export class ToastSessions {
  private sessions = new Map<string, {tabId: number; itemId: string; duplicate: boolean; expires: number; frameId?: number}>();
  create(tabId: number, itemId: string, duplicate: boolean, now = Date.now()) {
    for (const [token, session] of this.sessions) {
      if (session.tabId === tabId || session.expires <= now) this.sessions.delete(token);
    }
    const token = crypto.randomUUID();
    this.sessions.set(token, {tabId, itemId, duplicate, expires: now + 5 * 60_000});
    return token;
  }
  claim(token: string, tabId: number, frameId: number, now = Date.now()) {
    const session = this.sessions.get(token);
    if (!session || session.expires <= now || session.tabId !== tabId || frameId <= 0 || session.frameId !== undefined) return;
    session.frameId = frameId;
    return session;
  }
  get(token: string, tabId: number, frameId: number, now = Date.now()) {
    const session = this.sessions.get(token);
    return session && session.expires > now && session.tabId === tabId && session.frameId === frameId ? session : undefined;
  }
  revoke(token: string, tabId?: number) {
    if (tabId === undefined || this.sessions.get(token)?.tabId === tabId) this.sessions.delete(token);
  }
  revokeTab(tabId: number) {
    for (const [token, session] of this.sessions) if (session.tabId === tabId) this.sessions.delete(token);
  }
}
