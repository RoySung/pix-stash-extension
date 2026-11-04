import { isCaptureErrorCode, type CaptureErrorCode } from '../../lib/capture-errors';
import i18next from 'i18next';

import enUS from '../../lib/locales/en-US';
import zhTW from '../../lib/locales/zh-TW';
import { MESSAGE } from '../../lib/messages';
import type { CollectionRecord, ItemRecord, PageCandidate, RegionSelection, SaveItemOrganizationResponse } from '../../lib/types';

const Z = '2147483647';
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


let port: ReturnType<typeof browser.runtime.connect>;
let sequence = 0;
const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>();
function request(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    port.postMessage({id, message});
  });
}
function closeToast() {
  port?.disconnect();
  parent.postMessage({type:'pixstash/toast-close'}, '*');
  document.body.replaceChildren();
}
// A parent page can manufacture messages, but it does not know the secret sent
// by the isolated content script directly to this cross-origin window.
addEventListener('message', function authenticate(event) {
  if (event.source !== parent || event.data?.type !== 'pixstash/toast-auth' || typeof event.data.token !== 'string' || port) return;
  port = browser.runtime.connect({name:'pixstash/capture-toast'});
  port.onMessage.addListener((response) => {
    if (response.type === 'init') {
      void showCaptureToast(response.item, response.duplicate, response.collections, response.knownTags);
      return;
    }
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.error) entry.reject(new Error(response.error));
    else entry.resolve(response.result);
  });
  port.onDisconnect.addListener(() => {
    for (const entry of pending.values()) entry.reject(new Error('Capture session closed'));
    pending.clear();
    document.body.replaceChildren();
    parent.postMessage({type:'pixstash/toast-close'}, '*');
  });
  port.postMessage({token:event.data.token});
});
for (const name of ['click', 'keydown', 'input', 'change']) {
  document.addEventListener(name, event => { if (!event.isTrusted) event.stopImmediatePropagation(); }, true);
}
function normalizeToastTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const value = tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

