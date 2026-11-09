import { MESSAGE } from './messages';
import { imageContentHash } from './images';
import { getItem, updateItem } from './items';
import { httpUrl, parseSourceLocator, sameSourceDocument, type SourceLocator } from './source-locator';
export interface RelocationJob {
  requestId: string;
  itemId: string;
  tabId: number;
  url: string;
  expires: number;
  documentUrl?: string;
  documentId?: string;
  started?: boolean;
  sessionFallback?: boolean;
  unsupported?: boolean;
  direct?: boolean;
  verifiedImageUrl?: string;
  verificationAttempts?: number;
}
const jobs = new Map<number, RelocationJob>();
const claims = new Set<number>();
const verificationLocks = new Set<string>();
const imageHashes = new Map<string, Promise<string>>();
const expirations = new Map<number, ReturnType<typeof setTimeout>>();
const key = (id: number) => `pixstash-relocation-${id}`;
async function readJob(tabId: number): Promise<RelocationJob | undefined> {
  const stored = await browser.storage.session?.get(key(tabId)).catch(() => undefined);
  const job = jobs.get(tabId) ?? stored?.[key(tabId)];
  if (!job || job.tabId !== tabId || typeof job.requestId !== 'string' || typeof job.itemId !== 'string' || !httpUrl(job.url) || !Number.isFinite(job.expires) || job.expires <= Date.now()) {
    await clearRelocation(tabId);
    return;
  }
  return job;
}
async function writeJob(job: RelocationJob) {
  jobs.set(job.tabId, job);
  clearTimeout(expirations.get(job.tabId));
  const expiry = setTimeout(() => { void clearRelocation(job.tabId); }, Math.max(0, job.expires - Date.now()));
  expiry.unref?.();
  expirations.set(job.tabId, expiry);
  try {
    if (!browser.storage.session)
      throw new Error('No session storage');
    await browser.storage.session.set({ [key(job.tabId)]: job });
  }
  catch {
    job.sessionFallback = true;
  }
}
export async function clearRelocation(tabId: number) {
  const previous = jobs.get(tabId);
  if (previous)
    imageHashes.delete(previous.requestId);
  jobs.delete(tabId);
  clearTimeout(expirations.get(tabId));
  expirations.delete(tabId);
  await browser.storage.session?.remove(key(tabId)).catch(() => { });
}
export async function openItemSource(itemId: unknown) {
  if (typeof itemId !== 'string')
    return { ok: false };
  const item = await getItem(itemId);
  const url = httpUrl(item?.sourceUrl);
  if (!item || !url)
    return { ok: false };
  let locator = parseSourceLocator(item.sourceLocator);
  if (locator && !sameSourceDocument(locator.page.url, url))
    locator = undefined;
  const legacyImage = item.captureMode === 'page_image' ? httpUrl(item.originalImageUrl) : undefined;
  const link = item.captureMode === 'page_image' && locator ? [locator.page.verified?.url, ...locator.page.links].map(value => httpUrl(value)).find(value => value && new URL(value).origin === new URL(url).origin && !sameSourceDocument(value, url)) : undefined;
  const destination = link ?? url;
  // Stage a blank tab first so a fast ready message cannot overtake job persistence.
  const tab = await browser.tabs.create({ url: 'about:blank' });
  if (tab.id === undefined)
    return { ok: false };
  if (locator || legacyImage)
    await writeJob({ requestId: crypto.randomUUID(), itemId, tabId: tab.id, url: destination, direct: !!link, expires: Date.now() + 45000 });
  try {
    await browser.tabs.update(tab.id, { url: destination });
  }
  catch {
    await clearRelocation(tab.id);
    return { ok: false };
  }
  return { ok: true };
}
export async function relocationReady(sender: {
  tab?: {
    id?: number;
  };
  frameId?: number;
  url?: string;
  documentId?: string;
}) {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0 || !sender.url || claims.has(tabId))
    return;
  claims.add(tabId);
  try {
    const job = await readJob(tabId);
    if (!job)
      return;
    // Redirects may continue on the same origin. Cross-origin/login redirects get no evidence.
    if (job.unsupported || new URL(sender.url).origin !== new URL(job.url).origin || /\/(login|signin|sign-in|auth)(\/|$)/i.test(new URL(sender.url).pathname)) {
      await clearRelocation(tabId);
      return { unsupported: true };
    }
    if (job.started)
      return;
    job.started = true;
    job.documentId = sender.documentId;
    job.documentUrl = sender.url;
    await writeJob(job);
    const expectedRequestId = job.requestId;
    const item = await getItem(job.itemId);
    if ((await readJob(tabId))?.requestId !== expectedRequestId || job.unsupported)
      return;
    if (!item) {
      await clearRelocation(tabId);
      return;
    }
    return { requestId: job.requestId, verifyLink: !!job.direct, locator: sameSourceDocument(item.sourceUrl, parseSourceLocator(item.sourceLocator)?.page.url ?? '') ? parseSourceLocator(item.sourceLocator) : undefined, originalImageUrl: item.captureMode === 'page_image' ? httpUrl(item.originalImageUrl) : undefined, previewUrl: item.previewUrl, sessionFallback: job.sessionFallback, expires: job.expires };
  }
  finally {
    claims.delete(tabId);
  }
}
export async function finishRelocation(message: {
  requestId?: unknown;
  status?: unknown;
}, sender: {
  tab?: {
    id?: number;
  };
  frameId?: number;
  documentId?: string;
}) {
  const id = sender.tab?.id;
  if (id === undefined || sender.frameId !== 0)
    return;
  const job = await readJob(id);
  if (!job || job.requestId !== message.requestId || (job.documentId && sender.documentId !== job.documentId))
    return;
  const requestId = job.requestId;
  if (job.direct && message.status === 'found' && job.verifiedImageUrl) {
    const item = await getItem(job.itemId);
    const locator = parseSourceLocator(item?.sourceLocator);
    const hash = await imageHashes.get(job.requestId)?.catch(() => undefined);
    if (item && locator && hash && await imageContentHash(item.imageUrl).catch(() => undefined) === hash && sameSourceDocument(item.sourceUrl, locator.page.url) && (await readJob(id))?.requestId === requestId) {
      await updateItem(item.id, { sourceLocator: { ...locator, page: { ...locator.page, verified: { url: job.documentUrl ?? job.url, imageUrl: job.verifiedImageUrl, imageHash: hash, verifiedAt: Date.now() } } } });
      await browser.runtime.sendMessage({ type: MESSAGE.libraryChanged }).catch(() => undefined);
    }
  }
  else if (job.direct && ['not-found', 'ambiguous', 'unsupported', 'nearby'].includes(String(message.status))) {
    const item = await getItem(job.itemId);
    const source = httpUrl(item?.sourceUrl);
    if (source && (await readJob(id))?.requestId === requestId) {
      await clearRelocation(id);
      await writeJob({ requestId: crypto.randomUUID(), itemId: job.itemId, tabId: id, url: source, expires: Date.now() + 45000 });
      await browser.tabs.update(id, { url: source });
      return;
    }
  }
  if ((await readJob(id))?.requestId === requestId) await clearRelocation(id);
}
export async function relocationNavigation(tabId: number, url: string) {
  const job = await readJob(tabId);
  if (!job || url === 'about:blank')
    return;
  if (job.started && url === (job.documentUrl ?? job.url))
    return;
  if (job.started || new URL(url).origin !== new URL(job.url).origin) {
    const oldRequestId = job.requestId;
    job.unsupported = true;
    job.started = false;
    job.documentId = undefined;
    job.requestId = crypto.randomUUID();
    await writeJob(job);
    await browser.tabs.sendMessage(tabId, { type: MESSAGE.relocationCancel, requestId: oldRequestId, unsupported: true }).catch(() => { });
  }
}
/** A return tab must work even when the browser/dev runtime did not auto-register content scripts. */
export async function ensureRelocationPage(tabId: number) {
  const job = await readJob(tabId);
  if (!job)
    return;
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (!httpUrl(tab?.url))
    return;
  try {
    const ready = await browser.tabs.sendMessage(tabId, { type: MESSAGE.relocationProbe }, { frameId: 0 });
    if (ready?.ok)
      return;
  }
  catch { /* The ordinary capture path can inject too; do the same for this bound return tab. */ }
  const current = await readJob(tabId);
  if (!current || current.requestId !== job.requestId)
    return;
  await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content-scripts/page-detect.js'] }).catch(() => undefined);
}
/** Only a bound top-level return document can ask to compare its observed image URLs. */
export async function verifySourceImages(message: {
  requestId?: unknown;
  urls?: unknown;
}, sender: {
  tab?: {
    id?: number;
  };
  frameId?: number;
  documentId?: string;
  url?: string;
}) {
  const id = sender.tab?.id;
  if (id === undefined || sender.frameId !== 0 || !Array.isArray(message.urls) || message.urls.length > 3 || !message.urls.every(value => !!httpUrl(value)))
    return;
  const job = await readJob(id);
  if (!job?.direct || job.requestId !== message.requestId || (job.documentId && job.documentId !== sender.documentId) || sender.url !== job.documentUrl || verificationLocks.has(job.requestId))
    return;
  const requestId = job.requestId, documentId = job.documentId;
  const item = await getItem(job.itemId);
  if (!item || item.captureMode !== 'page_image' || verificationLocks.has(requestId) || (await readJob(id))?.requestId !== requestId)
    return;
  const allowedOrigins = new Set([new URL(job.url).origin]);
  for (const value of [item.originalImageUrl, ...(parseSourceLocator(item.sourceLocator)?.anchors.flatMap(anchor => anchor.urls) ?? [])]) {
    const url = httpUrl(value);
    if (url)
      allowedOrigins.add(new URL(url).origin);
  }
  const urls = (message.urls as string[]).filter(value => allowedOrigins.has(new URL(value).origin));
  verificationLocks.add(requestId);
  try {
    let expected = imageHashes.get(requestId);
    if (!expected) {
      expected = imageContentHash(item.imageUrl);
      imageHashes.set(requestId, expected);
    }
    const digest = await expected;
    for (const value of urls) {
      const pending = await readJob(id);
      if (!pending || pending.requestId !== requestId || pending.documentId !== documentId)
        return;
      if ((job.verificationAttempts ?? 0) >= 3)
        break;
      job.verificationAttempts = (job.verificationAttempts ?? 0) + 1;
      await writeJob(job);
      const actual = await imageContentHash(value).catch(() => undefined);
      const current = await readJob(id);
      if (!current || current.requestId !== requestId || current.documentId !== documentId)
        return;
      if (actual === digest) {
        job.verifiedImageUrl = value;
        await writeJob(job);
        return { url: value };
      }
    }
  }
  catch { /* A verification failure falls back to the original page. */ }
  finally {
    verificationLocks.delete(requestId);
  }
}
export async function expireRelocations() {
  const stored = await browser.storage.session?.get(null).catch(() => undefined);
  const ids = new Set([...jobs.keys(), ...Object.keys(stored ?? {}).filter(value => value.startsWith('pixstash-relocation-')).map(value => Number(value.slice('pixstash-relocation-'.length)))]);
  for (const id of ids)
    await readJob(id);
}
export type RelocationPayload = {
  requestId: string;
  verifyLink?: boolean;
  locator?: SourceLocator;
  originalImageUrl?: string;
  previewUrl?: string;
  sessionFallback?: boolean;
  expires: number;
};
