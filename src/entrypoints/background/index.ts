import { captureErrorCode, isCaptureErrorCode, withCaptureDeadline, type CaptureErrorCode } from '../../lib/capture-errors';
import { ToastSessions } from '../../lib/toast-sessions';
import {
  getItem,
  createCapturedItem,
  createCollection,
  createPageCandidateRecord,
  deleteItem,
  inferSiteName,
  listCollections,
  listKnownTags,
  normalizeTags,
  setItemCollections,
  setItemTags,
} from '../../lib/items';
import { cropDataUrl, createPreviewFromDataUrl, normalizeExternalImage } from '../../lib/images';
import { MESSAGE } from '../../lib/messages';
import type {
  ActiveContext,
  CaptureResponse,
  OrganizerData,
  PageCandidate,
  RegionSelection,
  SaveItemOrganizationInput,
  SaveItemOrganizationResponse,
} from '../../lib/types';

const toastSessions = new ToastSessions();
const captureIssues = new Map<number, {code:CaptureErrorCode; expires:number}>();
async function recentCaptureIssue(tabId: number) {
  const key = `capture-issue-${tabId}`;
  const stored = await browser.storage.session?.get(key).catch(() => undefined);
  const issue = captureIssues.get(tabId) ?? stored?.[key];
  if (issue && isCaptureErrorCode(issue.code) && issue.expires > Date.now()) return issue.code;
  await clearCaptureIssue(tabId);
}
async function recordCaptureIssue(tabId: number, code: CaptureErrorCode) {
  const issue = {code, expires:Date.now() + 5 * 60_000};
  captureIssues.set(tabId, issue);
  await browser.storage.session?.set({[`capture-issue-${tabId}`]:issue}).catch(() => {});
  await browser.action.setBadgeText({tabId, text:'!'}).catch(() => {});
  await browser.action.setBadgeBackgroundColor({tabId, color:'#a1513c'}).catch(() => {});
}
async function clearCaptureIssue(tabId: number) {
  captureIssues.delete(tabId);
  await browser.storage.session?.remove(`capture-issue-${tabId}`).catch(() => {});
  await browser.action.setBadgeText({tabId, text:''}).catch(() => {});
}
function failedCapture(error: unknown): CaptureResponse {
  return {ok:false, errorCode:captureErrorCode(error)};
}
async function showCaptureFailure(tabId: number, code: CaptureErrorCode) {
  await recordCaptureIssue(tabId, code);
  await sendMessageToTab(tabId, {type:MESSAGE.showCaptureError, errorCode:code}).catch(() => {});
}


