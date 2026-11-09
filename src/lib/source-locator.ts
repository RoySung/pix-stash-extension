/** Local-only, versioned evidence. All geometry is in CSS pixels. */
export type LocatorMode = 'context_image' | 'page_image' | 'region_screenshot' | 'instant_screenshot';
export interface LocatorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ElementHint {
  id?: string;
  role?: string;
  path: {
    tag: string;
    index: number;
  }[];
}
export interface SourceAnchor {
  kind: 'image' | 'text' | 'element';
  urls: string[];
  text?: string;
  context?: string;
  alt?: string;
  hint: ElementHint;
  rect: LocatorRect;
  relative: {
    x: number;
    y: number;
  };
  weak: boolean;
}
export interface ScrollContext {
  hint?: ElementHint;
  x: number;
  y: number;
  ratioX: number;
  ratioY: number;
}
export interface SourceLocator {
  version: 1;
  capturedAt: number;
  captureMode: LocatorMode;
  truncated: boolean;
  page: {
    url: string;
    title: string;
    links: string[];
    verified?: { url: string; imageUrl: string; imageHash: string; verifiedAt: number };
  };
  viewport: {
    width: number;
    height: number;
    dpr: number;
  };
  captureRect: LocatorRect;
  scrollContexts: ScrollContext[];
  anchors: SourceAnchor[];
}
export const LOCATOR_LIMITS = { anchors: 12, text: 200, totalText: 2000, bytes: 32768, captureMs: 150, searchMs: 8000, scrolls: 6, contexts: 3 } as const;
export type RelocationStatus = 'found' | 'nearby' | 'ambiguous' | 'not-found' | 'unsupported' | 'cancelled';
export function httpUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096)
    return;
  try {
    const url = new URL(value, base);
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password)
      return url.href;
  }
  catch { /* Invalid evidence is ignored. */ }
}
export function normalizeLocatorText(value: string) { return value.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
export function distinctiveText(value: string) {
  const text = normalizeLocatorText(value);
  return text.length >= 8 && /\p{L}/u.test(text) && !/^[\d\s\p{P}\p{Sc}]+$/u.test(text);
}
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function number(value: unknown, max = 1e9): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
function string(value: unknown, max: number) { return typeof value === 'string' && value.length <= max; }
function rect(value: unknown): value is LocatorRect {
  return object(value) && typeof value.x === 'number' && Number.isFinite(value.x) && Math.abs(value.x) <= 1e9 && typeof value.y === 'number' && Number.isFinite(value.y) && Math.abs(value.y) <= 1e9 && number(value.width) && number(value.height);
}
function hint(value: unknown): value is ElementHint {
  return object(value) && (value.id === undefined || string(value.id, 200)) && (value.role === undefined || string(value.role, 80)) && Array.isArray(value.path) && value.path.length <= 8 && value.path.every((part: unknown) => object(part) && /^[a-z][a-z0-9-]{0,40}$/.test(part.tag) && number(part.index, 100000));
}
/** Reject unknown/oversized payloads instead of truncating JSON or trusting selectors. */
export function parseSourceLocator(value: unknown): SourceLocator | undefined {
  try {
    if (!object(value) || new TextEncoder().encode(JSON.stringify(value)).length > LOCATOR_LIMITS.bytes || value.version !== 1 || !number(value.capturedAt, 1e14) || typeof value.truncated !== 'boolean' || !['context_image', 'page_image', 'region_screenshot', 'instant_screenshot'].includes(value.captureMode))
      return;
    if (!object(value.page) || !httpUrl(value.page.url) || !string(value.page.title, 200) || !Array.isArray(value.page.links) || value.page.links.length > 3 || !value.page.links.every((url: unknown) => !!httpUrl(url)))
      return;
    const verified = value.page.verified;
    if (verified !== undefined && (!object(verified) || !httpUrl(verified.url) || new URL(verified.url).origin !== new URL(value.page.url).origin || !httpUrl(verified.imageUrl) || !/^[a-f0-9]{64}$/.test(verified.imageHash) || !number(verified.verifiedAt,1e14))) return;
    if (!object(value.viewport) || !number(value.viewport.width, 100000) || !number(value.viewport.height, 100000) || !number(value.viewport.dpr, 100) || value.viewport.dpr === 0 || !rect(value.captureRect))
      return;
    if (!Array.isArray(value.scrollContexts) || value.scrollContexts.length > 4 || !value.scrollContexts.every((ctx: unknown) => object(ctx) && (ctx.hint === undefined || hint(ctx.hint)) && number(ctx.x) && number(ctx.y) && number(ctx.ratioX, 1) && number(ctx.ratioY, 1)))
      return;
    let totalText = 0;
    if (!Array.isArray(value.anchors) || value.anchors.length > LOCATOR_LIMITS.anchors || !value.anchors.every((anchor: unknown) => {
      if (!object(anchor) || !['image', 'text', 'element'].includes(anchor.kind) || !Array.isArray(anchor.urls) || anchor.urls.length > 8 || !anchor.urls.every((url: unknown) => !!httpUrl(url)) || !hint(anchor.hint) || !rect(anchor.rect) || !object(anchor.relative) || !number(anchor.relative.x, 1) || !number(anchor.relative.y, 1) || typeof anchor.weak !== 'boolean')
        return false;
      for (const key of ['text', 'context', 'alt']) {
        if (anchor[key] !== undefined && !string(anchor[key], LOCATOR_LIMITS.text))
          return false;
        totalText += anchor[key]?.length ?? 0;
      }
      return true;
    }) || totalText > LOCATOR_LIMITS.totalText)
      return;
    // Clone to prevent later mutation by the message sender or caller.
    return JSON.parse(JSON.stringify(value)) as SourceLocator;
  }
  catch {
    return;
  }
}
export function fitSourceLocator(value: SourceLocator): SourceLocator | undefined {
  while (!parseSourceLocator(value) && value.anchors.length) {
    value.anchors.pop();
    value.truncated = true;
  }
  return parseSourceLocator(value);
}
export function sameSourceDocument(expected: string, actual: string) {
  try {
    const a = new URL(expected);
    const b = new URL(actual);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  }
  catch {
    return false;
  }
}
