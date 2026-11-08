import { getDb } from './db';
import type { BookmarkRecord } from './types';

export class BookmarkValidationError extends Error {
  constructor(public readonly code: 'invalid_name' | 'invalid_url' | 'not_found') {
    super(code);
  }
}

export function normalizeBookmark(name: string, url: string) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) {
    throw new BookmarkValidationError('invalid_name');
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new BookmarkValidationError('invalid_url');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new BookmarkValidationError('invalid_url');
  }
  return { name: trimmedName, url: parsed.href };
}

function sortBookmarks(records: BookmarkRecord[]) {
  return records.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export async function listBookmarks() {
  return sortBookmarks(await (await getDb()).getAll('bookmarks'));
}

// Ignore page fragments, query parameter order and trailing slashes when
// recognizing a recommendation that the user has already bookmarked.
export function bookmarkUrlKey(url: string) {
  const parsed = new URL(url);
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  parsed.searchParams.sort();
  return parsed.href;
}

export async function addBookmarkIfMissing(name: string, url: string) {
  const values = normalizeBookmark(name, url);
  const tx = (await getDb()).transaction('bookmarks', 'readwrite');
  const records = await tx.store.getAll();
  const key = bookmarkUrlKey(values.url);
  const existing = records.find(record => bookmarkUrlKey(record.url) === key);
  if (existing) {
    await tx.done;
    return existing;
  }
  const record: BookmarkRecord = {
    id: crypto.randomUUID(),
    ...values,
    position: Math.max(-1, ...records.map(record => record.position)) + 1,
  };
  await tx.store.put(record);
  await tx.done;
  return record;
}

export async function saveBookmark(name: string, url: string, id?: string) {
  const values = normalizeBookmark(name, url);
  const db = await getDb();
  const tx = db.transaction('bookmarks', 'readwrite');
  const records = await tx.store.getAll();
  const current = id ? records.find(record => record.id === id) : undefined;
  if (id && !current) {
    await tx.done;
    throw new BookmarkValidationError('not_found');
  }
  const record: BookmarkRecord = {
    id: current?.id ?? crypto.randomUUID(),
    ...values,
    position: current?.position ?? Math.max(-1, ...records.map(record => record.position)) + 1,
  };
  await tx.store.put(record);
  await tx.done;
  return record;
}

export async function deleteBookmark(id: string) {
  await (await getDb()).delete('bookmarks', id);
}

export async function moveBookmark(id: string, direction: -1 | 1) {
  const tx = (await getDb()).transaction('bookmarks', 'readwrite');
  const records = sortBookmarks(await tx.store.getAll());
  const index = records.findIndex(record => record.id === id);
  const nextIndex = index + direction;
  if (index >= 0 && nextIndex >= 0 && nextIndex < records.length) {
    [records[index], records[nextIndex]] = [records[nextIndex], records[index]];
    for (const [position, record] of records.entries()) {
      await tx.store.put({ ...record, position });
    }
  }
  await tx.done;
}