async function showCaptureToast(item: ItemRecord, duplicate: boolean, collections: CollectionRecord[], knownTags: string[]) {
  await ensureI18n();
  injectPixStashStyles();
  document.getElementById('pixstash-capture-toast')?.remove();

  const selectedCollectionIds = new Set(item.collectionIds);
  const selectedTags = new Set(item.tags);
  let availableCollections = [...collections];
  let availableTags = [...knownTags];

  // ── Toast shell ──────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  toast.id = 'pixstash-capture-toast';
  toast.setAttribute('role', 'region');
  toast.setAttribute('aria-label', t('toast.just_stashed_title'));

  // ── Head: eyebrow / title / detail + close ────────────────────────────
  const head = document.createElement('div');
  head.className = 'psc-head';

  const copy = document.createElement('div');
  copy.className = 'psc-copy';

  const title = document.createElement('strong');
  title.className = 'psc-title';
  title.textContent = duplicate ? t('toast.already_saved_title') : t('toast.just_stashed_title');

  copy.setAttribute('role', 'status');
  copy.append(title);

  const close = document.createElement('button');
  close.className = 'psc-close';
  close.textContent = '×';
  close.setAttribute('aria-label', t('popup.dismiss'));
  close.addEventListener('click', () => closeToast());

  head.append(copy, close);

  // ── Item preview row ──────────────────────────────────────────────────
  const itemRow = document.createElement('div');
  itemRow.className = 'psc-item';

  const thumb = document.createElement('div');
  thumb.className = 'psc-thumb';
  const thumbImage = document.createElement('img');
  thumbImage.src = item.previewUrl;
  thumbImage.alt = item.pageTitle || t('toast.saved_reference');
  thumb.append(thumbImage);

  const meta = document.createElement('div');
  meta.className = 'psc-meta';

  const metaTitle = document.createElement('strong');
  metaTitle.className = 'psc-meta-title';
  metaTitle.textContent = item.pageTitle || t('toast.saved_reference_title');

  const metaSite = document.createElement('p');
  metaSite.className = 'psc-meta-site';
  metaSite.textContent = item.siteName;

  meta.append(metaTitle, metaSite);
  itemRow.append(thumb, meta);

  // ── Organizer ─────────────────────────────────────────────────────────
  const organizer = document.createElement('div');
  organizer.className = 'psc-organizer';

  // Collections section
  const collectionsSection = document.createElement('div');
  collectionsSection.className = 'psc-section';

  const collectionsLabel = document.createElement('p');
  collectionsLabel.className = 'psc-section-label';
  collectionsLabel.textContent = t('library.collections_label');

  const collectionsHint = document.createElement('p');
  collectionsHint.className = 'psc-section-hint';

  const collectionChips = document.createElement('div');
  collectionChips.className = 'psc-chips';

  const collectionInput = document.createElement('input');
  collectionInput.className = 'psc-input';
  collectionInput.placeholder = t('library.organizer_collection_placeholder');
  collectionInput.setAttribute('aria-label', t('library.organizer_collection_placeholder'));

  // Tags section
  const tagsSection = document.createElement('div');
  tagsSection.className = 'psc-section';

  const tagsLabel = document.createElement('p');
  tagsLabel.className = 'psc-section-label';
  tagsLabel.textContent = t('library.tags_label');

  const selectedTagRow = document.createElement('div');
  selectedTagRow.className = 'psc-chips';
  selectedTagRow.style.display = 'none';

  const tagInputRow = document.createElement('div');
  tagInputRow.className = 'psc-tag-input-row';

  const tagInput = document.createElement('input');
  tagInput.className = 'psc-input';
  tagInput.placeholder = t('library.organizer_tags_placeholder');
  tagInput.setAttribute('aria-label', t('library.tags_label'));

  const addTagButton = makeButton(t('library.organizer_add_tag'), 'default');
  addTagButton.classList.add('psc-btn--sm');

  const tagSuggestions = document.createElement('div');
  tagSuggestions.className = 'psc-chips';
  const tagChoices = document.createElement('details');
  tagChoices.className = 'psc-disclosure psc-disclosure--nested';
  const tagChoicesSummary = document.createElement('summary');
  tagChoicesSummary.textContent = t('library.choose_tags');
  tagChoices.append(tagChoicesSummary, tagSuggestions);

  const status = document.createElement('p');
  status.className = 'psc-status';
  status.setAttribute('role', 'status');

  // ── Render helpers ────────────────────────────────────────────────────
  function renderCollectionButtons() {
    collectionChips.replaceChildren();
    if (availableCollections.length === 0) {
      collectionsHint.textContent = t('library.organizer_no_collections');
      return;
    }
    collectionsHint.textContent = '';
    for (const collection of availableCollections) {
      const btn = makeChipButton(collection.name, selectedCollectionIds.has(collection.id));
      btn.addEventListener('click', () => {
        if (selectedCollectionIds.has(collection.id)) { selectedCollectionIds.delete(collection.id); }
        else { selectedCollectionIds.add(collection.id); }
        renderCollectionButtons();
      });
      collectionChips.append(btn);
    }
  }

  function renderSelectedTags() {
    selectedTagRow.replaceChildren();
    if (selectedTags.size === 0) { selectedTagRow.style.display = 'none'; return; }
    selectedTagRow.style.display = 'flex';
    for (const tag of selectedTags) {
      const btn = makeChipButton(`${tag} ×`, true);
      btn.addEventListener('click', () => {
        selectedTags.delete(tag);
        renderSelectedTags();
        renderTagSuggestions();
      });
      selectedTagRow.append(btn);
    }
  }

  function renderTagSuggestions() {
    tagSuggestions.replaceChildren();
    const order = availableTags.filter((tag) => !selectedTags.has(tag));
    tagChoices.hidden = order.length === 0;
    for (const tag of order) {
      const btn = makeChipButton(tag, selectedTags.has(tag));
      btn.addEventListener('click', () => {
        if (selectedTags.has(tag)) { selectedTags.delete(tag); } else { selectedTags.add(tag); }
        renderSelectedTags();
        renderTagSuggestions();
      });
      tagSuggestions.append(btn);
    }
  }

  function commitDraftTags() {
    for (const tag of normalizeToastTags(tagInput.value.split(','))) selectedTags.add(tag);
    tagInput.value = '';
    renderSelectedTags();
    renderTagSuggestions();
  }

  // ── Actions ───────────────────────────────────────────────────────────
  const save = makeButton(t('library.save_details'), 'save');
  save.addEventListener('click', async () => {
    save.disabled = true;
    status.textContent = '';

    try {
      const response = (await request({
        type: MESSAGE.saveItemOrganization,
        itemId: item.id,
        collectionIds: [...selectedCollectionIds],
        tags: normalizeToastTags([...selectedTags, ...tagInput.value.split(',')]),
        newCollectionName: collectionInput.value,
      })) as SaveItemOrganizationResponse;

      if (!response.ok || !response.item) {
        status.textContent = response.error ?? t('toast.unable_to_save');
        save.disabled = false;
        return;
      }

      availableCollections = response.collections;
      availableTags        = response.knownTags;
      selectedCollectionIds.clear();
      for (const id  of response.item.collectionIds) selectedCollectionIds.add(id);
      selectedTags.clear();
      for (const tag of response.item.tags)          selectedTags.add(tag);
      collectionInput.value = '';
      tagInput.value        = '';
      status.textContent    = t('toast.saved_to_stash');
      renderCollectionButtons();
      renderSelectedTags();
      renderTagSuggestions();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : t('toast.unable_to_save');
    } finally {
      save.disabled = false;
    }
  });

  const openLibrary = makeButton(t('popup.open_library'), 'secondary');
  openLibrary.addEventListener('click', () => {
    void request({ type: MESSAGE.openLibrary }).then(closeToast).catch(error => { status.textContent = String(error); });
  });

  const undo = makeButton(t('popup.undo'), 'secondary');
  undo.addEventListener('click', async () => {
    undo.disabled = true;
    try {
      await request({ type: MESSAGE.deleteItem });
      closeToast();
    } catch (error) {
      status.textContent = String(error);
      undo.disabled = false;
    }
  });

  addTagButton.addEventListener('click', commitDraftTags);
  tagInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !tagInput.value.trim()) return;
    event.preventDefault();
    commitDraftTags();
  });

  renderCollectionButtons();
  renderSelectedTags();
  renderTagSuggestions();

  // ── Assemble ──────────────────────────────────────────────────────────
  const newCollection = document.createElement('details');
  newCollection.className = 'psc-disclosure psc-disclosure--nested';
  const newCollectionSummary = document.createElement('summary');
  newCollectionSummary.textContent = t('library.new_collection');
  newCollection.append(newCollectionSummary, collectionInput);
  collectionsSection.append(collectionsLabel, collectionsHint, collectionChips, newCollection);
  tagInputRow.append(tagInput, addTagButton);
  tagsSection.append(tagsLabel, selectedTagRow, tagInputRow, tagChoices);
  organizer.append(collectionsSection, tagsSection, save, status);

  const toastActions = document.createElement('div');
  toastActions.className = 'psc-toast-actions';
  toastActions.append(openLibrary);
  if (!duplicate) toastActions.append(undo);

  const organizeDisclosure = document.createElement('details');
  organizeDisclosure.className = 'psc-disclosure';
  const organizeSummary = document.createElement('summary');
  organizeSummary.textContent = t('library.organize');
  organizeDisclosure.append(organizeSummary, organizer);
  toast.append(head, itemRow, toastActions, organizeDisclosure);
  mountToast(toast);
}