const MENU_CAPTURE = 'pixstash-capture';
const MENU_LIBRARY = 'pixstash-library';
const MENU_STASH_IMAGE = 'pixstash-stash-image';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_CAPTURE,
      title: 'Stash viewport to PixStash',
      contexts: ['action'],
    });
    browser.contextMenus.create({
      id: MENU_LIBRARY,
      title: 'Open PixStash Library',
      contexts: ['action'],
    });
    browser.contextMenus.create({
      id: MENU_STASH_IMAGE,
      title: 'Stash image to PixStash',
      contexts: ['image'],
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_CAPTURE) {
      const response = await withCaptureDeadline(captureInstant()).catch(failedCapture);
      if (!response.ok && tab?.id !== undefined) await showCaptureFailure(tab.id, response.errorCode ?? 'capture_failed');
    }

    if (info.menuItemId === MENU_LIBRARY) {
      await openLibraryPage();
    }

    if (info.menuItemId === MENU_STASH_IMAGE) {
      if (tab?.id !== undefined) await sendMessageToTab(tab.id, {type:MESSAGE.capturePending}).catch(() => {});
      const response = await withCaptureDeadline(captureContextMenuImage(info.srcUrl, tab?.id, tab?.url ?? '', tab?.title ?? 'Untitled page')).catch(failedCapture);
      if (!response.ok && tab?.id !== undefined) await showCaptureFailure(tab.id, response.errorCode ?? 'capture_failed');
    }
  });

  browser.tabs.onRemoved.addListener(tabId => { toastSessions.revokeTab(tabId); void clearCaptureIssue(tabId); });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') { toastSessions.revokeTab(tabId); void clearCaptureIssue(tabId); }
  });
  browser.runtime.onConnect.addListener(port => {
    if (port.name !== 'pixstash/capture-toast') return;
    const sender = port.sender;
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (sender?.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/capture-toast.html') || tabId === undefined || frameId === undefined || frameId <= 0) {
      port.disconnect(); return;
    }
    let token: string | undefined;
    let busy = false;
    let disconnected = false;
    const expiry = setTimeout(() => port.disconnect(), 5 * 60_000);
    port.onDisconnect.addListener(() => {
      disconnected = true;
      clearTimeout(expiry);
      if (token) toastSessions.revoke(token);
    });
    port.onMessage.addListener(async request => {
      let acquired = false;
      try {
        if (!token) {
          if (typeof request.token !== 'string') { port.disconnect(); return; }
          const session = toastSessions.claim(request.token, tabId, frameId);
          if (!session) { port.disconnect(); return; }
          token = request.token;
          const [item, organizer] = await Promise.all([getItem(session.itemId), getOrganizerData()]);
          if (disconnected || !item || !toastSessions.get(token!, tabId, frameId)) { port.disconnect(); return; }
          port.postMessage({type:'init', item, duplicate:session.duplicate, ...organizer});
          return;
        }
        const session = toastSessions.get(token, tabId, frameId);
        if (!session) { port.disconnect(); return; }
        if (busy) throw new Error('An operation is already in progress');
        busy = true;
        acquired = true;
        let result;
        switch (request.message?.type) {
          case MESSAGE.saveItemOrganization:
            if (!Array.isArray(request.message.tags) || !request.message.tags.every((value: unknown) => typeof value === 'string') ||
                !Array.isArray(request.message.collectionIds) || !request.message.collectionIds.every((value: unknown) => typeof value === 'string') ||
                (request.message.newCollectionName !== undefined && typeof request.message.newCollectionName !== 'string')) throw new Error('Invalid organization');
            result = await saveItemOrganization({...request.message, itemId:session.itemId});
            break;
          case MESSAGE.deleteItem:
            if (session.duplicate) throw new Error('Cannot undo an existing item');
            toastSessions.revoke(token);
            result = await removeItem(session.itemId);
            break;
          case MESSAGE.openLibrary:
            result = await openLibraryPage(session.itemId);
            break;
          default: throw new Error('Unsupported toast operation');
        }
        if (!disconnected) port.postMessage({id:request.id, result});
      } catch (error) {
        if (!disconnected) port.postMessage({id:request.id, error:error instanceof Error ? error.message : 'Operation failed'});
      } finally { if (acquired) busy = false; }
    });
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    // Embedded extension documents must use their scoped port, never the full UI API.
    const extensionUI = sender.id === browser.runtime.id && (sender.frameId === undefined || sender.frameId === 0) &&
      (['/popup.html', '/library.html', '/options.html'] as const).some(path => sender.url?.split(/[?#]/, 1)[0] === browser.runtime.getURL(path));
    if (!extensionUI) {
      if (sender.id !== browser.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined) return;
      if (message?.type === 'pixstash/revoke-toast') {
        toastSessions.revoke(message.token, sender.tab.id);
        return Promise.resolve({ok:true});
      }
      if (message?.type === MESSAGE.reportCaptureIssue && isCaptureErrorCode(message.errorCode)) {
        return recordCaptureIssue(sender.tab.id, message.errorCode).then(() => ({ok:true}));
      }
      if (message?.type === MESSAGE.retryCapture) {
        const tabId = sender.tab.id;
        return recentCaptureIssue(tabId).then(issue => issue ? startRegionCapture(tabId) : {ok:false, errorCode:'capture_failed'});
      }
      if (message?.type !== MESSAGE.completeRegionCapture) return;
    }

    switch (message?.type) {
      case MESSAGE.getActiveContext:
        return getActiveContext(true);
      case MESSAGE.getOrganizerData:
        return getOrganizerData();
      case MESSAGE.saveItemOrganization:
        return saveItemOrganization(message);
      case MESSAGE.captureInstant:
        return captureInstant();
      case MESSAGE.capturePageImage:
        return capturePageImage();
      case MESSAGE.startRegionCapture:
        return startRegionCapture();
      case MESSAGE.completeRegionCapture:
        return completeRegionCapture(sender.tab?.id, message.selection, message.pageCandidate);
      case MESSAGE.deleteItem:
        return removeItem(message.itemId);
      case MESSAGE.openLibrary:
        return openLibraryPage(message.itemId);
      default:
        return undefined;
    }
  });
});

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) {
    throw new Error('No active tab available');
  }

  return tab;
}

async function injectPageDetectScript(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/page-detect.js'],
  });
}

