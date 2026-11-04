import { getDb } from "./db";
import type {
  CaptureMode,
  CollectionRecord,
  ItemRecord,
  PageCandidate,
} from "./types";

const INSTANT_SCREENSHOT_DEDUPE_WINDOW_MS = 10_000;

export function normalizeTag(tag: string) {
  return tag.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = normalizeTag(tag);

    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export async function listItems() {
  const db = await getDb();
  const items = await db.getAllFromIndex("items", "by-capture-time");
  return items.toSorted((left, right) =>
    right.captureTime.localeCompare(left.captureTime),
  );
}

export async function getItem(itemId: string) {
  const db = await getDb();
  return db.get("items", itemId);
}

export async function saveItem(item: ItemRecord) {
  const db = await getDb();
  await db.put("items", item);
  return item;
}

export async function deleteItem(itemId: string) {
  const db = await getDb();
  await db.delete("items", itemId);
}

export async function updateItem(itemId: string, patch: Partial<ItemRecord>) {
  const db = await getDb();
  const current = await db.get("items", itemId);

  if (!current) {
    throw new Error("Item not found");
  }

  const next = { ...current, ...patch } satisfies ItemRecord;
  await db.put("items", next);
  return next;
}

export async function setItemTags(itemId: string, tags: string[]) {
  return updateItem(itemId, { tags: normalizeTags(tags) });
}

export async function setItemNotes(itemId: string, notes: string) {
  return updateItem(itemId, { notes });
}

export async function setItemCollections(
  itemId: string,
  collectionIds: string[],
) {
  return updateItem(itemId, { collectionIds: [...new Set(collectionIds)] });
}

export async function listKnownTags() {
  const db = await getDb();
  const items = await db.getAll("items");
  const counts = new Map<string, number>();

  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .map(([tag]) => tag);
}

export async function listCollections() {
  const db = await getDb();
  const collections = await db.getAllFromIndex("collections", "by-created-at");
  return collections.toSorted((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export async function createCollection(name: string) {
  const collection: CollectionRecord = {
    id: crypto.randomUUID(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  await db.put("collections", collection);
  return collection;
}

export async function renameCollection(collectionId: string, name: string) {
  const db = await getDb();
  const collection = await db.get("collections", collectionId);

  if (!collection) {
    throw new Error("Collection not found");
  }

  const updated = { ...collection, name: name.trim() };
  await db.put("collections", updated);
  return updated;
}

export async function deleteCollection(collectionId: string) {
  const db = await getDb();
  const tx = db.transaction(["collections", "items"], "readwrite");
  await tx.objectStore("collections").delete(collectionId);
  const items = await tx.objectStore("items").getAll();

  for (const item of items) {
    if (!item.collectionIds.includes(collectionId)) {
      continue;
    }

    await tx.objectStore("items").put({
      ...item,
      collectionIds: item.collectionIds.filter((id) => id !== collectionId),
    });
  }

  await tx.done;
}

export interface CreateCapturedItemInput {
  previewUrl: string;
  imageUrl: string;
  originalImageUrl: string | null;
  sourceUrl: string;
  pageTitle: string;
  siteName: string;
  captureMode: CaptureMode;
  metadata?: Record<string, string>;
  width?: number;
  height?: number;
  tags?: string[];
}

export interface CreateCapturedItemResult {
  item: ItemRecord;
  duplicate: boolean;
}

function isDuplicateCapturedItem(
  item: ItemRecord,
  input: CreateCapturedItemInput,
  captureTime: Date,
) {
  if (item.sourceUrl !== input.sourceUrl) {
    return false;
  }

  if (input.captureMode === "page_image") {
    if (item.captureMode !== "page_image") {
      return false;
    }

    return (
      (item.originalImageUrl ?? item.imageUrl) ===
      (input.originalImageUrl ?? input.imageUrl)
    );
  }

  if (input.captureMode === "instant_screenshot") {
    if (item.captureMode !== "instant_screenshot") {
      return false;
    }

    const previousCaptureTime = Date.parse(item.captureTime);

    if (Number.isNaN(previousCaptureTime)) {
      return false;
    }

    return (
      item.imageUrl === input.imageUrl &&
      captureTime.getTime() - previousCaptureTime <=
        INSTANT_SCREENSHOT_DEDUPE_WINDOW_MS
    );
  }

  if (item.captureMode !== input.captureMode) {
    return false;
  }

  return item.imageUrl === input.imageUrl;
}

export async function createCapturedItem(input: CreateCapturedItemInput) {
  const db = await getDb();
  const captureTime = new Date();
  const existing = (await db.getAll("items")).find((item) =>
    isDuplicateCapturedItem(item, input, captureTime),
  );

  if (existing) {
    return {
      item: existing,
      duplicate: true,
    } satisfies CreateCapturedItemResult;
  }

  const item: ItemRecord = {
    id: crypto.randomUUID(),
    previewUrl: input.previewUrl,
    imageUrl: input.imageUrl,
    originalImageUrl: input.originalImageUrl,
    sourceUrl: input.sourceUrl,
    pageTitle: input.pageTitle,
    siteName: input.siteName,
    captureTime: captureTime.toISOString(),
    captureMode: input.captureMode,
    notes: "",
    metadata: input.metadata ?? {},
    tags: normalizeTags(input.tags ?? []),
    collectionIds: [],
    width: input.width,
    height: input.height,
  };

  await db.put("items", item);
  return {
    item,
    duplicate: false,
  } satisfies CreateCapturedItemResult;
}

export function inferSiteName(urlString: string) {
  try {
    const url = new URL(urlString);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function createPageCandidateRecord(
  candidate: PageCandidate | null | undefined,
  fallbackUrl: string,
  fallbackTitle: string,
) {
  return {
    sourceUrl: candidate?.sourceUrl ?? fallbackUrl,
    pageTitle: candidate?.pageTitle ?? fallbackTitle,
    siteName:
      candidate?.siteName ?? inferSiteName(candidate?.sourceUrl ?? fallbackUrl),
    metadata: candidate?.metadata ?? {},
  };
}
