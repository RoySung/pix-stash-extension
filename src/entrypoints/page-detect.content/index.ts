import { foregroundImages } from '../../lib/foreground-images';
import { captureSourceLocator, rememberContextTarget, verifySourceCapture } from '../../lib/source-locator-dom';
import { runSourceRelocation, type RelocationStrings } from '../../lib/source-relocation-dom';
import { CAPTURE_WAIT_MS, captureErrorCode, isCaptureErrorCode, withCaptureDeadline, type CaptureErrorCode } from '../../lib/capture-errors';
import i18next from 'i18next';

import { detectPageCandidate } from '../../lib/detect-page-candidate';
import enUS from '../../lib/locales/en-US';
import zhTW from '../../lib/locales/zh-TW';
import { MESSAGE } from '../../lib/messages';
import type { PageCandidate, RegionSelection } from '../../lib/types';

let pendingCaptureTimer: ReturnType<typeof setTimeout> | undefined;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    // Script may be injected again after an extension reload. Keep one listener per document.
    const state = globalThis as typeof globalThis & { __pixstashPageDetect?: boolean };
    if (state.__pixstashPageDetect) return;
    state.__pixstashPageDetect = true;
    document.addEventListener('contextmenu', rememberContextTarget, true);
    let relocation: (() => void) | undefined;
    const ready = async () => {
      await ensureI18n();
      const payload = await browser.runtime.sendMessage({type:MESSAGE.relocationReady}).catch(() => undefined);
      if (!payload?.requestId && !payload?.unsupported) return;
      const strings = Object.fromEntries(['searching','found','nearby','ambiguous','not-found','unsupported','cancelled','cancel','close','dismiss_highlight','clues','original','retry','retry_search'].map(key => [key,t(`relocation.${key}`)])) as unknown as RelocationStrings;
      relocation?.();
      relocation = runSourceRelocation(payload.unsupported ? {requestId:'unsupported',expires:Date.now()} : payload, strings, status => { void browser.runtime.sendMessage({type:MESSAGE.relocationResult,requestId:payload.requestId,status}).catch(() => {}); }, async urls => {const result=await withCaptureDeadline(browser.runtime.sendMessage({type:MESSAGE.verifySourceImages,requestId:payload.requestId,urls}),6000);return result?.url;});
    };
    void ready();
    addEventListener('pageshow', event => { if (event.persisted) void ready(); });
    browser.runtime.onMessage.addListener((message) => {
      switch (message?.type) {
        case MESSAGE.relocationProbe:
          void ready();
          return Promise.resolve({ok:true});
        case MESSAGE.captureSourceLocator:
          if (!['context_image','page_image','region_screenshot','instant_screenshot'].includes(message.mode)) return;
          return Promise.resolve(captureSourceLocator(message.mode, message.rect, message.imageUrl));
        case MESSAGE.verifySourceCapture:
          return Promise.resolve({valid:verifySourceCapture(message.token)});
        case MESSAGE.relocationCancel:
          relocation?.();
          if (message.unsupported) void ensureI18n().then(() => {
            const strings = Object.fromEntries(['searching','found','nearby','ambiguous','not-found','unsupported','cancelled','cancel','close','dismiss_highlight','clues','original','retry','retry_search'].map(key => [key,t(`relocation.${key}`)])) as unknown as RelocationStrings;
            relocation = runSourceRelocation({requestId:'unsupported',expires:Date.now()},strings,()=>{});
          });
          return Promise.resolve({ok:true});
        case MESSAGE.getPageCandidate:
          return Promise.resolve(getPageCandidate());
        case MESSAGE.beginRegionSelection:
          return beginRegionSelection();
        case MESSAGE.capturePending:
          clearTimeout(pendingCaptureTimer);
          pendingCaptureTimer = setTimeout(() => showLocalCaptureError('no_response'), CAPTURE_WAIT_MS);
          return Promise.resolve({ok:true});
        case MESSAGE.showCaptureError:
          if (isCaptureErrorCode(message.errorCode)) showCaptureToast('', message.errorCode);
          return Promise.resolve({ok:true});
        case MESSAGE.showCaptureToast:
          showCaptureToast(message.token);
          return Promise.resolve({ ok: true });
        default:
          return undefined;
      }
    });
  },
});

