import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { CollectionRecord, ItemRecord } from './types';

interface LegacyItemRecord extends Omit<ItemRecord, 'tags'> {
  favorite?: boolean;
  status?: 'candidate' | 'shortlisted' | 'picked' | 'rejected';
  tags?: string[];
}

interface PixStashSchema extends DBSchema {
  items: {
    key: string;
    value: ItemRecord;
    indexes: {
      'by-capture-time': string;
      'by-site-name': string;
    };
  };
  collections: {
    key: string;
    value: CollectionRecord;
    indexes: {
      'by-created-at': string;
      'by-name': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PixStashSchema>> | null = null;

function normalizeStoredTags(tags: string[] | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags ?? []) {
    const value = tag.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function normalizeLegacyItemRecord(item: LegacyItemRecord): ItemRecord {
  return {
    id: item.id,
    previewUrl: item.previewUrl,
    imageUrl: item.imageUrl,
    originalImageUrl: item.originalImageUrl,
    sourceUrl: item.sourceUrl,
    pageTitle: item.pageTitle,
    siteName: item.siteName,
    captureTime: item.captureTime,
    captureMode: item.captureMode,
    notes: item.notes,
    metadata: item.metadata,
    tags: normalizeStoredTags(item.tags),
    collectionIds: [...new Set(item.collectionIds)],
    width: item.width,
    height: item.height,
  };
}

function createStores(db: IDBPDatabase<PixStashSchema>) {
  const itemStore = db.createObjectStore('items', { keyPath: 'id' });
  itemStore.createIndex('by-capture-time', 'captureTime');
  itemStore.createIndex('by-site-name', 'siteName');

  const collectionStore = db.createObjectStore('collections', { keyPath: 'id' });
  collectionStore.createIndex('by-created-at', 'createdAt');
  collectionStore.createIndex('by-name', 'name');
}

async function migrateItemsToV2(db: IDBPDatabase<PixStashSchema>) {
  const transaction = db.transaction('items', 'readwrite');
  const itemStore = transaction.objectStore('items');
  const items = (await itemStore.getAll()) as LegacyItemRecord[];

  for (const item of items) {
    await itemStore.put(normalizeLegacyItemRecord(item));
  }

  await transaction.done;
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PixStashSchema>('pixstash', 2, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          createStores(db);
        }

        if (oldVersion < 2 && db.objectStoreNames.contains('items') && transaction) {
          const itemStore = transaction.objectStore('items');
          const legacyIndexes = new Set<string>(Array.from(itemStore.indexNames));

          if (legacyIndexes.has('by-status')) {
            itemStore.deleteIndex('by-status');
          }

          if (legacyIndexes.has('by-favorite')) {
            itemStore.deleteIndex('by-favorite');
          }

          const items = (await itemStore.getAll()) as LegacyItemRecord[];

          for (const item of items) {
            await itemStore.put(normalizeLegacyItemRecord(item));
          }
        }
      },
    });
  }

  return dbPromise;
}

export async function resetDbForTests() {
  if (!dbPromise) {
    return;
  }

  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
