import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { resetDbForTests } from "./db";
import {
  createCapturedItem,
  createCollection,
  deleteCollection,
  listItems,
  listKnownTags,
  saveItem,
  setItemCollections,
  setItemTags,
} from "./items";

async function resetTestDatabase() {
  await resetDbForTests();

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("pixstash");
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to delete test database"));
    request.onblocked = () =>
      reject(new Error("Test database reset was blocked"));
  });
}

describe("captured item deduplication", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("reuses an existing page image from the same page", async () => {
    const first = await createCapturedItem({
      previewUrl: "data:image/png;base64,preview-1",
      imageUrl: "data:image/png;base64,normalized-1",
      originalImageUrl: "https://cdn.example.com/hero.png",
      sourceUrl: "https://example.com/article",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "page_image",
    });
    const second = await createCapturedItem({
      previewUrl: "data:image/png;base64,preview-2",
      imageUrl: "data:image/png;base64,normalized-2",
      originalImageUrl: "https://cdn.example.com/hero.png",
      sourceUrl: "https://example.com/article",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "page_image",
    });

    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(second.duplicate).toBe(true);
    expect(second.item.id).toBe(first.item.id);
  });

  it("reuses an existing screenshot with the same image payload", async () => {
    const first = await createCapturedItem({
      previewUrl: "data:image/png;base64,abc",
      imageUrl: "data:image/png;base64,abc",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    await saveItem({
      ...first.item,
      captureTime: new Date(Date.now() - 5_000).toISOString(),
    });

    const second = await createCapturedItem({
      previewUrl: "data:image/png;base64,abc",
      imageUrl: "data:image/png;base64,abc",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(second.duplicate).toBe(true);
    expect(second.item.id).toBe(first.item.id);
  });

  it("stores a new instant screenshot when the image payload changes within the dedupe window", async () => {
    await createCapturedItem({
      previewUrl: "data:image/png;base64,abc",
      imageUrl: "data:image/png;base64,abc",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    const second = await createCapturedItem({
      previewUrl: "data:image/png;base64,def",
      imageUrl: "data:image/png;base64,def",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    const items = await listItems();
    expect(items).toHaveLength(2);
    expect(second.duplicate).toBe(false);
  });

  it("stores a new instant screenshot after the dedupe window elapses", async () => {
    const first = await createCapturedItem({
      previewUrl: "data:image/png;base64,first",
      imageUrl: "data:image/png;base64,first",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    await saveItem({
      ...first.item,
      captureTime: new Date(Date.now() - 11_000).toISOString(),
    });

    const second = await createCapturedItem({
      previewUrl: "data:image/png;base64,second",
      imageUrl: "data:image/png;base64,second",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    const items = await listItems();
    expect(items).toHaveLength(2);
    expect(second.duplicate).toBe(false);
  });
});

describe("tags", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("normalizes and stores tags on an item", async () => {
    const { item } = await createCapturedItem({
      previewUrl: "data:image/png;base64,tags-1",
      imageUrl: "data:image/png;base64,tags-1",
      originalImageUrl: null,
      sourceUrl: "https://example.com/tags",
      pageTitle: "Tags Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    await setItemTags(item.id, [" Warm Tone ", "warm tone", "matte   finish"]);

    const [savedItem] = await listItems();
    expect(savedItem.tags).toEqual(["warm tone", "matte finish"]);
  });

  it("lists known tags by usage count and then alphabetically", async () => {
    const first = await createCapturedItem({
      previewUrl: "data:image/png;base64,known-1",
      imageUrl: "data:image/png;base64,known-1",
      originalImageUrl: null,
      sourceUrl: "https://example.com/1",
      pageTitle: "First",
      siteName: "example.com",
      captureMode: "instant_screenshot",
      tags: ["linen", "sample"],
    });

    const second = await createCapturedItem({
      previewUrl: "data:image/png;base64,known-2",
      imageUrl: "data:image/png;base64,known-2",
      originalImageUrl: null,
      sourceUrl: "https://example.com/2",
      pageTitle: "Second",
      siteName: "example.com",
      captureMode: "instant_screenshot",
      tags: ["sample", "tone"],
    });

    expect(first.item.tags).toEqual(["linen", "sample"]);
    expect(second.item.tags).toEqual(["sample", "tone"]);
    expect(await listKnownTags()).toEqual(["sample", "linen", "tone"]);
  });
});

describe("collection deletion fallback", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("removes deleted collection ids from items instead of deleting the items", async () => {
    const collection = await createCollection("Race Day");
    const { item } = await createCapturedItem({
      previewUrl: "data:image/png;base64,abc",
      imageUrl: "data:image/png;base64,abc",
      originalImageUrl: null,
      sourceUrl: "https://example.com",
      pageTitle: "Example",
      siteName: "example.com",
      captureMode: "instant_screenshot",
    });

    await setItemCollections(item.id, [collection.id]);
    await deleteCollection(collection.id);

    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0].collectionIds).toEqual([]);
  });
});

describe("database migration", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("drops legacy status and favorite fields when opening v2", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pixstash", 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        const itemStore = db.createObjectStore("items", { keyPath: "id" });
        itemStore.createIndex("by-capture-time", "captureTime");
        itemStore.createIndex("by-site-name", "siteName");
        itemStore.createIndex("by-status", "status");
        itemStore.createIndex("by-favorite", "favorite");

        const collectionStore = db.createObjectStore("collections", {
          keyPath: "id",
        });
        collectionStore.createIndex("by-created-at", "createdAt");
        collectionStore.createIndex("by-name", "name");
      };

      request.onerror = () =>
        reject(request.error ?? new Error("Unable to create legacy database"));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("items", "readwrite");

        tx.objectStore("items").put({
          id: "legacy-item",
          previewUrl: "data:image/png;base64,legacy",
          imageUrl: "data:image/png;base64,legacy",
          originalImageUrl: null,
          sourceUrl: "https://legacy.example.com",
          pageTitle: "Legacy item",
          siteName: "legacy.example.com",
          captureTime: new Date().toISOString(),
          captureMode: "instant_screenshot",
          notes: "",
          metadata: {},
          status: "picked",
          favorite: true,
          collectionIds: [],
        });

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () =>
          reject(tx.error ?? new Error("Unable to seed legacy item"));
      };
    });

    const [savedItem] = await listItems();
    expect(savedItem.id).toBe("legacy-item");
    expect(savedItem.tags).toEqual([]);
    expect("status" in savedItem).toBe(false);
    expect("favorite" in savedItem).toBe(false);
  });
});

describe('source locator storage',()=>{
  beforeEach(resetTestDatabase);
  it('preserves locator through organization, deduplication and deletion',async()=>{
    const {locatorFixture}=await import('./source-locator.fixture');
    const {deleteItem,getItem}=await import('./items');
    const sourceLocator=locatorFixture();
    const input={previewUrl:'data:image/png;base64,abc',imageUrl:'data:image/png;base64,abc',originalImageUrl:'https://example.com/photo.jpg',sourceUrl:sourceLocator.page.url,pageTitle:'Album',siteName:'example.com',captureMode:'page_image' as const,sourceLocator};
    const {item}=await createCapturedItem(input);
    await setItemTags(item.id,['Race']);await setItemCollections(item.id,['collection']);
    const duplicate=await createCapturedItem({...input,sourceLocator:{...sourceLocator,capturedAt:sourceLocator.capturedAt+1000}});
    expect(duplicate.item.sourceLocator).toEqual(sourceLocator);
    expect((await getItem(item.id))?.sourceLocator).toEqual(sourceLocator);
    await deleteItem(item.id);expect(await getItem(item.id)).toBeUndefined();
  });
});

describe('observed link enrichment',()=>{
 beforeEach(resetTestDatabase);
 it('adds navigation hints on explicit repeat capture of identical bytes, keeping original anchors and notes',async()=>{
 const {locatorFixture}=await import('./source-locator.fixture');const {setItemNotes}=await import('./items');
 const first=locatorFixture();const input={previewUrl:'data:image/png;base64,a',imageUrl:'data:image/png;base64,a',originalImageUrl:first.anchors[0].urls[0],sourceUrl:first.page.url,pageTitle:'Album',siteName:'example.com',captureMode:'page_image' as const,sourceLocator:first};
 const {item}=await createCapturedItem(input);await setItemNotes(item.id,'keep my notes');
 const result=await createCapturedItem({...input,sourceLocator:{...first,capturedAt:first.capturedAt+1000,page:{...first.page,links:['https://example.com/photo/1']}}});
 expect(result.duplicate).toBe(true);expect(result.item.sourceLocator?.page.links).toContain('https://example.com/photo/1');expect(result.item.sourceLocator?.capturedAt).toBe(first.capturedAt);expect(result.item.notes).toBe('keep my notes');
 });
});