async function sendMessageToTab(tabId: number, message: unknown) {
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch {
    await injectPageDetectScript(tabId);
    return browser.tabs.sendMessage(tabId, message);
  }
}

async function askPageCandidate(tabId: number) {
  const requestCandidate = async () => {
    const response = (await browser.tabs.sendMessage(tabId, {
      type: MESSAGE.getPageCandidate,
    })) as PageCandidate | null;

    return response ?? null;
  };

  try {
    return await requestCandidate();
  } catch {
    try {
      await injectPageDetectScript(tabId);
      return await requestCandidate();
    } catch {
      return null;
    }
  }
}

async function getActiveContext(includePreview = false): Promise<ActiveContext> {
  const tab = await getActiveTab();
  const pageCandidate = await askPageCandidate(tab.id!);
  const sourceUrl = tab.url ?? '';
  let pagePreviewUrl: string | undefined;
  let previewError: CaptureErrorCode | undefined;
  if (includePreview && pageCandidate) {
    try { pagePreviewUrl = (await normalizeExternalImage(pageCandidate.imageUrl)).preview; }
    catch (error) { previewError = captureErrorCode(error); }
  }

  return {
    pagePreviewUrl,
    previewError,
    captureError: await recentCaptureIssue(tab.id!),
    tabId: tab.id!,
    pageTitle: tab.title ?? 'Untitled page',
    sourceUrl,
    siteName: inferSiteName(sourceUrl),
    pageCandidate,
  };
}

async function createPreviewAsset(dataUrl: string) {
  return createPreviewFromDataUrl(dataUrl);
}

async function getOrganizerData(): Promise<OrganizerData> {
  const [collections, knownTags] = await Promise.all([listCollections(), listKnownTags()]);
  return { collections, knownTags };
}

async function notifyLibraryChanged() {
  try {
    await browser.runtime.sendMessage({ type: MESSAGE.libraryChanged });
  } catch {
    // Ignore when no extension page is listening.
  }
}

function normalizeCollectionName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

async function saveItemOrganization(input: SaveItemOrganizationInput): Promise<SaveItemOrganizationResponse> {
  try {
    const collections = await listCollections();
    const nextCollectionIds = [...new Set(input.collectionIds)];
    const nextCollectionName = input.newCollectionName?.trim();

    if (nextCollectionName) {
      const existing = collections.find(
        (collection) => normalizeCollectionName(collection.name) === normalizeCollectionName(nextCollectionName),
      );
      const targetCollection = existing ?? (await createCollection(nextCollectionName));
      nextCollectionIds.push(targetCollection.id);
    }

    await setItemCollections(input.itemId, nextCollectionIds);
    const item = await setItemTags(input.itemId, normalizeTags(input.tags));
    const organizer = await getOrganizerData();
    await notifyLibraryChanged();

    return {
      ok: true,
      item,
      ...organizer,
    };
  } catch (error) {
    const organizer = await getOrganizerData();
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to update item details',
      ...organizer,
    };
  }
}

async function showCaptureToast(tabId: number, item: CaptureResponse['item'], duplicate: boolean) {
  if (!item) {
    return;
  }

  const token = toastSessions.create(tabId, item.id, duplicate);
  try {
    await sendMessageToTab(tabId, {type: MESSAGE.showCaptureToast, token});
  } catch (error) {
    toastSessions.revoke(token);
    throw error;
  }
}

async function captureInstant(): Promise<CaptureResponse> {
  try {
    const tab = await getActiveTab();
    const context = await getActiveContext();
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const preview = await createPreviewAsset(screenshot);
    const { item, duplicate } = await createCapturedItem({
      previewUrl: preview.dataUrl,
      imageUrl: screenshot,
      originalImageUrl: null,
      captureMode: 'instant_screenshot',
      sourceUrl: context.sourceUrl,
      pageTitle: context.pageTitle,
      siteName: context.siteName,
      metadata: context.pageCandidate?.metadata,
      width: preview.width,
      height: preview.height,
    });
    await notifyLibraryChanged();

    await clearCaptureIssue(context.tabId);
    return { ok: true, item, duplicate };
  } catch (error) {
    return {
      ok: false,
      errorCode: captureErrorCode(error),
      error: error instanceof Error ? error.message : 'Capture failed',
    };
  }
}

