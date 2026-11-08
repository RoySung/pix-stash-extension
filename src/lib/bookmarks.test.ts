import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from './db';
import { addBookmarkIfMissing, deleteBookmark, listBookmarks, moveBookmark, normalizeBookmark, saveBookmark } from './bookmarks';
import { createCapturedItem, createCollection, listCollections, listItems } from './items';

beforeEach(async () => {
  await resetDbForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('pixstash');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe('website bookmarks', () => {
  it('adds a recommendation only once even when two library tabs add it concurrently', async () => {
    const [first, second] = await Promise.all([
      addBookmarkIfMissing('Unsplash', 'https://unsplash.com'),
      addBookmarkIfMissing('Unsplash', 'https://unsplash.com/'),
    ]);
    expect(first.id).toBe(second.id);
    expect(await listBookmarks()).toHaveLength(1);
    await resetDbForTests();
    expect((await listBookmarks())[0].name).toBe('Unsplash');
  });

  it('recognizes a renamed bookmark without replacing its name, position, or URL', async () => {
    await saveBookmark('First', 'https://example.com');
    const original = await saveBookmark('My race album', 'https://running.biji.co/?q=album#photos');
    const existing = await addBookmarkIfMissing('運動筆記', 'https://running.biji.co/?q=album');
    expect(existing).toEqual(original);
    expect(await listBookmarks()).toHaveLength(2);
    await deleteBookmark(original.id);
    await addBookmarkIfMissing('運動筆記', 'https://running.biji.co/?q=album');
    expect((await listBookmarks())[1].name).toBe('運動筆記');
  });

  it('stores independent websites, preserves edits and order after reopening, and removes only the bookmark', async () => {
    const first = await saveBookmark(' Unsplash ', ' https://unsplash.com ');
    const second = await saveBookmark('Pexels', 'https://pexels.com');
    await moveBookmark(second.id, -1);
    await saveBookmark('Free photos', 'https://unsplash.com/images', first.id);
    await resetDbForTests();
    expect(await listBookmarks()).toEqual([
      { ...second, position: 0 },
      { ...first, name: 'Free photos', url: 'https://unsplash.com/images', position: 1 },
    ]);
    const collection = await createCollection('Reference');
    const { item } = await createCapturedItem({ previewUrl: 'preview', imageUrl: 'image', originalImageUrl: null, sourceUrl: 'https://unsplash.com', pageTitle: 'Reference', siteName: 'Unsplash', captureMode: 'page_image' });
    await deleteBookmark(first.id);
    expect((await listBookmarks()).map(record => record.id)).toEqual([second.id]);
    expect((await listItems())[0].id).toBe(item.id);
    expect((await listCollections())[0].id).toBe(collection.id);
  });

  it('handles concurrent creates and moves without overwriting websites', async () => {
    const [first, second, third] = await Promise.all([
      saveBookmark('One', 'https://one.example'),
      saveBookmark('Two', 'https://two.example'),
      saveBookmark('Three', 'https://three.example'),
    ]);
    expect((await listBookmarks()).map(record => record.position)).toEqual([0, 1, 2]);
    await moveBookmark(first.id, -1);
    await moveBookmark(third.id, 1);
    expect((await listBookmarks()).map(record => record.id)).toEqual([first.id, second.id, third.id]);
    await deleteBookmark(second.id);
    await moveBookmark(third.id, -1);
    expect((await listBookmarks()).map(record => record.id)).toEqual([third.id, first.id]);
    await moveBookmark(third.id, 1);
    expect((await listBookmarks()).map(record => record.id)).toEqual([first.id, third.id]);
  });

  it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'ftp://example.com', 'https://user:password@example.com', 'not a url'])('rejects unsafe or invalid URLs: %s', async url => {
    await expect(saveBookmark('Website', url)).rejects.toMatchObject({ code: 'invalid_url' });
    expect(await listBookmarks()).toEqual([]);
  });

  it('validates names and does not resurrect a removed bookmark when editing', async () => {
    expect(() => normalizeBookmark('  ', 'https://example.com')).toThrow('invalid_name');
    expect(() => normalizeBookmark('x'.repeat(81), 'https://example.com')).toThrow('invalid_name');
    expect(normalizeBookmark('Local website', 'http://localhost:8080')).toEqual({ name: 'Local website', url: 'http://localhost:8080/' });
    const bookmark = await saveBookmark('Website', 'https://example.com');
    await deleteBookmark(bookmark.id);
    await expect(saveBookmark('Edited', 'https://example.com', bookmark.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await listBookmarks()).toEqual([]);
  });

  it('upgrades v2 while preserving existing images and collections', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixstash', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('by-capture-time', 'captureTime');
        items.createIndex('by-site-name', 'siteName');
        items.put({ id: 'existing-item', captureTime: '2026-11-07T00:00:00Z', tags: ['landscape'], collectionIds: ['existing-collection'] });
        const collections = db.createObjectStore('collections', { keyPath: 'id' });
        collections.createIndex('by-created-at', 'createdAt');
        collections.createIndex('by-name', 'name');
        collections.put({ id: 'existing-collection', name: 'Reference', createdAt: '2026-11-07T00:00:00Z' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const db = await getDb();
    expect(db.version).toBe(3);
    expect(await listBookmarks()).toEqual([]);
    expect((await listItems())[0]).toMatchObject({ id: 'existing-item', tags: ['landscape'], collectionIds: ['existing-collection'] });
    expect((await listCollections())[0].name).toBe('Reference');
    await saveBookmark('Website', 'https://example.com');
    expect(await listBookmarks()).toHaveLength(1);
  });
});