function mountToast(toast: HTMLElement) {
  document.body.append(toast);
  const layout = document.createElement('style');
  layout.textContent = '#pixstash-capture-toast { position:relative; inset:auto; width:100%; max-width:none; max-height:none; margin:0; box-shadow:none; } body {margin:0;background:transparent;}';
  document.head.append(layout);
  new ResizeObserver(() => parent.postMessage({type:'pixstash/toast-size', height:toast.offsetHeight}, '*')).observe(toast);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) toast.animate(
    [{ opacity: '0', transform: 'translateY(14px)' }, { opacity: '1', transform: 'translateY(0)' }],
    { duration: 180, easing: 'ease-out' },
  );
}

async function showCaptureError(code: CaptureErrorCode) {
  await ensureI18n();
  injectPixStashStyles();
  const toast = document.createElement('div');
  toast.id = 'pixstash-capture-toast';
  const title = document.createElement('strong');
  title.className = 'psc-title';
  title.textContent = t(code === 'saved_notice_failed' ? 'toast.just_stashed_title' : 'toast.unable_to_stash');
  const message = document.createElement('p');
  message.className = 'psc-detail';
  message.setAttribute('role', 'alert');
  message.textContent = t(`capture_error.${code}`);
  const hint = document.createElement('p');
  hint.className = 'psc-detail';
  hint.textContent = t('capture_error.retry_hint');
  const retry = makeButton(t('capture_error.use_screenshot'), 'accent');
  retry.addEventListener('click', () => {
    retry.disabled = true;
    parent.postMessage({type:'pixstash/toast-retry'}, '*');
  });
  const close = makeButton(t('popup.dismiss'));
  close.addEventListener('click', closeToast);
  toast.append(title, message, hint, retry, close);
  mountToast(toast);
}
const errorCode = location.hash.startsWith('#error=') ? location.hash.slice(7) : undefined;
if (isCaptureErrorCode(errorCode)) void showCaptureError(errorCode);