function getPageCandidate(): PageCandidate | null {
  return detectPageCandidate({title:document.title, images:document.images, foregroundImages:foregroundImages(), querySelector:document.querySelector.bind(document)}, window.location.href, window.location.hostname);
}

const Z = '2147483647';
const MIN_SIZE = 20;
const KEYBOARD_STEP = 16;
const LANGUAGE_KEY = 'pixstash.language';

// ─── Design tokens (mirrored from theme.css for content-script injection) ────
const FONT_STACK = "'Avenir Next', 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'Segoe UI', sans-serif";
const DISPLAY_STACK = "'Iowan Old Style', 'Songti TC', 'Noto Serif TC', 'PMingLiU', Georgia, serif";
const T = {
  fontBody: FONT_STACK,
  fontDisplay: DISPLAY_STACK,
  fontMono: FONT_STACK,
  ink: '#25231f',
  inkSoft: '#69635c',
  inkFaint: '#787065',
  line: '#dfd7cb',
  lineOverlay: '#8c8172',
  paper: '#f4efe6',
  surface: '#fffdf9',
  surfaceInput: '#fffdf9',
  surfaceChip: '#fffdf9',
  aqua: '#496f68',
  aquaText: '#17322f',
  aquaFill: '#7aa5a0',
  aquaSurface: '#e4ece8',
  aquaSecondary: '#fbf8f3',
  red: '#a1513c',
  overlay:     'rgba(0, 0, 0, 0.25)',
  handleFill:  '#ffffff',
  handleStroke:'#2c2a29',
  shadow: '0 16px 36px rgba(65, 49, 32, 0.12)',
} as const;

