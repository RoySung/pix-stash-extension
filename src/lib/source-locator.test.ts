import { describe, expect, it } from 'vitest';
import { distinctiveText, fitSourceLocator, httpUrl, normalizeLocatorText, parseSourceLocator } from './source-locator';
import { compareAnchor, imageMatch, imageVariantKey, reliableAnchor } from './source-locator-match';
import { anchorFixture, locatorFixture } from './source-locator.fixture';
describe('source evidence contract', () => {
  it('round trips and clones the optional versioned payload', () => { const locator = locatorFixture(); const saved = parseSourceLocator(locator)!; expect(saved).toEqual(locator); expect(saved).not.toBe(locator); });
  it.each([undefined, null, {}, locatorFixture({ version: 2 as 1 }), locatorFixture({ captureRect: { x: NaN, y: 0, width: 1, height: 1 } }), locatorFixture({ anchors: Array.from({ length: 13 }, () => anchorFixture()) }), locatorFixture({ page: { url: 'javascript:alert(1)', title: '', links: [] } })])('rejects invalid input %#', value => { expect(parseSourceLocator(value)).toBeUndefined(); });
  it('bounds total text and bytes without truncating JSON', () => { const value = locatorFixture({ anchors: Array.from({ length: 12 }, () => anchorFixture({ text: '中'.repeat(200), context: '文'.repeat(200) })) }); expect(parseSourceLocator(value)).toBeUndefined(); const fitted = fitSourceLocator(value)!; expect(fitted.truncated).toBe(true); expect(fitted.anchors.length).toBeLessThan(12); expect(parseSourceLocator(fitted)).toBeDefined(); });
  it('keeps Chinese, case and meaningful numbers', () => { expect(normalizeLocatorText('  台北\n馬拉松 A123 ')).toBe('台北 馬拉松 A123'); expect(distinctiveText('2026/11/08')).toBe(false); expect(distinctiveText('NT$ 100')).toBe(false); expect(distinctiveText('台北馬拉松終點照片')).toBe(true); expect(httpUrl('https://user:password@example.com')).toBeUndefined(); expect(httpUrl('', 'https://example.com')).toBeUndefined(); });
});
describe('conservative identity rules', () => {
  it('preserves identity, path, signature, and unknown parameters', () => { const url = anchorFixture().urls[0]; expect(imageVariantKey(url)).toContain('id=17'); expect(imageVariantKey(url)).toContain('sig=keep'); expect(imageMatch([url], [url.replace('w=100', 'w=400')])).toBe('variant'); expect(imageMatch([url], [url.replace('id=17', 'id=18')])).toBeUndefined(); expect(imageMatch([url], [url.replace('/photos/', '/other/')])).toBeUndefined(); expect(imageMatch([url], [url + '&token=secret'])).toBeUndefined(); });
  it('requires independent support for variants and ignores random IDs as proof', () => { const a = anchorFixture(); const b = anchorFixture({ urls: [a.urls[0].replace('w=100', 'w=400')] }); expect(reliableAnchor(a, b)).toBe(false); a.context = b.context = 'Unique marathon finish'; expect(reliableAnchor(a, b)).toBe(true); });
  it('rejects contradictory context and weak navigation evidence', () => { const a = anchorFixture({ context: 'Marathon finish photos' }); expect(compareAnchor(a, anchorFixture({ context: 'Other unrelated products' })).contradiction).toBe(true); expect(reliableAnchor(a, anchorFixture({ weak: true, context: a.context }))).toBe(false); });
});

describe('expiring signed image resources', () => {
  const oldUrl = 'https://cdn.example.com/album/photo.jpg?photo_id=17&x-oss-process=style%2Fpreview&OSSAccessKeyId=old-key&Expires=1700000000&Signature=old-signature';
  const newUrl = oldUrl.replace('old-key','new-key').replace('1700000000','1800000000').replace('old-signature','new-signature');
  it('requires matching independent content before accepting a refreshed signing envelope', () => {
    const saved=anchorFixture({urls:[oldUrl],alt:'照片 ID: 29340293'});
    const candidate=anchorFixture({urls:[newUrl],alt:'照片 ID: 29340293'});
    expect(reliableAnchor(saved,candidate)).toBe(true);
    expect(reliableAnchor({...saved,alt:undefined},{...candidate,alt:undefined})).toBe(false);
    expect(reliableAnchor(saved,{...candidate,alt:'照片 ID: 29340294'})).toBe(false);
  });
  it('keeps resource IDs, transforms, arbitrary query parameters and directories distinct', () => {
    const saved=anchorFixture({urls:[oldUrl],alt:'照片 ID: 29340293'});
    for(const url of [newUrl.replace('photo_id=17','photo_id=18'),newUrl.replace('/album/','/other/'),newUrl+'&token=other',newUrl.replace('style%2Fpreview','style%2Foriginal')]) {
      expect(reliableAnchor(saved,anchorFixture({urls:[url],alt:saved.alt}))).toBe(false);
    }
  });
});

it('validates verified return links without accepting unverified cross-origin or malformed identities',()=>{
 const value=locatorFixture();value.page.verified={url:'https://example.com/photo/1',imageUrl:value.anchors[0].urls[0],imageHash:'a'.repeat(64),verifiedAt:Date.now()};
 expect(parseSourceLocator(value)?.page.verified?.url).toBe('https://example.com/photo/1');
 expect(parseSourceLocator({...value,page:{...value.page,verified:{...value.page.verified,url:'https://other.example/photo/1'}}})).toBeUndefined();
 expect(parseSourceLocator({...value,page:{...value.page,verified:{...value.page.verified,imageHash:'not-a-hash'}}})).toBeUndefined();
});
