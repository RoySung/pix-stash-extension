import { compareAnchor, reliableAnchor } from './source-locator-match';
import { describeElement, domElements, excluded, imageUrls, LOCATOR_UI_ATTRIBUTE, resolveHint, textAnchors, toRect, visible, type DomAnchor } from './source-locator-dom';
import { distinctiveText, httpUrl, LOCATOR_LIMITS, normalizeLocatorText, parseSourceLocator, type RelocationStatus, type SourceAnchor, type SourceLocator } from './source-locator';
import type { RelocationPayload } from './source-relocation';
export interface RelocationStrings {
  searching: string;
  found: string;
  nearby: string;
  ambiguous: string;
  'not-found': string;
  unsupported: string;
  cancelled: string;
  cancel: string;
  close: string;
  dismiss_highlight?: string;
  clues: string;
  original: string;
  retry: string;
  retry_search?: string;
}
function panel(strings: RelocationStrings, cancel: () => void) {
  const host = document.createElement('div');
  host.setAttribute(LOCATOR_UI_ATTRIBUTE, 'relocation');
  host.style.cssText = 'all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px)';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{color-scheme:light}section{box-sizing:border-box;background:#ece9d8;border:1px solid #8e99ab;border-radius:6px;box-shadow:0 4px 18px #0003;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;color:#20252b;font:14px/1.5 "Noto Sans TC","PingFang TC","Microsoft JhengHei","Segoe UI",sans-serif;padding:12px}p{margin:0 0 10px;overflow-wrap:anywhere}button,a{font:inherit;min-height:34px;box-sizing:border-box}button{border:1px solid #7f9db9;background:linear-gradient(180deg,#fff,#f4f3ed 48%,#e5e2d5);box-shadow:inset 1px 1px 0 #fff,inset -1px -1px 0 #d0cec3;border-radius:3px;font-size:13px;padding:4px 12px;cursor:pointer}button:hover{background:#eef4ff}button:active{background:#dceaff}button:focus-visible,a:focus-visible{outline:2px solid #154fb5;outline-offset:2px}img{max-width:100%;max-height:120px;display:block;object-fit:contain;margin:8px 0}a{display:inline-block;color:#154fb5;padding:4px 0}textarea{box-sizing:border-box;width:100%;min-height:70px;font:inherit;color:#242424;background:white;border:1px solid #7f9db9}';
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'PixStash');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = strings.searching;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = strings.cancel;
  button.onclick = cancel;
  section.append(status, button);
  root.append(style, section);
  document.documentElement.append(host);
  return { host, section, status, button };
}
function commonBlock(elements: Element[]): Element | undefined {
  let ancestor: Element | null = elements[0];
  while (ancestor && !elements.every(el => ancestor!.contains(el)))
    ancestor = ancestor.parentElement;
  if (!ancestor || ['HTML', 'BODY', 'MAIN'].includes(ancestor.tagName))
    return;
  return ancestor;
}
export interface MatchResult {
  status: 'found' | 'ambiguous' | 'not-found';
  elements: Element[];
}
export function matchDomAnchors(locator: SourceLocator, candidates: DomAnchor[], complete = true): MatchResult {
  let ambiguous = false;
  const matches: {
    saved: SourceAnchor;
    candidate: DomAnchor;
  }[] = [];
  for (const saved of locator.anchors) {
    if (saved.weak)
      continue;
    const possible = candidates.filter(candidate => {
      if (candidate.anchor.weak)
        return false;
      const evidence = compareAnchor(saved, candidate.anchor);
      return !evidence.contradiction && (evidence.exact || evidence.variant || (evidence.signed && (evidence.alt || evidence.context)) || evidence.text);
    });
    const strong = possible.filter(candidate => reliableAnchor(saved, candidate.anchor));
    const choices = strong.length ? strong : possible;
    if (choices.length > 1) {
      ambiguous = true;
      continue;
    }
    if (choices.length === 1)
      matches.push({ saved, candidate: choices[0] });
    if (complete && choices.length === 1 && strong.length === 1 && (locator.captureMode === 'context_image' || locator.captureMode === 'page_image'))
      return { status: 'found', elements: [choices[0].element] };
  }
  if (complete && matches.length >= 2) {
    const distinct = matches.filter((match, index, all) => all.findIndex(other => (other.saved.urls[0] ?? other.saved.text) === (match.saved.urls[0] ?? match.saved.text)) === index);
    const block = commonBlock(distinct.map(match => match.candidate.element));
    // One image plus its own alt isn't independent. Require two actual content anchors.
    const distribution = distinct.every((a, i) => distinct.slice(i + 1).every(b => {
      const oldY = a.saved.rect.y - b.saved.rect.y, newY = a.candidate.anchor.rect.y - b.candidate.anchor.rect.y;
      const oldX = a.saved.rect.x - b.saved.rect.x, newX = a.candidate.anchor.rect.x - b.candidate.anchor.rect.x;
      if (Math.abs(oldY) > 40 && Math.abs(newY) > 40 && Math.sign(oldY) !== Math.sign(newY))
        return false;
      if (Math.abs(oldX) > 80 && Math.abs(oldY) < 40 && Math.abs(newY) < 40 && Math.sign(oldX) !== Math.sign(newX))
        return false;
      return true;
    }));
    const bounds = block?.getBoundingClientRect();
    const compact = !!bounds && bounds.height <= Math.max(locator.captureRect.height * 2, innerHeight * 1.5) && bounds.width <= Math.max(locator.captureRect.width * 2, innerWidth * 1.5);
    if (distinct.length >= 2 && block && compact && distribution && distinct.every(match => match.saved.urls.length || distinctiveText(match.saved.text ?? '')))
      return { status: 'found', elements: [block] };
  }
  // A unique text with its own stable ID is independent content + identity evidence.
  if (complete && matches.length === 1 && (locator.captureMode === 'page_image' || locator.captureMode === 'context_image' || locator.anchors.filter(anchor => !anchor.weak).length === 1) && reliableAnchor(matches[0].saved, matches[0].candidate.anchor))
    return { status: 'found', elements: [matches[0].candidate.element] };
  return { status: ambiguous || !complete ? 'ambiguous' : 'not-found', elements: [] };
}
export function restoreScroll(locator: SourceLocator) {
  let restored = false;
  for (const context of locator.scrollContexts) {
    const element = context.hint ? resolveHint(context.hint) : document.scrollingElement;
    if (!element || (context.hint && !context.hint.id))
      continue; // Structural paths alone cannot identify a scroll owner safely.
    const maxX = Math.max(0, element.scrollWidth - element.clientWidth), maxY = Math.max(0, element.scrollHeight - element.clientHeight);
    if (!maxX && !maxY)
      continue;
    const x = Math.min(maxX, context.x <= maxX ? context.x : context.ratioX * maxX);
    const y = Math.min(maxY, context.y <= maxY ? context.y : context.ratioY * maxY);
    element.scrollTo({ left: x, top: y, behavior: 'instant' });
    restored = true;
  }
  return restored;
}
/** Returns a disposer immediately. Every terminal path removes movement, observers and timers. */
export function runSourceRelocation(payload: RelocationPayload, strings: RelocationStrings, report: (status: RelocationStatus) => void, verifyImages?: (urls:string[])=>Promise<string|undefined>) {
  const savedLocator = parseSourceLocator(payload.locator);
  const originalUrl = httpUrl(payload.originalImageUrl);
  // Earlier captures marked URL-only evidence weak when a preview duplicated its thumbnail.
  // Recheck only that exact saved resource against a complete, unique live match; never rewrite the item.
  const locator = savedLocator ? { ...savedLocator, anchors: savedLocator.anchors.map(anchor => savedLocator.captureMode === 'page_image' && originalUrl && anchor.weak && anchor.kind === 'image' && anchor.hint.path.length === 0 && !anchor.hint.id && anchor.rect.width === 0 && anchor.rect.height === 0 && anchor.urls.includes(originalUrl)
      ? { ...anchor, weak: false } : anchor) } : legacyLocator(originalUrl);
  let stopped = false, userControlled = false, observer: MutationObserver | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let retryDisposer: (()=>void)|undefined;
  let highlight: HTMLElement | undefined;
  let activeStyle: HTMLStyleElement | undefined;
  let activeElement: Element | undefined;
  let previousActive: string | null = null;
  let activeMark: string | undefined;
  let activeObserver: MutationObserver | undefined;
  let highlightFrame = 0, disposed = false;
  const initial = { x: scrollX, y: scrollY };
  const pending = new Set<Element>();
  const index = new Map<Element, DomAnchor[]>();
  const shadowRoots = new Set<ShadowRoot>();
  const ui = panel(strings, () => { userControlled = true; finish('cancelled'); });
  if (payload.sessionFallback) {
    const hint = document.createElement('p');
    hint.textContent = strings.retry;
    ui.section.append(hint);
  }
  const disposers: (() => void)[] = [];
  let removePanelTimer: ReturnType<typeof setTimeout> | undefined;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  function cleanupSearch() {
    observer?.disconnect();
    clearTimeout(timer);
    for (const dispose of disposers.splice(0))
      dispose();
    pending.clear();
    index.clear();
    shadowRoots.clear();
  }
  function finish(status: RelocationStatus, elements: Element[] = []) {
    if (stopped)
      return;
    stopped = true;
    cleanupSearch();
    report(status);
    ui.status.textContent = strings[status];
    ui.button.textContent = status === 'found' ? strings.dismiss_highlight ?? strings.close : strings.close;
    ui.button.onclick = dispose;
    if (status === 'found' && elements[0] && !userControlled) {
      const element = elements[0];
      activeElement = element;
      previousActive = element.getAttribute('data-pixstash-active');
      activeMark = crypto.randomUUID();
      element.setAttribute('data-pixstash-active', activeMark);
      activeStyle = document.createElement('style');
      activeStyle.setAttribute(LOCATOR_UI_ATTRIBUTE, 'active-style');
      activeStyle.textContent = `[data-pixstash-active="${CSS.escape(activeMark)}"]{outline:4px solid #154fb5!important;outline-offset:-4px!important}`;
      const root = element.getRootNode();
      (root instanceof ShadowRoot ? root : document.documentElement).append(activeStyle);
      if (element instanceof HTMLImageElement) {
        const initialAnchor = describeElement(element, undefined, imageUrls(element, false));
        activeObserver = new MutationObserver(() => {
          const current = describeElement(element, undefined, imageUrls(element, false));
          if (!element.isConnected || !reliableAnchor(initialAnchor, current))
            dispose();
        });
        activeObserver.observe(element, { attributes: true, attributeFilter: ['src', 'srcset', 'alt'] });
      }
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      // Let the browser dispatch our own instant scroll before listening for later movement.
      highlightFrame = requestAnimationFrame(() => {
        highlightFrame = requestAnimationFrame(() => {
          if (disposed || !element.isConnected)
            return;
          const rect = element.getBoundingClientRect();
          highlight = document.createElement('div');
          highlight.setAttribute(LOCATOR_UI_ATTRIBUTE, 'highlight');
          highlight.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #154fb5;border-radius:3px;box-sizing:border-box;left:${Math.max(0, rect.x)}px;top:${Math.max(0, rect.y)}px;width:${Math.min(rect.width, innerWidth)}px;height:${Math.min(rect.height, innerHeight)}px`;
          document.documentElement.append(highlight);
          highlightTimer = setTimeout(() => highlight?.remove(), 2200);
          addEventListener('scroll', removeHighlight, { once: true, capture: true });
        });
      });
    }
    if (!['found', 'cancelled'].includes(status)) {
      const preview = payload.previewUrl;
      if (typeof preview === 'string' && preview.startsWith('data:image/') && preview.length < 2000000) {
        const image = document.createElement('img');
        image.src = preview;
        image.alt = '';
        ui.section.append(image);
      }
      const clues = locator?.anchors.flatMap(anchor => anchor.text ? [anchor.text] : anchor.urls.map(url => {
        try {
          return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
        }
        catch {
          return '';
        }
      })).filter(Boolean).join('\n').slice(0, 2000);
      if (clues) {
        const text = document.createElement('textarea');
        text.readOnly = true;
        text.value = clues;
        text.setAttribute('aria-label', strings.clues);
        ui.section.append(text);
      }
      const original = httpUrl(payload.originalImageUrl);
      if (original) {
        const link = document.createElement('a');
        link.href = original;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = strings.original;
        ui.section.append(link);
      }
    }
    if (!payload.verifyLink && ['nearby','not-found','ambiguous','cancelled'].includes(status) && strings.retry_search) {
      const retry=document.createElement('button');retry.type='button';retry.textContent=strings.retry_search;retry.style.marginInlineStart='8px';
      retry.onclick=()=>{dispose();retryDisposer=runSourceRelocation({...payload,expires:Date.now()+LOCATOR_LIMITS.searchMs},strings,report,verifyImages);};ui.button.after(retry);
    }
    if (status !== 'found')
      removePanelTimer = setTimeout(dispose, 60000);
  }
  function removeHighlight() { highlight?.remove(); removeEventListener('scroll', removeHighlight, true); }
  function dispose() {
    retryDisposer?.();
    disposed = true;
    cancelAnimationFrame(highlightFrame);
    if (!stopped)
      finish('cancelled');
    cleanupSearch();
    activeObserver?.disconnect();
    activeStyle?.remove();
    if (activeElement && activeElement.getAttribute('data-pixstash-active') === activeMark) {
      if (previousActive === null)
        activeElement.removeAttribute('data-pixstash-active');
      else
        activeElement.setAttribute('data-pixstash-active', previousActive);
    }
    clearTimeout(removePanelTimer);
    clearTimeout(highlightTimer);
    removeHighlight();
    ui.host.remove();
    removeEventListener('pagehide', dispose);
  }
  function takeControl(event: Event) {
    if (!event.isTrusted || ui.host.contains(event.target as Node))
      return;
    if (event instanceof KeyboardEvent && !['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
      return;
    userControlled = true;
    finish('cancelled');
  }
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
    addEventListener(name, takeControl, { capture: true, passive: true });
    disposers.push(() => removeEventListener(name, takeControl, true));
  }
  const hide = () => {
    if (document.hidden) {
      userControlled = true;
      finish('cancelled');
    }
  };
  document.addEventListener('visibilitychange', hide);
  disposers.push(() => document.removeEventListener('visibilitychange', hide));
  const navigate = () => { userControlled = true; finish('cancelled'); };
  addEventListener('popstate', navigate);
  addEventListener('hashchange', navigate);
  disposers.push(() => { removeEventListener('popstate', navigate); removeEventListener('hashchange', navigate); });
  addEventListener('pagehide', dispose, { once: true });
  const deadline = Math.min(Date.now() + LOCATOR_LIMITS.searchMs, payload.expires);
  const delay = (ms: number) => new Promise<void>(resolve => { timer = setTimeout(resolve, ms); });
  async function scan(root: Element) {
    let chunk = performance.now();
    for (const element of domElements(root)) {
      if (stopped || Date.now() >= deadline)
        return false;
      if (index.size >= 8000 && !index.has(element))
        return false;
      if (element.shadowRoot && !shadowRoots.has(element.shadowRoot)) {
        shadowRoots.add(element.shadowRoot);
        observer?.observe(element.shadowRoot, { subtree: true, childList: true, characterData: true, attributes: true });
      }
      if (visible(element)) {
        const urls = imageUrls(element, false);
        const anchors = textAnchors(element);
        if (urls.length)
          anchors.push({ element, anchor: describeElement(element, undefined, urls) });
        if (anchors.length)
          index.set(element, anchors);
        else
          index.delete(element);
      }
      else
        index.delete(element);
      if (performance.now() - chunk > 12) {
        await delay(0);
        chunk = performance.now();
      }
    }
    return true;
  }
  function candidates() {
    const result: DomAnchor[] = [];
    for (const [element, entries] of index) {
      if (!element.isConnected || excluded(element)) {
        index.delete(element);
        continue;
      }
      if (!visible(element))
        continue;
      // Re-read live evidence: virtual lists may recycle a node between observer delivery and matching.
      const live = textAnchors(element);
      const urls = imageUrls(element, false);
      if (urls.length)
        live.push({ element, anchor: describeElement(element, undefined, urls) });
      result.push(...live);
    }
    return result;
  }
  const checkedImages=new Set<string>();
  async function matchCurrent(complete:boolean):Promise<MatchResult> {
    const current=candidates();
    if(!payload.verifyLink) return matchDomAnchors(locator!,current,complete);
    if(!complete || !verifyImages) return {status:'not-found',elements:[]};
    const images=current.filter(entry=>entry.anchor.kind==='image' && !entry.anchor.weak && entry.anchor.rect.width*entry.anchor.rect.height>=40000);
    images.sort((a,b)=>b.anchor.rect.width*b.anchor.rect.height-a.anchor.rect.width*a.anchor.rect.height);
    const primary=images[0], second=images.find(entry=>entry.element!==primary?.element);
    if(!primary || (second && primary.anchor.rect.width*primary.anchor.rect.height < second.anchor.rect.width*second.anchor.rect.height*1.35)) return {status:'not-found',elements:[]};
    const urls=primary.anchor.urls.filter(url=>!checkedImages.has(url)).slice(0,3);
    for(const url of urls)checkedImages.add(url);
    if(!urls.length) return {status:'not-found',elements:[]};
    const verified=await verifyImages(urls).catch(()=>undefined);
    if(stopped || !verified || !primary.element.isConnected || !imageUrls(primary.element,false).includes(verified)) return {status:'not-found',elements:[]};
    return {status:'found',elements:[primary.element]};
  }
  async function search() {
    if (!locator || document.hidden) {
      finish(locator ? 'cancelled' : 'unsupported');
      return;
    }
    observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target && !excluded(target) && (record.type !== 'childList' || Array.from(record.addedNodes).some(node => node.nodeType === Node.TEXT_NODE)))
          pending.add(target);
        for (const node of record.addedNodes)
          if (node instanceof Element && !excluded(node))
            pending.add(node);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset', 'style', 'class', 'alt', 'hidden'] });
    let complete = await scan(document.documentElement);
    if (stopped)
      return;
    for (const root of [...pending].slice(0, 30)) {
      pending.delete(root);
      if (root.isConnected)
        complete = (await scan(root)) && complete;
    }
    let result = await matchCurrent(complete && pending.size === 0);
    if (result.status === 'found') {
      finish('found', result.elements);
      return;
    }
    let nearby = !payload.verifyLink && restoreScroll(locator), scrolls = 0, noProgress = 0;
    const owners: Element[] = [document.scrollingElement ?? document.documentElement];
    for (const context of locator.scrollContexts.slice(1)) {
      if (!context.hint?.id)
        continue;
      const element = resolveHint(context.hint);
      if (element && !owners.includes(element) && owners.length < 4)
        owners.push(element);
    }
    let ownerIndex = 0;
    while (!stopped && Date.now() < deadline) {
      await delay(350);
      if (stopped)
        return;
      const changed = pending.size > 0;
      for (const root of [...pending].slice(0, 30)) {
        pending.delete(root);
        if (root.isConnected)
          complete = (await scan(root)) && complete;
        if (stopped)
          return;
      }
      result = await matchCurrent(complete && pending.size === 0);
      if (result.status === 'found') {
        finish('found', result.elements);
        return;
      }
      if(payload.verifyLink) continue;
      if (scrolls >= LOCATOR_LIMITS.scrolls || noProgress >= 2)
        break;
      const owner = owners[ownerIndex % owners.length];
      ownerIndex++;
      const before = owner.scrollTop;
      const direction = scrolls % 2 === 0 ? 1 : -1;
      const distance = Math.max(200, owner.clientHeight * .8) * (Math.floor(scrolls / 2) + 1);
      owner.scrollTo({ top: Math.max(0, before + direction * distance), behavior: 'instant' });
      scrolls++;
      noProgress = owner.scrollTop === before && !changed ? noProgress + 1 : 0;
    }
    if (stopped)
      return;
    if (payload.verifyLink) {finish('not-found');return;}
    if (!userControlled) {
      nearby = restoreScroll(locator) || nearby;
      if (!nearby)
        window.scrollTo({ left: initial.x, top: initial.y, behavior: 'instant' });
    }
    finish(result.status === 'ambiguous' ? 'ambiguous' : nearby ? 'nearby' : 'not-found');
  }
  void search().catch(() => {
    if (!stopped)
      finish('unsupported');
  });
  return dispose;
}
function legacyLocator(imageUrl?: string): SourceLocator | undefined {
  const url = httpUrl(imageUrl);
  if (!url)
    return;
  return { version: 1, capturedAt: Date.now(), captureMode: 'page_image', truncated: false, page: { url: location.href, title: '', links: [] }, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, captureRect: { x: 0, y: 0, width: 0, height: 0 }, scrollContexts: [], anchors: [{ kind: 'image', urls: [url], hint: { path: [] }, rect: { x: 0, y: 0, width: 0, height: 0 }, relative: { x: 0, y: 0 }, weak: false }] };
}