// ─── All static styles in one place ──────────────────────────────────────────
const PIXSTASH_CSS = `
  /* Region overlay */
  #pixstash-region-overlay {
    position: fixed; inset: 0; z-index: ${Z};
    cursor: crosshair; user-select: none;
    background: ${T.overlay};
  }
  #pixstash-region-overlay.psc-confirm { background: transparent; }

  #pixstash-region-guide {
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 10px 16px;
    border: 1px solid ${T.lineOverlay}; border-radius: 14px;
    background: ${T.paper}; color: ${T.ink};
    font-family: ${T.fontBody}; font-size: 11px;
    letter-spacing: normal;
    white-space: nowrap; pointer-events: none;
  }

  .psc-box {
    position: fixed; display: none;
    pointer-events: none;
    border: 2px solid ${T.red};
    background: transparent; overflow: visible;
  }
  .psc-box.psc-confirm {
    pointer-events: auto; cursor: move;
    border-color: ${T.handleStroke};
    box-shadow: 0 0 0 1px rgba(255,255,255,0.5), 0 0 0 9999px rgba(0,0,0,0.5);
  }

  .psc-handle {
    position: absolute; width: 10px; height: 10px;
    background: ${T.handleFill}; border: 1.5px solid ${T.handleStroke};
    border-radius: 2px;
  }

  .psc-overlay-actions {
    position: fixed; z-index: ${Z};
    display: flex; gap: 8px;
    font-family: ${T.fontBody};
  }

  /* Shared button base */
  .psc-btn {
    padding: 8px 16px; min-height: 44px;
    border: 1px solid ${T.lineOverlay}; border-radius: 14px;
    background: ${T.paper}; color: ${T.ink};
    font-family: ${T.fontBody}; font-size: 12px; letter-spacing: normal;
    cursor: pointer; box-shadow: none;
  }
  .psc-btn--accent { border: none; background: ${T.red}; color: ${T.handleFill}; }
  .psc-btn--save   { border: 1px solid ${T.aqua}; background: ${T.aquaFill}; color: ${T.aquaText}; }
  .psc-btn--secondary {
    background: ${T.aquaSecondary}; border: 1px solid ${T.lineOverlay};
    box-shadow: none;
  }
  .psc-btn--sm { min-height: 40px; padding: 8px 12px; }

  /* Capture toast */
  #pixstash-capture-toast {
    position: fixed; right: 20px; bottom: 20px; z-index: ${Z};
    display: grid; gap: 12px;
    width: min(340px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 20px;
    box-sizing: border-box; border: 0; border-radius: 22px;
    background: linear-gradient(180deg, ${T.surface} 0%, #faf5ee 100%);
    color: ${T.ink}; box-shadow: ${T.shadow};
    font-family: ${T.fontBody};
  }

  .psc-head {
    display: grid; grid-template-columns: minmax(0,1fr) auto;
    gap: 12px; align-items: start;
  }
  .psc-copy { display: grid; gap: 4px; }

  .psc-title {
    display: block; margin: 0;
    font-family: ${T.fontDisplay}; font-size: 20px; font-weight: 500;
    line-height: 1.5; color: ${T.aqua};
  }
  .psc-detail { margin: 0; font-size: 12px; line-height: 1.45; color: ${T.inkSoft}; }

  .psc-close {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; padding: 0;
    border: 1px solid ${T.line}; border-radius: 8px;
    background: ${T.surface}; color: ${T.inkSoft};
    font-size: 18px; line-height: 1; cursor: pointer;
  }

  .psc-item {
    display: grid; grid-template-columns: 60px minmax(0,1fr);
    gap: 12px; align-items: center; padding: 0;
  }
  .psc-thumb {
    aspect-ratio: 1; overflow: hidden; border-radius: 6px; padding: 4px;
    background: ${T.paper};
  }
  .psc-thumb img { width: 100%; height: 100%; object-fit: contain; }

  .psc-meta { display: grid; gap: 4px; min-width: 0; }
  .psc-meta-label {
    font-family: ${T.fontMono}; font-size: 11px;
    letter-spacing: normal; color: ${T.inkFaint};
  }
  .psc-meta-title {
    display: block; margin: 0;
    font-family: ${T.fontDisplay}; font-size: 12px; font-weight: 500; line-height: 1.6;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere;
  }
  .psc-meta-site { margin: 0; font-size: 12px; color: ${T.inkSoft}; }

  .psc-organizer { display: grid; gap: 20px; padding-top: 16px; }
  .psc-disclosure > summary { padding: 8px 10px; border: 1px solid ${T.lineOverlay}; border-radius: 14px; background: ${T.surface}; font-size: 13px; font-weight: 600; color: ${T.ink}; cursor: pointer; }
  .psc-disclosure { border-top: 1px solid ${T.lineOverlay}; padding-top: 12px; }
  .psc-disclosure--nested { border: 0; padding-top: 0; }
  .psc-disclosure--nested > input, .psc-disclosure--nested > .psc-chips { margin-top: 8px; }
  #pixstash-capture-toast :where(button, input, summary):focus-visible { outline: 2px solid ${T.aqua}; outline-offset: 3px; }
  #pixstash-capture-toast button:disabled { opacity: 0.5; cursor: not-allowed; }
  .psc-section   { display: grid; gap: 8px; }
  .psc-section + .psc-section { border-top: 1px solid ${T.lineOverlay}; padding-top: 16px; }
  .psc-section-label {
    margin: 0; font-family: ${T.fontMono}; font-size: 13px; font-weight: 600;
    letter-spacing: normal; color: ${T.ink};
  }
  .psc-section-hint { margin: 0; font-size: 12px; line-height: 1.45; color: ${T.inkSoft}; }

  .psc-chips { display: flex; flex-wrap: wrap; gap: 8px; max-height: 160px; overflow-y: auto; padding: 4px; }

  .psc-chip {
    min-height: 34px; padding: 8px 12px;
    border: 1px solid ${T.lineOverlay}; border-radius: 14px;
    background: ${T.surfaceChip}; color: ${T.ink};
    font-family: ${T.fontBody}; font-size: 11px; cursor: pointer;
  }
  .psc-chip--active { border-color: ${T.aqua}; background: ${T.aquaSurface}; }

  .psc-input {
    width: 100%; min-height: 40px; padding: 10px 12px;
    border: 1px solid ${T.lineOverlay}; border-radius: 14px;
    box-sizing: border-box; background: ${T.surfaceInput}; color: ${T.ink};
    font-family: ${T.fontBody}; font-size: 12px;
  }
  .psc-tag-input-row {
    display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px;
  }

  .psc-status { margin: 0; font-size: 12px; color: ${T.inkSoft}; }
  .psc-toast-actions { display: flex; flex-wrap: wrap; gap: 10px; }
`;