async function capturePageImage(): Promise<CaptureResponse> {
  try {
    const context = await getActiveContext();

    if (!context.pageCandidate) {
      return {
        ok: false,
        error: 'No page image candidate detected on this page.',
      };
    }

    const normalized = await normalizeExternalImage(context.pageCandidate.imageUrl);

    const pageRecord = createPageCandidateRecord(context.pageCandidate, context.sourceUrl, context.pageTitle);
    const { item, duplicate } = await createCapturedItem({
      previewUrl: normalized.preview,
      imageUrl: normalized.original,
      originalImageUrl: context.pageCandidate.imageUrl,
      captureMode: 'page_image',
      sourceUrl: pageRecord.sourceUrl,
      pageTitle: pageRecord.pageTitle,
      siteName: pageRecord.siteName,
      metadata: pageRecord.metadata,
      width: normalized.width,
      height: normalized.height,
    });
    await notifyLibraryChanged();

    await clearCaptureIssue(context.tabId);
    return { ok: true, item, duplicate };
  } catch (error) {
    return {
      ok: false,
      errorCode: captureErrorCode(error),
      error: error instanceof Error ? error.message : 'Page image capture failed',
    };
  }
}

async function startRegionCapture(tabId?: number) {
  try {
    const tab = tabId === undefined ? await getActiveTab() : await browser.tabs.get(tabId);
    if (!tab.active) return {ok:false, errorCode:'capture_failed'};

    try {
      await browser.tabs.sendMessage(tab.id!, { type: MESSAGE.beginRegionSelection });
    } catch {
      await injectPageDetectScript(tab.id!);
      await browser.tabs.sendMessage(tab.id!, { type: MESSAGE.beginRegionSelection });
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: captureErrorCode(error),
      error: error instanceof Error ? error.message : 'Unable to start region capture',
    };
  }
}

async function completeRegionCapture(tabId: number | undefined, selection: RegionSelection, pageCandidate: PageCandidate | null) {
  if (!tabId) {
    return { ok: false, error: 'Missing tab id for region capture' };
  }

  try {
    const tab = await browser.tabs.get(tabId);
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const cropped = await cropDataUrl(screenshot, selection);
    const preview = await createPreviewAsset(cropped);
    const pageRecord = createPageCandidateRecord(pageCandidate, tab.url ?? '', tab.title ?? 'Untitled page');
    const { item, duplicate } = await createCapturedItem({
      previewUrl: preview.dataUrl,
      imageUrl: cropped,
      originalImageUrl: null,
      captureMode: 'region_screenshot',
      sourceUrl: pageRecord.sourceUrl,
      pageTitle: pageRecord.pageTitle,
      siteName: pageRecord.siteName,
      metadata: pageRecord.metadata,
      width: preview.width,
      height: preview.height,
    });

    await notifyLibraryChanged();
    await clearCaptureIssue(tabId);
    await showCaptureToast(tabId, item, duplicate).catch(() => recordCaptureIssue(tabId, 'saved_notice_failed'));

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: captureErrorCode(error),
      error: error instanceof Error ? error.message : 'Region capture failed',
    };
  }
}

async function removeItem(itemId: string) {
  await deleteItem(itemId);
  await notifyLibraryChanged();
  return { ok: true };
}

async function captureContextMenuImage(
  imageUrl: string | undefined,
  tabId: number | undefined,
  pageUrl: string,
  pageTitle: string,
) {
  if (!imageUrl || !tabId) {
    return { ok: false, error: 'Missing image source' };
  }

  try {
    const normalized = await normalizeExternalImage(imageUrl);
    const { item, duplicate } = await createCapturedItem({
      previewUrl: normalized.preview,
      imageUrl: normalized.original,
      originalImageUrl: imageUrl,
      captureMode: 'page_image',
      sourceUrl: pageUrl || imageUrl,
      pageTitle,
      siteName: inferSiteName(pageUrl || imageUrl),
      metadata: { source_type: 'context-menu-image' },
      width: normalized.width,
      height: normalized.height,
    });

    await notifyLibraryChanged();
    await clearCaptureIssue(tabId);
    await showCaptureToast(tabId, item, duplicate).catch(() => recordCaptureIssue(tabId, 'saved_notice_failed'));
    return { ok: true, item, duplicate };
  } catch (error) {
    return {
      ok: false,
      errorCode: captureErrorCode(error),
      error: error instanceof Error ? error.message : 'Image stash failed',
    };
  }
}

async function openLibraryPage(itemId?: string) {
  const url = new URL(browser.runtime.getURL('/library.html'));

  if (itemId) {
    url.searchParams.set('item', itemId);
  }

  await browser.tabs.create({
    url: url.toString(),
  });

  return { ok: true };
}
