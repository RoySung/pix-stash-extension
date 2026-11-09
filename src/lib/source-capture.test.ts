import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureSourceLocatorForTab, captureVerifiedScreenshot } from './source-capture';
import { locatorFixture } from './source-locator.fixture';
let api: any;
beforeEach(() => { api = { tabs: { get: vi.fn(async () => ({ id: 1, url: 'https://example.com/album', active: true })), query: vi.fn(async () => [{ id: 1 }]), captureVisibleTab: vi.fn(async () => 'data:image/png;base64,AA=='), sendMessage: vi.fn(async (_id: number, message: any) => message.type.includes('verify') ? { valid: true } : { token: 'capture', locator: locatorFixture({ captureMode: 'region_screenshot' }) }) } }; vi.stubGlobal('browser', api); });
const tab = { id: 1, url: 'https://example.com/album', windowId: 1 };
const region = { x: 0, y: 0, width: 200, height: 200, viewportWidth: 1000, viewportHeight: 800 };
describe('capture binding', () => {
  it.each(['instant_screenshot', 'region_screenshot'] as const)('allows %s on a local file without locator evidence', async mode => {
    const localTab = { ...tab, url: 'file:///photos/album.html' };
    api.tabs.get.mockResolvedValue(localTab);
    api.tabs.sendMessage.mockRejectedValue(new Error('No script'));
    const result = await captureVerifiedScreenshot(localTab, mode, mode === 'region_screenshot' ? region : undefined);
    expect(result.screenshot).toContain('data:image');
    expect(result.sourceLocator).toBeUndefined();
    expect(api.tabs.captureVisibleTab).toHaveBeenCalledWith(tab.windowId, { format: 'png' });
  });
  it('retains evidence only for the bound document and mode', async () => { expect((await captureVerifiedScreenshot(tab, 'region_screenshot', region)).sourceLocator).toBeDefined(); api.tabs.get.mockResolvedValue({ ...tab, url: 'https://example.com/elsewhere' }); expect(await captureSourceLocatorForTab(1, tab.url, 'region_screenshot')).toBeUndefined(); });
  it('rejects a prepared region from an old document even when the URL is unchanged', async () => { api.tabs.sendMessage.mockResolvedValue({ valid: false }); await expect(captureVerifiedScreenshot(tab, 'region_screenshot', region, { token: 'old-document', pageUrl: tab.url, locator: locatorFixture() })).rejects.toThrow('document changed'); expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled(); });
  it('rejects a tab switch before and after screenshot', async () => { api.tabs.query.mockResolvedValue([{ id: 2 }]); await expect(captureVerifiedScreenshot(tab, 'region_screenshot', region)).rejects.toThrow('target changed'); expect(api.tabs.captureVisibleTab).not.toHaveBeenCalled(); api.tabs.query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 2 }]); await expect(captureVerifiedScreenshot(tab, 'region_screenshot', region)).rejects.toThrow('target changed'); });
  it('rejects geometry changes for regions, drops stale clues for viewport capture', async () => { api.tabs.sendMessage.mockImplementation(async (_id: number, message: any) => message.type.includes('verify') ? { valid: false } : { token: 'capture', locator: locatorFixture({ captureMode: message.mode }) }); await expect(captureVerifiedScreenshot(tab, 'region_screenshot', region)).rejects.toThrow('geometry changed'); expect((await captureVerifiedScreenshot(tab, 'instant_screenshot')).sourceLocator).toBeUndefined(); });
  it('saves screenshot when evidence is unavailable and rejects malformed crop', async () => { api.tabs.sendMessage.mockRejectedValue(new Error('No script')); expect((await captureVerifiedScreenshot(tab, 'region_screenshot', region)).screenshot).toContain('data:image'); await expect(captureVerifiedScreenshot(tab, 'region_screenshot', { ...region, x: NaN })).rejects.toThrow('Invalid screenshot'); });
});