function injectPixStashStyles() {
  if (document.getElementById('pixstash-styles')) return;
  const style = document.createElement('style');
  style.id = 'pixstash-styles';
  style.textContent = PIXSTASH_CSS;
  (document.head ?? document.documentElement).append(style);
}

let t = i18next.t.bind(i18next);
let i18nReady: Promise<void> | null = null;

function ensureI18n(): Promise<void> {
  if (!i18nReady) {
    i18nReady = (async () => {
      const result = await browser.storage.local.get(LANGUAGE_KEY);
      const lng = result[LANGUAGE_KEY] === 'en-US' ? 'en-US' : 'zh-TW';
      await i18next.init({
        lng,
        fallbackLng: 'zh-TW',
        resources: {
          'zh-TW': { translation: zhTW },
          'en-US': { translation: enUS },
        },
        interpolation: { escapeValue: false },
      });
      t = i18next.t.bind(i18next);
    })();
  }
  return i18nReady;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

const HANDLE_POSITIONS: { dir: Exclude<HandleDir, 'move'>; top?: string; bottom?: string; left?: string; right?: string; cursor: string }[] = [
  { dir: 'nw', top: '-5px',             left: '-5px',            cursor: 'nw-resize' },
  { dir: 'n',  top: '-5px',             left: 'calc(50% - 5px)', cursor: 'n-resize'  },
  { dir: 'ne', top: '-5px',             right: '-5px',           cursor: 'ne-resize' },
  { dir: 'e',  top: 'calc(50% - 5px)',  right: '-5px',           cursor: 'e-resize'  },
  { dir: 'se', bottom: '-5px',          right: '-5px',           cursor: 'se-resize' },
  { dir: 's',  bottom: '-5px',          left: 'calc(50% - 5px)', cursor: 's-resize'  },
  { dir: 'sw', bottom: '-5px',          left: '-5px',            cursor: 'sw-resize' },
  { dir: 'w',  top: 'calc(50% - 5px)', left: '-5px',            cursor: 'w-resize'  },
];

type ButtonVariant = 'default' | 'accent' | 'save' | 'secondary';

function makeButton(label: string, variant: ButtonVariant = 'default'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = `psc-btn${variant !== 'default' ? ` psc-btn--${variant}` : ''}`;
  return btn;
}

function makeChipButton(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = `psc-chip${active ? ' psc-chip--active' : ''}`;
  return btn;
}

async function beginRegionSelection() {
  if (document.getElementById('pixstash-region-overlay')) {
    return { ok: true };
  }

  await ensureI18n();
  injectPixStashStyles();

  const overlay = document.createElement('div');
  overlay.id = 'pixstash-region-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.tabIndex = 0;

  const guide = document.createElement('div');
  guide.id = 'pixstash-region-guide';
  guide.textContent = t('popup.region_guide_draw');
  overlay.setAttribute('aria-labelledby', guide.id);

  const box = document.createElement('div');
  box.className = 'psc-box';

  overlay.append(guide, box);
  document.documentElement.append(overlay);
  overlay.focus();

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let currentSelection: RegionSelection | null = null;
  let actions: HTMLDivElement | null = null;
  let cleanupConfirmDrag: (() => void) | null = null;

  const clampSelection = () => {
    if (!currentSelection) return;
    currentSelection.width  = Math.max(MIN_SIZE, Math.min(currentSelection.width,  window.innerWidth));
    currentSelection.height = Math.max(MIN_SIZE, Math.min(currentSelection.height, window.innerHeight));
    currentSelection.x = Math.min(Math.max(0, currentSelection.x), Math.max(0, window.innerWidth  - currentSelection.width));
    currentSelection.y = Math.min(Math.max(0, currentSelection.y), Math.max(0, window.innerHeight - currentSelection.height));
  };

  const applySelectionToBox = () => {
    if (!currentSelection) return;
    box.style.left   = `${currentSelection.x}px`;
    box.style.top    = `${currentSelection.y}px`;
    box.style.width  = `${currentSelection.width}px`;
    box.style.height = `${currentSelection.height}px`;
  };

  const updateActionsPosition = () => {
    if (!actions || !currentSelection) return;
    const btnY = currentSelection.y + currentSelection.height + 12;
    const fitsBelow = btnY + 40 < window.innerHeight;
    actions.style.top  = fitsBelow ? `${btnY}px` : `${currentSelection.y - 52}px`;
    actions.style.left = `${currentSelection.x}px`;
  };

  const syncSelectionUi = () => {
    clampSelection();
    applySelectionToBox();
    updateActionsPosition();
  };

  const createDefaultSelection = (): RegionSelection => {
    const width  = Math.max(MIN_SIZE, Math.min(window.innerWidth  - 48, Math.round(window.innerWidth  * 0.55)));
    const height = Math.max(MIN_SIZE, Math.min(window.innerHeight - 72, Math.round(window.innerHeight * 0.42)));
    return {
      x: Math.max(24, Math.round((window.innerWidth  - width)  / 2)),
      y: Math.max(36, Math.round((window.innerHeight - height) / 2)),
      width, height,
      viewportWidth:  window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  };

  const submitSelection = async () => {
    if (!currentSelection) return;
    const selection = { ...currentSelection, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    teardown();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const response = await withCaptureDeadline(browser.runtime.sendMessage({ type: MESSAGE.completeRegionCapture, selection, capture: captureSourceLocator('region_screenshot',selection), pageCandidate: getPageCandidate() }));
      if (!response?.ok) showLocalCaptureError(response?.errorCode ?? 'capture_failed');
    } catch (error) { showLocalCaptureError(captureErrorCode(error)); }
  };

  const removeActions = () => {
    actions?.remove();
    actions = null;
  };

  const teardown = () => {
    cleanupConfirmDrag?.();
    overlay.remove();
    removeActions();
    currentSelection = null;
    window.removeEventListener('keydown', onKeyDown, true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.isTrusted) return;
    if (event.key === 'Escape') { teardown(); return; }

    if (!currentSelection && event.key === 'Enter') {
      event.preventDefault();
      enterConfirmMode(createDefaultSelection());
      return;
    }

    if (!currentSelection) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      void submitSelection();
      return;
    }

    if (!event.key.startsWith('Arrow')) return;

    event.preventDefault();
    const next = { ...currentSelection };

    if (event.shiftKey) {
      if (event.key === 'ArrowLeft')  next.width  -= KEYBOARD_STEP;
      if (event.key === 'ArrowRight') next.width  += KEYBOARD_STEP;
      if (event.key === 'ArrowUp')    next.height -= KEYBOARD_STEP;
      if (event.key === 'ArrowDown')  next.height += KEYBOARD_STEP;
    } else {
      if (event.key === 'ArrowLeft')  next.x -= KEYBOARD_STEP;
      if (event.key === 'ArrowRight') next.x += KEYBOARD_STEP;
      if (event.key === 'ArrowUp')    next.y -= KEYBOARD_STEP;
      if (event.key === 'ArrowDown')  next.y += KEYBOARD_STEP;
    }

    currentSelection = next;
    guide.textContent = t('popup.region_guide_confirm');
    syncSelectionUi();
  };

  const enterDragMode = () => {
    cleanupConfirmDrag?.();
    cleanupConfirmDrag = null;
    currentSelection = null;
    removeActions();
    box.innerHTML = '';
    box.classList.remove('psc-confirm');
    box.style.display = 'none';
    overlay.classList.remove('psc-confirm');
    guide.textContent = t('popup.region_guide_draw');
    overlay.focus();
    overlay.addEventListener('pointerdown', onPointerDown, { once: true });
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const enterConfirmMode = (initialSel: RegionSelection) => {
    removeActions();
    currentSelection = { ...initialSel };

    overlay.classList.add('psc-confirm');
    overlay.focus();

    box.innerHTML = '';
    box.classList.add('psc-confirm');

    guide.textContent = t('popup.region_guide_confirm');

    let activeHandle: HandleDir | null = null;
    let dragOrigin = { x: 0, y: 0 };
    let selOrigin  = { x: 0, y: 0, width: 0, height: 0 };

    const onDragMove = (e: PointerEvent) => {
      if (!activeHandle || !currentSelection) return;
      const dx = e.clientX - dragOrigin.x;
      const dy = e.clientY - dragOrigin.y;

      switch (activeHandle) {
        case 'move':
          currentSelection.x = selOrigin.x + dx;
          currentSelection.y = selOrigin.y + dy;
          break;
        case 'nw':
          currentSelection.x = selOrigin.x + dx; currentSelection.y = selOrigin.y + dy;
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  - dx);
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height - dy);
          break;
        case 'n':
          currentSelection.y      = selOrigin.y + dy;
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height - dy);
          break;
        case 'ne':
          currentSelection.y      = selOrigin.y + dy;
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  + dx);
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height - dy);
          break;
        case 'e':
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  + dx);
          break;
        case 'se':
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  + dx);
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height + dy);
          break;
        case 's':
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height + dy);
          break;
        case 'sw':
          currentSelection.x     = selOrigin.x + dx;
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  - dx);
          currentSelection.height = Math.max(MIN_SIZE, selOrigin.height + dy);
          break;
        case 'w':
          currentSelection.x     = selOrigin.x + dx;
          currentSelection.width  = Math.max(MIN_SIZE, selOrigin.width  - dx);
          break;
      }

      syncSelectionUi();
    };

    const startDrag = (dir: HandleDir) => (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      activeHandle = dir;
      dragOrigin = { x: e.clientX, y: e.clientY };
      if (!currentSelection) return;
      selOrigin = { x: currentSelection.x, y: currentSelection.y, width: currentSelection.width, height: currentSelection.height };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', stopDrag, { once: true });
    };

    const stopDrag = () => {
      activeHandle = null;
      document.removeEventListener('pointermove', onDragMove);
    };

    const onReDrawStart = (event: PointerEvent) => {
      cleanupConfirmDrag?.();
      cleanupConfirmDrag = null;
      removeActions();
      box.innerHTML = '';
      box.classList.remove('psc-confirm');
      overlay.classList.remove('psc-confirm');
      guide.textContent = t('popup.region_guide_draw');
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      box.style.display = 'block';
      updateBox(event.clientX, event.clientY);
      overlay.addEventListener('pointermove', onPointerMove);
      overlay.addEventListener('pointerup', onPointerUp, { once: true });
    };

    cleanupConfirmDrag = () => {
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', stopDrag);
      overlay.removeEventListener('pointerdown', onReDrawStart);
    };

    overlay.addEventListener('pointerdown', onReDrawStart, { once: true });
    box.addEventListener('pointerdown', startDrag('move'));

    for (const { dir, top, bottom, left, right, cursor } of HANDLE_POSITIONS) {
      const handle = document.createElement('div');
      handle.className = 'psc-handle';
      handle.style.cursor = cursor;
      if (top    !== undefined) handle.style.top    = top;
      if (bottom !== undefined) handle.style.bottom = bottom;
      if (left   !== undefined) handle.style.left   = left;
      if (right  !== undefined) handle.style.right  = right;
      handle.addEventListener('pointerdown', startDrag(dir));
      box.append(handle);
    }

    actions = document.createElement('div');
    actions.className = 'psc-overlay-actions';

    const cancelBtn = makeButton(t('library.cancel'));
    cancelBtn.addEventListener('click', () => teardown());

    const stashBtn = makeButton(t('popup.stash'), 'accent');
    stashBtn.addEventListener('click', async event => { if (event.isTrusted) await submitSelection(); });

    actions.append(cancelBtn, stashBtn);
    document.documentElement.append(actions);
    syncSelectionUi();
  };

  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.style.display = 'block';
    updateBox(event.clientX, event.clientY);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    updateBox(event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    overlay.removeEventListener('pointermove', onPointerMove);
    const selection = normalizeSelection(startX, startY, event.clientX, event.clientY);
    if (selection.width < 8 || selection.height < 8) { enterDragMode(); return; }
    enterConfirmMode(selection);
  };

  const updateBox = (x: number, y: number) => {
    currentSelection = normalizeSelection(startX, startY, x, y);
    applySelectionToBox();
  };

  window.addEventListener('keydown', onKeyDown, true);
  enterDragMode();

  // Return immediately so the popup can close before the user starts selecting
  return { ok: true };
}

