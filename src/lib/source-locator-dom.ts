import { foregroundImageScope } from './foreground-images';
import { loadedImageUrl } from './image-source';
import { fitSourceLocator, sameSourceDocument, httpUrl, LOCATOR_LIMITS, normalizeLocatorText, type ElementHint, type LocatorMode, type LocatorRect, type SourceAnchor, type SourceLocator } from './source-locator';
export const LOCATOR_UI_ATTRIBUTE = 'data-pixstash-ui';
const PRIVATE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],script,style,noscript,iframe,canvas,[data-pixstash-ui],#pixstash-region-overlay,.psc-overlay-actions';
export function excluded(element: Element): boolean {
  if (element.closest(PRIVATE))
    return true;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && excluded(root.host);
}
export function visible(element: Element) {
  if (excluded(element) || !element.getClientRects().length)
    return false;
  for (let parent: Element | null = element; parent;) {
    if (getComputedStyle(parent).opacity === '0')
      return false;
    const root = parent.getRootNode();
    parent = parent.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}
export function toRect(rect: DOMRect | DOMRectReadOnly): LocatorRect { return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }
export function intersection(a: LocatorRect, b: LocatorRect) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
export function elementHint(element: Element): ElementHint {
  const path: ElementHint['path'] = [];
  let node: Element | null = element;
  while (node && path.length < 8) {
    path.unshift({ tag: node.localName, index: node.parentElement ? Array.prototype.indexOf.call(node.parentElement.children, node) : 0 });
    node = node.parentElement;
  }
  const id = element.id;
  return { id: id && id.length <= 200 && !/\d{4}|[a-f\d]{12}|[:]/i.test(id) ? id : undefined, role: element.getAttribute('role')?.slice(0, 80), path };
}
export function resolveHint(hint: ElementHint): Element | undefined {
  if (hint.id) {
    // No interpolation into a selector. Duplicate IDs are not a unique identity.
    const matches = Array.from(document.querySelectorAll('[id]')).filter(el => el.id === hint.id);
    if (matches.length === 1)
      return matches[0];
  }
  let node: Element | undefined = document.documentElement;
  const path = hint.path;
  const start = path.findIndex(part => part.tag === 'html');
  if (start < 0)
    return;
  for (const part of path.slice(start + 1)) {
    node = node?.children[part.index];
    if (!node || node.localName !== part.tag)
      return;
  }
  return node;
}
/** A comma inside an image URL is not a srcset separator (for example CDN transforms). */
function srcsetUrls(value: string): string[] {
  const result: string[] = [];
  let remaining = value.slice(0, 8192);
  while (remaining && result.length < 8) {
    remaining = remaining.replace(/^[\s,]+/, '');
    const match = /^(\S+)([\s\S]*)$/.exec(remaining);
    if (!match)
      break;
    const token = match[1];
    remaining = match[2];
    if (token.endsWith(',')) {
      result.push(token.replace(/,+$/, ''));
      continue;
    }
    const separator = remaining.indexOf(',');
    const descriptor = (separator < 0 ? remaining : remaining.slice(0, separator)).trim();
    remaining = separator < 0 ? '' : remaining.slice(separator + 1);
    if (!descriptor || /^(?:\d+w|(?:\d*\.)?\d+x)$/.test(descriptor))
      result.push(token);
  }
  return result;
}
export function imageUrls(element: Element, includeLazy = true) {
  const urls: string[] = [];
  const add = (value: string | null | undefined) => {
    const url = httpUrl(value, document.baseURI);
    if (url && !urls.includes(url) && urls.length < 8)
      urls.push(url);
  };
  if (element instanceof HTMLImageElement) {
    add(loadedImageUrl(element));
    add(element.getAttribute('src'));
    for (const attr of includeLazy ? ['srcset', 'data-srcset'] : ['srcset'])
      for (const candidate of srcsetUrls(element.getAttribute(attr) ?? ''))
        add(candidate);
    if (includeLazy)
      for (const attr of ['data-src', 'data-original', 'data-lazy-src'])
        add(element.getAttribute(attr));
  }
  const background = getComputedStyle(element).backgroundImage;
  for (const match of background.matchAll(/url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g)) {
    const value = match[1] ?? match[2] ?? match[3];
    // Do not guess CSS escape decoding; a partial URL must never establish identity.
    if (!value.includes('\\'))
      add(value.trim());
  }
  return urls;
}
function contextText(element: Element) {
  const container = element.closest('article,figure,li,section,[role="listitem"]') ?? element.parentElement;
  const heading = container?.querySelector('h1,h2,h3,h4,figcaption');
  if (!heading || heading === element || heading.contains(element) || !visible(heading))
    return;
  // Avoid textContent on a large container and exclude editable descendants.
  return shortVisibleText(heading);
}
function shortVisibleText(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = '', node: Node | null, count = 0;
  while ((node = walker.nextNode()) && count++ < 30 && text.length < 200)
    if (node.parentElement && visible(node.parentElement))
      text += ` ${node.textContent?.slice(0, 200) ?? ''}`;
  return normalizeLocatorText(text).slice(0, 200) || undefined;
}
export interface DomAnchor {
  element: Element;
  anchor: SourceAnchor;
}
export function describeElement(element: Element, text?: string, urls = imageUrls(element), rect = toRect(element.getBoundingClientRect())): SourceAnchor {
  const style = getComputedStyle(element);
  return { kind: urls.length ? 'image' : text ? 'text' : 'element', urls, text,
    alt: element instanceof HTMLImageElement ? element.alt.slice(0, 200) || undefined : undefined,
    context: contextText(element), hint: elementHint(element), rect, relative: { x: 0, y: 0 },
    weak: !!element.closest('nav,header,footer,[role="navigation"]') || ['fixed', 'sticky'].includes(style.position),
  };
}
/** Incremental traversal includes open shadow roots; private subtrees are never entered. */
export function* domElements(root: Element | ShadowRoot = document.documentElement): Generator<Element> {
  const stack: Element[] = root instanceof Element ? [root] : Array.from(root.children).reverse();
  while (stack.length) {
    const element = stack.pop()!;
    if (excluded(element))
      continue;
    yield element;
    if (element.shadowRoot)
      for (let i = element.shadowRoot.children.length - 1; i >= 0; i--)
        stack.push(element.shadowRoot.children[i]);
    for (let i = element.children.length - 1; i >= 0; i--)
      stack.push(element.children[i]);
  }
}
function clippedScope(element: Element, scope: LocatorRect): LocatorRect {
  let result = { ...scope };
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (!/(hidden|clip|auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY))
      continue;
    const box = parent.getBoundingClientRect();
    const x = Math.max(result.x, box.x), y = Math.max(result.y, box.y);
    result = { x, y, width: Math.max(0, Math.min(result.x + result.width, box.right) - x), height: Math.max(0, Math.min(result.y + result.height, box.bottom) - y) };
  }
  return result;
}
/** Ranges keep text evidence tied to the actual painted selection rather than its parent. */
export function textAnchors(element: Element, scope?: LocatorRect): DomAnchor[] {
  const result: DomAnchor[] = [];
  if (!visible(element))
    return result;
  if (scope)
    scope = clippedScope(element, scope);
  for (const node of Array.from(element.childNodes).slice(0, 80)) {
    if (node.nodeType !== Node.TEXT_NODE)
      continue;
    const raw = node.textContent ?? '';
    if (!raw.trim())
      continue;
    // Do not save a prefix of an arbitrarily long paragraph as if it was the whole text.
    if (raw.length > 1000)
      continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const boxes = Array.from(range.getClientRects()).filter(box => box.width && box.height);
    if (!boxes.length || (scope && !boxes.some(box => intersection(toRect(box), scope))))
      continue;
    let text = normalizeLocatorText(raw);
    let box = toRect(range.getBoundingClientRect());
    if (scope && !boxes.every(rect => intersection(toRect(rect), scope) >= rect.width * rect.height * .98)) {
      // Partially selected lines: retain only characters that actually intersect the region.
      text = '';
      let first: LocatorRect | undefined;
      for (let i = 0; i < raw.length && text.length < 200; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const character = toRect(range.getBoundingClientRect());
        if (intersection(character, scope) > 0) {
          text += raw[i];
          first ??= character;
        }
      }
      text = normalizeLocatorText(text);
      if (first)
        box = first;
    }
    if (!text || text.length > 200)
      continue;
    result.push({ element, anchor: describeElement(element, text, [], box) });
  }
  return result;
}
let recentContext: {
  element: Element;
  url: string;
  at: number;
} | undefined;
export function rememberContextTarget(event: MouseEvent) {
  const element = event.composedPath().find(node => node instanceof HTMLImageElement);
  if (event.isTrusted && element instanceof Element)
    recentContext = { element, url: location.href, at: Date.now() };
}
export interface CaptureSnapshot {
  pageUrl: string;
  token: string;
  locator?: SourceLocator;
}
let snapshot: {
  token: string;
  at: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dpr: number;
  contexts: {
    element: Element;
    x: number;
    y: number;
  }[];
  geometry: {
    element: Element;
    rect: LocatorRect;
  }[];
} | undefined;
export function captureSourceLocator(mode: LocatorMode, rect?: LocatorRect, imageUrl?: string): CaptureSnapshot {
  const started = performance.now();
  const viewport = { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };
  const scope = rect ?? { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const anchors: DomAnchor[] = [];
  let truncated = false;
  const imageMode = mode === 'page_image' || mode === 'context_image';
  const foreground = mode === 'page_image' ? foregroundImageScope() : undefined;
  const equivalentLabels = new Set<string>();
  const target = mode === 'context_image' && recentContext && Date.now() - recentContext.at < 30000 && recentContext.url === location.href && recentContext.element.isConnected && imageUrls(recentContext.element).includes(imageUrl ?? '') ? recentContext.element : undefined;
  for (const element of domElements()) {
    if (performance.now() - started > LOCATOR_LIMITS.captureMs) {
      truncated = true;
      break;
    }
    if (!visible(element))
      continue;
    const box = toRect(element.getBoundingClientRect());
    if (!imageMode && !intersection(box, clippedScope(element, scope)))
      continue;
    const urls = imageUrls(element);
    if (imageMode) {
      if (urls.includes(imageUrl ?? '') && element instanceof HTMLImageElement && element.alt.trim().length >= 8)
        equivalentLabels.add(normalizeLocatorText(element.alt).slice(0, 200));
      if ((mode === 'context_image' ? element === target : urls.includes(imageUrl ?? '') && (!foreground || foreground.contains(element))))
        anchors.push({ element, anchor: describeElement(element, undefined, urls, box) });
    }
    else {
      if (urls.length)
        anchors.push({ element, anchor: describeElement(element, undefined, urls, box) });
      anchors.push(...textAnchors(element, scope));
    }
    if (anchors.length >= 120) {
      truncated = true;
      break;
    }
  }
  if (imageMode && anchors.length === 1 && equivalentLabels.size === 1 && (!anchors[0].anchor.alt || anchors[0].anchor.alt.length < 8)) {
    // A thumbnail's visible accessible label can identify the exact same resource in its preview.
    anchors[0].anchor.alt = [...equivalentLabels][0];
  }
  if (imageMode && anchors.length !== 1) {
    const ambiguous = anchors.length > 1;
    anchors.length = 0;
    const url = httpUrl(imageUrl);
    if (url)
      anchors.push({ element: document.documentElement, anchor: { kind: 'image', urls: [url], hint: { path: [] }, rect: { x: 0, y: 0, width: 0, height: 0 }, relative: { x: 0, y: 0 }, weak: ambiguous || (mode === 'page_image' && truncated) } });
  }
  // Prefer content and distribute anchors across the selected area.
  anchors.sort((a, b) => Number(a.anchor.weak) - Number(b.anchor.weak));
  const selected: DomAnchor[] = [];
  const seen = new Set<string>();
  if (!imageMode) {
    const bins = new Set<string>();
    anchors.sort((a, b) => {
      const rank = (entry: DomAnchor) => Number(entry.anchor.weak) * 100 + Math.floor((entry.anchor.rect.y - scope.y) / Math.max(1, scope.height / 4)) * 3 + Math.floor((entry.anchor.rect.x - scope.x) / Math.max(1, scope.width / 3));
      return rank(a) - rank(b);
    });
    const distributed: DomAnchor[] = [], rest: DomAnchor[] = [];
    for (const entry of anchors) {
      const bin = `${Math.floor((entry.anchor.rect.y - scope.y) / Math.max(1, scope.height / 4))}:${Math.floor((entry.anchor.rect.x - scope.x) / Math.max(1, scope.width / 3))}`;
      if (bins.has(bin))
        rest.push(entry);
      else {
        bins.add(bin);
        distributed.push(entry);
      }
    }
    anchors.splice(0, anchors.length, ...distributed, ...rest);
  }
  for (const candidate of anchors) {
    const key = candidate.anchor.urls[0] ?? candidate.anchor.text ?? '';
    if (seen.has(key))
      continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length === LOCATOR_LIMITS.anchors) {
      truncated ||= anchors.length > selected.length;
      break;
    }
  }
  if (!imageMode)
    selected.sort((a, b) => a.anchor.rect.y - b.anchor.rect.y);
  const top = document.scrollingElement ?? document.documentElement;
  const scrollContexts: SourceLocator['scrollContexts'] = [{ x: scrollX, y: scrollY, ratioX: scrollX / Math.max(1, top.scrollWidth - innerWidth), ratioY: scrollY / Math.max(1, top.scrollHeight - innerHeight) }];
  const contexts: {
    element: Element;
    x: number;
    y: number;
  }[] = [];
  for (const { element } of selected) {
    for (let parent = element.parentElement; parent && parent !== top && contexts.length < 3; parent = parent.parentElement) {
      if (contexts.some(ctx => ctx.element === parent))
        continue;
      const style = getComputedStyle(parent);
      if (!/(auto|scroll)/.test(style.overflowY + style.overflowX) || (parent.scrollHeight <= parent.clientHeight && parent.scrollWidth <= parent.clientWidth))
        continue;
      contexts.push({ element: parent, x: parent.scrollLeft, y: parent.scrollTop });
      scrollContexts.push({ hint: elementHint(parent), x: parent.scrollLeft, y: parent.scrollTop, ratioX: parent.scrollLeft / Math.max(1, parent.scrollWidth - parent.clientWidth), ratioY: parent.scrollTop / Math.max(1, parent.scrollHeight - parent.clientHeight) });
    }
  }
  const links: string[] = [];
  const finalRect = imageMode && selected[0]?.anchor.rect.width ? selected[0].anchor.rect : scope;
  for (const { element, anchor } of selected) {
    anchor.relative = { x: Math.max(0, Math.min(1, (anchor.rect.x - finalRect.x) / Math.max(1, finalRect.width))), y: Math.max(0, Math.min(1, (anchor.rect.y - finalRect.y) / Math.max(1, finalRect.height))) };
    const nearby = element.parentElement;
    const candidates: Element[] = [...(element.closest('a') ? [element.closest('a')!] : [])];
    if (imageMode && nearby && !['HTML','BODY','MAIN'].includes(nearby.tagName)) candidates.push(...Array.from(nearby.querySelectorAll('a[href]')).slice(0,12));
    for (const candidate of candidates) {
      if (!visible(candidate) || candidate.closest('form,[role="button"]') || candidate.hasAttribute('download')) continue;
      const link=httpUrl(candidate.getAttribute('href'),document.baseURI);
      if (link && new URL(link).origin===location.origin && !sameSourceDocument(link,location.href) && !links.includes(link) && links.length<3) links.push(link);
    }
  }
  const token = crypto.randomUUID();
  snapshot = { token, at: Date.now(), url: location.href, x: scrollX, y: scrollY, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, contexts, geometry: selected.map(({ element }) => ({ element, rect: toRect(element.getBoundingClientRect()) })) };
  const locator = fitSourceLocator({ version: 1, capturedAt: Date.now(), captureMode: mode, truncated, page: { url: location.href, title: document.title.slice(0, 200), links }, viewport, captureRect: finalRect, scrollContexts, anchors: selected.map(value => value.anchor) });
  return { token, locator, pageUrl: location.href };
}
export function verifySourceCapture(token: unknown) {
  const current = snapshot;
  return !!current && token === current.token && Date.now() - current.at < 3000 && location.href === current.url && scrollX === current.x && scrollY === current.y && innerWidth === current.width && innerHeight === current.height && devicePixelRatio === current.dpr && current.geometry.every(({ element, rect }) => { const now = element.getBoundingClientRect(); return element.isConnected && Math.abs(now.x - rect.x) < 1 && Math.abs(now.y - rect.y) < 1 && Math.abs(now.width - rect.width) < 1 && Math.abs(now.height - rect.height) < 1; }) && current.contexts.every(ctx => ctx.element.isConnected && ctx.element.scrollLeft === ctx.x && ctx.element.scrollTop === ctx.y);
}
