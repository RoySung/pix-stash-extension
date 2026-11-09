import { withCaptureDeadline } from './capture-errors';
import { MESSAGE } from './messages';
import { parseSourceLocator, type LocatorMode, type LocatorRect } from './source-locator';
import type { SourceLocator } from './source-locator';
import type { CaptureSnapshot } from './source-locator-dom';
import type { RegionSelection } from './types';
async function requestSnapshot(tabId: number, mode: LocatorMode, rect?: LocatorRect, imageUrl?: string) {
  try {
    return await withCaptureDeadline(browser.tabs.sendMessage(tabId, { type: MESSAGE.captureSourceLocator, mode, rect, imageUrl }, { frameId: 0 }), 500);
  }
  catch {
    return undefined;
  }
}
function validLocator(value: unknown, url: string, mode: LocatorMode) {
  const locator = parseSourceLocator(value);
  return locator?.page.url === url && locator.captureMode === mode && Math.abs(Date.now() - locator.capturedAt) < 3000 ? locator : undefined;
}
export async function captureSourceLocatorForTab(tabId: number, url: string, mode: LocatorMode, rect?: LocatorRect, imageUrl?: string): Promise<SourceLocator | undefined> {
  const snapshot = await requestSnapshot(tabId, mode, rect, imageUrl);
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  return tab?.url === url ? validLocator(snapshot?.locator, url, mode) : undefined;
}
function validSelection(selection: RegionSelection) {
  return selection && [selection.x, selection.y, selection.width, selection.height, selection.viewportWidth, selection.viewportHeight].every(value => Number.isFinite(value) && value >= 0) && selection.width > 0 && selection.height > 0 && selection.x + selection.width <= selection.viewportWidth + 1 && selection.y + selection.height <= selection.viewportHeight + 1;
}
export async function captureVerifiedScreenshot(tab: {
  id?: number;
  url?: string;
  windowId?: number;
}, mode: 'instant_screenshot' | 'region_screenshot', selection?: RegionSelection, prepared?: CaptureSnapshot) {
  if (tab.windowId === undefined || tab.id === undefined || !tab.url || (mode === 'region_screenshot' && !validSelection(selection!)))
    throw new Error('Invalid screenshot target');
  const rect = selection ? { x: selection.x, y: selection.y, width: selection.width, height: selection.height } : undefined;
  const snapshot = prepared ?? await requestSnapshot(tab.id, mode, rect);
  const verify = async () => snapshot?.token && typeof snapshot.token === 'string' && snapshot.token.length <= 100 ? await browser.tabs.sendMessage(tab.id!, { type: MESSAGE.verifySourceCapture, token: snapshot.token }, { frameId: 0 }).catch(() => undefined) : undefined;
  if (prepared && (!(await verify())?.valid || prepared.pageUrl !== tab.url))
    throw new Error('Screenshot document changed');
  const checkTab = async () => {
    const current = await browser.tabs.get(tab.id!);
    const [active] = await browser.tabs.query({ active: true, windowId: tab.windowId });
    if (current.url !== tab.url || active?.id !== tab.id)
      throw new Error('Screenshot target changed');
  };
  await checkTab();
  const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await checkTab();
  const verification = await verify();
  const locator = validLocator(snapshot?.locator, tab.url!, mode);
  // A geometry change invalidates a crop. Missing evidence alone never blocks saving.
  if (selection && snapshot?.token && (!verification?.valid || (locator && (locator.viewport.width !== selection.viewportWidth || locator.viewport.height !== selection.viewportHeight))))
    throw new Error('Screenshot geometry changed');
  return { screenshot, sourceLocator: verification?.valid ? locator : undefined };
}