function normalizeSelection(startX: number, startY: number, endX: number, endY: number): RegionSelection {
  return {
    x:      Math.min(startX, endX),
    y:      Math.min(startY, endY),
    width:  Math.abs(endX - startX),
    height: Math.abs(endY - startY),
    viewportWidth:  window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

let dismissToast: (() => void) | undefined;
function showLocalCaptureError(code: CaptureErrorCode) {
  showCaptureToast('', code);
  void browser.runtime.sendMessage({type:MESSAGE.reportCaptureIssue, errorCode:code}).catch(() => {});
}
function showCaptureToast(token: string, errorCode?: CaptureErrorCode) {
  clearTimeout(pendingCaptureTimer);
  dismissToast?.();
  const frame = document.createElement('iframe');
  frame.setAttribute('data-pixstash-ui','capture-toast');
  frame.title = 'PixStash';
  const url = browser.runtime.getURL('/capture-toast.html');
  frame.src = errorCode ? `${url}#error=${errorCode}` : url;
  frame.style.cssText = 'position:fixed;bottom:16px;right:16px;width:min(400px,calc(100vw - 32px));height:240px;max-height:calc(100vh - 32px);border:0;border-radius:22px;z-index:2147483647;box-shadow:0 16px 36px rgba(65,49,32,.12);';
  const origin = new URL(url).origin;
  let authenticated = false;
  frame.addEventListener('load', () => {
    if (authenticated) { dismissToast?.(); return; }
    authenticated = true;
    if (token) frame.contentWindow?.postMessage({type:'pixstash/toast-auth', token}, origin);
  });
  const receive = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (event.data?.type === 'pixstash/toast-retry' && errorCode) {
      void withCaptureDeadline(browser.runtime.sendMessage({type:MESSAGE.retryCapture})).then(response => {
        if (response?.ok) dismissToast?.();
        else showLocalCaptureError(response?.errorCode ?? 'capture_failed');
      }).catch(error => showLocalCaptureError(captureErrorCode(error)));
    }
    if (event.data?.type === 'pixstash/toast-close') dismissToast?.();
    if (event.data?.type === 'pixstash/toast-size' && Number.isFinite(event.data.height)) {
      frame.style.height = `${Math.max(100, Math.min(event.data.height, window.innerHeight - 32))}px`;
    }
  };
  addEventListener('message', receive);
  const timer = setTimeout(() => dismissToast?.(), 5 * 60_000);
  const observer = new MutationObserver(() => { if (!frame.isConnected) dismissToast?.(); });
  dismissToast = () => {
    clearTimeout(timer);
    observer.disconnect();
    removeEventListener('message', receive);
    frame.remove();
    void browser.runtime.sendMessage({type: 'pixstash/revoke-toast', token});
    dismissToast = undefined;
  };
  document.documentElement.append(frame);
  observer.observe(document.documentElement, {childList:true, subtree:true});
}
