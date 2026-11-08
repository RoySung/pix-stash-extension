import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  CustomSelect,
  ImagePreview,
  InlineTagEditor,
  ItemOrganizer,
  Modal,
} from "../../components";
import { ItemActions } from "./ItemActions";
import { LibraryTable } from "./LibraryTable";
import { BookmarksMenu } from "./BookmarksMenu";
import { isSelectionClick } from "./selection-click";
import {
  createCollection,
  deleteCollection,
  deleteItem,
  listCollections,
  listItems,
  listKnownTags,
  renameCollection,
  setItemCollections,
  setItemNotes,
  setItemTags,
} from "../../lib/items";
import { MESSAGE } from "../../lib/messages";
import {
  SYSTEM_COLLECTION_ID,
  type CollectionRecord,
  type ItemRecord,
  type SaveItemOrganizationInput,
  type SaveItemOrganizationResponse,
} from "../../lib/types";

type CollectionFilter = "all" | typeof SYSTEM_COLLECTION_ID | string;
type ViewMode = "grid" | "list";
type GridSize = "large" | "medium" | "small";
const GRID_SIZE_KEY = "pixstash.library.grid-size";

const LIBRARY_VIEW_MODE_KEY = "pixstash.library.view-mode";
const SITE_FILTER_LABEL_ID = "library-site-filter-label";
const SORT_LABEL_ID = "library-sort-label";
const EXTENSION_VERSION = browser.runtime.getManifest().version;

export function App() {
  const { t } = useTranslation();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [collectionFilter, setCollectionFilter] =
    useState<CollectionFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [siteFilter, setSiteFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"captureTime" | "siteName">(
    "captureTime",
  );
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    try {
      const stored = window.localStorage.getItem(GRID_SIZE_KEY);
      return stored === "large" || stored === "small" ? stored : "medium";
    } catch { return "medium"; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftCollection, setDraftCollection] = useState("");
  const [managingCollectionId, setManagingCollectionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notesItem, setNotesItem] = useState<ItemRecord | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [organizerItem, setOrganizerItem] = useState<ItemRecord | null>(null);
  const [organizerSaving, setOrganizerSaving] = useState(false);
  const [editingTagItemId, setEditingTagItemId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null,
  );
  const [renamingCollectionId, setRenamingCollectionId] = useState<
    string | null
  >(null);
  const [renamingDraft, setRenamingDraft] = useState("");
  const [pendingDeleteCollectionId, setPendingDeleteCollectionId] = useState<
    string | null
  >(null);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(
    null,
  );
  const [pendingDeleteSelected, setPendingDeleteSelected] = useState(false);
  const [addToCollectionPickerOpen, setAddToCollectionPickerOpen] =
    useState(false);
  const [addToCollectionId, setAddToCollectionId] = useState("");

  useEffect(() => {
    const id = managingCollectionId;
    if (!id) return;
    const menu = document.getElementById(`collection-tools-${id}`);
    const trigger = document.getElementById(`collection-trigger-${id}`);
    if (!menu || !trigger) return;
    menu.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const below = window.innerHeight - anchor.bottom - 12;
    const above = anchor.top - 12;
    const up = below < bounds.height && above > below;
    menu.style.maxHeight = `${Math.max(0, up ? above : below)}px`;
    menu.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${up ? Math.max(8, anchor.top - bounds.height - 4) : anchor.bottom + 4}px`;
    function dismiss(event: PointerEvent) {
      if (!menu?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) {
        setManagingCollectionId(null);
        setPendingDeleteCollectionId(null);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setManagingCollectionId(null);
        setPendingDeleteCollectionId(null);
        trigger?.focus();
      }
    }
    function dismissOnMove() { setManagingCollectionId(null); setPendingDeleteCollectionId(null); }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', dismissOnMove);
    return () => {
      if (menu.matches(':popover-open')) menu.hidePopover();
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', dismissOnMove);
    };
  }, [managingCollectionId, pendingDeleteCollectionId]);

  const targetItemId = useMemo(
    () => new URLSearchParams(window.location.search).get("item"),
    [],
  );

  useEffect(() => {
    void loadLibrary();
  }, []);

  useEffect(() => {
    const handleMessage = (message: { type?: string }) => {
      if (message?.type !== MESSAGE.libraryChanged) {
        return undefined;
      }

      void loadLibrary();
      return undefined;
    };

    browser.runtime.onMessage.addListener(handleMessage);
    return () => browser.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    try { window.localStorage.setItem(GRID_SIZE_KEY, gridSize); } catch { /* Storage may be unavailable. */ }
  }, [gridSize]);

  useEffect(() => {
    storeViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!notesItem && !organizerItem) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotesItem(null);
        setOrganizerItem(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notesItem, organizerItem]);

  useEffect(() => {
    if (!targetItemId || items.length === 0) {
      return;
    }

    const element = document.querySelector<HTMLElement>(
      `[data-item-id="${targetItemId}"]`,
    );

    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedItemId(targetItemId);
    window.history.replaceState({}, "", window.location.pathname);

    const timeoutId = window.setTimeout(
      () =>
        setHighlightedItemId((current) =>
          current === targetItemId ? null : current,
        ),
      2600,
    );
    return () => window.clearTimeout(timeoutId);
  }, [items, targetItemId]);

  async function loadLibrary() {
    const [nextItems, nextCollections, nextKnownTags] = await Promise.all([
      listItems(),
      listCollections(),
      listKnownTags(),
    ]);
    setItems(nextItems);
    setCollections(nextCollections);
    setKnownTags(nextKnownTags);
    setSelectedIds((current) =>
      current.filter((itemId) => nextItems.some((item) => item.id === itemId)),
    );
  }

  function notify(nextMessage: string) {
    setMessage(nextMessage);
  }

  function patchItem(
    itemId: string,
    updater: (item: ItemRecord) => ItemRecord,
  ) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? updater(item) : item)),
    );
  }

  const collectionCounts = useMemo(() => {
    const counts = new Map<string, number>([[SYSTEM_COLLECTION_ID, 0]]);

    for (const collection of collections) {
      counts.set(collection.id, 0);
    }

    for (const item of items) {
      if (item.collectionIds.length === 0) {
        counts.set(
          SYSTEM_COLLECTION_ID,
          (counts.get(SYSTEM_COLLECTION_ID) ?? 0) + 1,
        );
      }

      for (const collectionId of item.collectionIds) {
        counts.set(collectionId, (counts.get(collectionId) ?? 0) + 1);
      }
    }

    return counts;
  }, [collections, items]);

  const sites = useMemo(
    () => ["all", ...new Set(items.map((item) => item.siteName))],
    [items],
  );
  const siteFilterOptions = useMemo(
    () =>
      sites.map((site) => ({
        label: site === "all" ? t("library.all_sites") : site,
        value: site,
      })),
    [sites, t],
  );
  const collectionOptions = useMemo(
    () => collections.map((c) => ({ label: c.name, value: c.id })),
    [collections],
  );
  const sortOptions = useMemo(
    () => [
      { label: t("library.newest_first"), value: "captureTime" },
      { label: t("library.site_name"), value: "siteName" },
    ],
    [t],
  );
  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (
        collectionFilter === SYSTEM_COLLECTION_ID &&
        item.collectionIds.length > 0
      ) {
        return false;
      }

      if (
        collectionFilter !== "all" &&
        collectionFilter !== SYSTEM_COLLECTION_ID &&
        !item.collectionIds.includes(collectionFilter)
      ) {
        return false;
      }

      if (
        selectedTags.length > 0 &&
        !item.tags.some((tag) => selectedTags.includes(tag))
      ) {
        return false;
      }

      if (siteFilter !== "all" && item.siteName !== siteFilter) {
        return false;
      }

      const query = searchQuery.trim().toLocaleLowerCase();
      if (query && ![item.pageTitle, item.siteName, item.sourceUrl, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query))) return false;
      return true;
    });

    return filtered.slice().sort((left, right) => {
      if (sortBy === "siteName") {
        return left.siteName.localeCompare(right.siteName);
      }

      return right.captureTime.localeCompare(left.captureTime);
    });
  }, [collectionFilter, items, selectedTags, siteFilter, sortBy, searchQuery]);

  const visibleItemIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleItemIds.length > 0 &&
    visibleItemIds.every((itemId) => selectedIds.includes(itemId));
  const activeCollectionLabel =
    collectionFilter === "all"
      ? t("library.all_saved_materials")
      : collectionFilter === SYSTEM_COLLECTION_ID
        ? t("library.uncategorized_only")
        : (collections.find((collection) => collection.id === collectionFilter)
            ?.name ?? t("library.filtered_collection"));

  async function handleCreateCollection() {
    const name = draftCollection.trim();
    if (!name) {
      return;
    }

    await createCollection(name);
    setDraftCollection("");
    setCollections(await listCollections());
    notify(t("library.notify_collection_created"));
  }

  function startRename(collection: CollectionRecord) {
    setRenamingCollectionId(collection.id);
    setRenamingDraft(collection.name);
    setPendingDeleteCollectionId(null);
  }

  async function handleSaveRename(collection: CollectionRecord) {
    const name = renamingDraft.trim();
    if (!name || name === collection.name) {
      setRenamingCollectionId(null);
      return;
    }

    await renameCollection(collection.id, name);
    setCollections((current) =>
      current.map((entry) =>
        entry.id === collection.id ? { ...entry, name } : entry,
      ),
    );
    setRenamingCollectionId(null);
    setRenamingDraft("");
    notify(t("library.notify_collection_renamed"));
  }

  async function handleDeleteCollection(collection: CollectionRecord) {
    await deleteCollection(collection.id);
    setPendingDeleteCollectionId(null);
    setCollections((current) =>
      current.filter((entry) => entry.id !== collection.id),
    );
    setItems((current) =>
      current.map((item) => ({
        ...item,
        collectionIds: item.collectionIds.filter(
          (entry) => entry !== collection.id,
        ),
      })),
    );
    if (collectionFilter === collection.id) {
      setCollectionFilter("all");
    }
    notify(t("library.notify_collection_deleted"));
  }

  async function handleDeleteItem(itemId: string) {
    await deleteItem(itemId);
    setPendingDeleteItemId(null);
    setItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedIds((current) => current.filter((entry) => entry !== itemId));
    setKnownTags(await listKnownTags());
    notify(t("library.notify_item_deleted"));
  }

  async function handleAddSelectedToCollection() {
    if (selectedIds.length === 0 || !addToCollectionId) {
      return;
    }

    await Promise.all(
      selectedIds.map(async (itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (!item) {
          return;
        }

        const mergedIds = [
          ...new Set([...item.collectionIds, addToCollectionId]),
        ];
        const updated = await setItemCollections(itemId, mergedIds);
        patchItem(itemId, () => updated);
      }),
    );

    setAddToCollectionPickerOpen(false);
    setAddToCollectionId("");
    setSelectedIds([]);
    notify(t("library.notify_added_to_collection"));
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    const nextSelectedIds = [...selectedIds];
    await Promise.all(nextSelectedIds.map((itemId) => deleteItem(itemId)));
    setItems((current) =>
      current.filter((item) => !nextSelectedIds.includes(item.id)),
    );
    setSelectedIds([]);
    setPendingDeleteSelected(false);
    setKnownTags(await listKnownTags());
    notify(t("library.notify_selected_deleted"));
  }

  async function handleSaveNotes() {
    if (!notesItem) {
      return;
    }

    await setItemNotes(notesItem.id, notesDraft);
    patchItem(notesItem.id, (item) => ({ ...item, notes: notesDraft }));
    setNotesItem(null);
    setNotesDraft("");
    notify(t("library.notify_notes_updated"));
  }

  async function handleSaveOrganization(input: SaveItemOrganizationInput) {
    setOrganizerSaving(true);
    const response = (await browser.runtime.sendMessage({
      type: MESSAGE.saveItemOrganization,
      ...input,
    })) as SaveItemOrganizationResponse;
    setOrganizerSaving(false);

    if (!response.ok || !response.item) {
      notify(response.error ?? t("library.notify_unable_details"));
      return false;
    }

    patchItem(response.item.id, () => response.item!);
    setCollections(response.collections);
    setKnownTags(response.knownTags);
    setOrganizerItem(null);
    notify(t("library.notify_details_updated"));
    return true;
  }

  async function handleSaveItemTags(itemId: string, tags: string[]) {
    try {
      const updatedItem = await setItemTags(itemId, tags);
      patchItem(itemId, () => updatedItem);
      setKnownTags(await listKnownTags());
      setEditingTagItemId((current) => (current === itemId ? null : current));
      notify(t("library.notify_tags_updated"));
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : t("library.notify_unable_details"),
      );
      return false;
    }
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((itemId) => !visibleItemIds.includes(itemId));
      }

      return [...new Set([...current, ...visibleItemIds])];
    });
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((entry) => entry !== tag)
        : [...current, tag],
    );
  }

  function toggleItemSelection(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((entry) => entry !== itemId)
        : [...current, itemId],
    );
  }

  function getCollectionNames(item: ItemRecord) {
    return collections
      .filter((collection) => item.collectionIds.includes(collection.id))
      .map((collection) => collection.name);
  }

  function openViewer(item: ItemRecord) {
    const idx = visibleItems.findIndex((v) => v.id === item.id);
    setViewerIndex(idx >= 0 ? idx : 0);
  }

  return (
    <div className="library ps-shell">
      <header className="library__header">
        <div className="library__masthead">
          <h1><img className="library__brand-icon" src="/icon/48.png" alt="" aria-hidden="true" />Pix Stash</h1>
          <span className="library__version" aria-label={t("library.version", { version: EXTENSION_VERSION })}>
            v{EXTENSION_VERSION}
          </span>
        </div>


      </header>

      <BookmarksMenu />

          <section className="library__filters">
            <div className="library__filters-head">
              <div className="library__results-summary">
                <h2>{activeCollectionLabel}</h2>
                <span className="library__results">
                  {t("library.materials", { count: visibleItems.length })}
                </span>
              </div>
              <div className="library__search-controls">
              <label className="library__search">
                <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
                <input type="search" aria-label={t("library.search")} placeholder={t("library.search")} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </label>
            {knownTags.length > 0 ? (
              <div className="library__tag-dropdown">
                <button
                  type="button"
                  className="ps-selectbox__trigger"
                  popoverTarget="library-tag-menu"
                  aria-controls="library-tag-menu"
                  onClick={(event) => {
                    const menu = document.getElementById("library-tag-menu");
                    if (!menu) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const width = Math.min(260, window.innerWidth - 16);
                    Object.assign(menu.style, {
                      width: `${width}px`,
                      left: `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`,
                      top: `${bounds.bottom + 3}px`,
                      maxHeight: `${Math.max(0, window.innerHeight - bounds.bottom - 11)}px`,
                    });
                  }}
                >
                  <span className="ps-selectbox__value">{t("library.tag_filter")}{selectedTags.length > 0 ? ` (${selectedTags.length})` : ""}</span>
                  <span className="ps-selectbox__icon" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m5 7 5 5 5-5" /></svg></span>
                </button>
                <div id="library-tag-menu" popover="auto" className="library__tag-menu" role="group" aria-label={t("library.tag_filter")}>
                  <div className="library__tag-menu-actions">
                    <button type="button" className="library__tool" disabled={selectedTags.length === 0} onClick={() => setSelectedTags([])}>{t("library.clear_tags")}</button>
                  </div>
                  {knownTags.map((tag) => (
                    <label className="library__tag-option" key={tag}>
                      <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => toggleTagFilter(tag)} />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
              </div>
              <div className="library__filters-actions">
                {viewMode === "grid" && (
                  <div className="library__size-picker">
                    <CustomSelect
                      ariaLabel={t("library.grid_size")}
                      value={gridSize}
                      onChange={(value) => setGridSize(value as GridSize)}
                      options={(["large", "medium", "small"] as const).map((size) => ({
                        value: size,
                        label: t(`library.grid_size_${size}`),
                        icon: <svg className="library__size-icon" viewBox="0 0 20 20" aria-hidden="true">
                          {(size === "large" ? [0] : size === "medium" ? [0, 1, 2, 3] : Array.from({ length: 9 }, (_, i) => i)).map((i) => {
                            const columns = size === "large" ? 1 : size === "medium" ? 2 : 3;
                            const step = 16 / columns;
                            return <rect key={i} x={2 + (i % columns) * step} y={2 + Math.floor(i / columns) * step} width={step - 2} height={step - 2} rx="1" />;
                          })}
                        </svg>,
                      }))}
                    />
                  </div>
                )}
                <div className="library__view-picker">
                  <div
                    className="library__view-toggle"
                    role="group"
                    aria-label={t("library.display_mode")}
                  >
                    <button
                      className={`library__view-option ${viewMode === "grid" ? "is-active" : ""}`}
                      type="button"
                      aria-pressed={viewMode === "grid"}
                      aria-label={t("library.grid")}
                      title={t("library.grid")}
                      onClick={() => setViewMode("grid")}
                    >
                      <span className="library__view-icon" aria-hidden="true">
                        <svg viewBox="0 0 20 20" focusable="false">
                          <rect x="3" y="3" width="5" height="5" rx="1.2" />
                          <rect x="12" y="3" width="5" height="5" rx="1.2" />
                          <rect x="3" y="12" width="5" height="5" rx="1.2" />
                          <rect x="12" y="12" width="5" height="5" rx="1.2" />
                        </svg>
                      </span>
                    </button>
                    <button
                      className={`library__view-option ${viewMode === "list" ? "is-active" : ""}`}
                      type="button"
                      aria-pressed={viewMode === "list"}
                      aria-label={t("library.list")}
                      title={t("library.list")}
                      onClick={() => setViewMode("list")}
                    >
                      <span className="library__view-icon" aria-hidden="true">
                        <svg viewBox="0 0 20 20" focusable="false">
                          <rect x="3" y="4" width="3" height="3" rx="1" />
                          <rect x="3" y="9" width="3" height="3" rx="1" />
                          <rect x="3" y="14" width="3" height="3" rx="1" />
                          <path d="M8.5 5.5h8M8.5 10.5h8M8.5 15.5h8" />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>

                <div className="library__settings-group">
        <button
          aria-label={t("library.open_settings")}
          className="library__settings-btn"
          title={t("library.open_settings")}
          type="button"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          <svg
            className="library__settings-icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M16.12 8.13 L18.15 8.42 L18.15 11.58 L16.12 11.87 L15.65 13.00 L16.88 14.64 L14.64 16.88 L13.00 15.65 L11.87 16.12 L11.58 18.15 L8.42 18.15 L8.13 16.12 L7.00 15.65 L5.36 16.88 L3.12 14.64 L4.35 13.00 L3.88 11.87 L1.85 11.58 L1.85 8.42 L3.88 8.13 L4.35 7.00 L3.12 5.36 L5.36 3.12 L7.00 4.35 L8.13 3.88 L8.42 1.85 L11.58 1.85 L11.87 3.88 L13.00 4.35 L14.64 3.12 L16.88 5.36 L15.65 7.00Z"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="10" r="2.7" />
          </svg>
        </button>
                </div>

              </div>
            </div>

            <div className="library__filters-grid library__filters-grid--compact">
              <div className="library__filter">
                <p className="library__label" id={SITE_FILTER_LABEL_ID}>
                  {t("library.site")}
                </p>
                <CustomSelect
                  ariaLabel={t("library.site")}
                  id="site-filter"
                  labelId={SITE_FILTER_LABEL_ID}
                  onChange={setSiteFilter}
                  options={siteFilterOptions}
                  value={siteFilter}
                />
              </div>

              <div className="library__filter">
                <p className="library__label" id={SORT_LABEL_ID}>
                  {t("library.sort")}
                </p>
                <CustomSelect
                  ariaLabel={t("library.sort")}
                  id="sort-by"
                  labelId={SORT_LABEL_ID}
                  onChange={(nextValue) =>
                    setSortBy(nextValue as "captureTime" | "siteName")
                  }
                  options={sortOptions}
                  value={sortBy}
                />
              </div>
                <label className="library__toggle library__toggle--bulk">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                  />
                  <span>{t("library.select_all")}</span>
                </label>
            </div>

            {selectedTags.length > 0 ? (
              <div className="library__active-tags" aria-label={t("library.tag_filter")}>
                {selectedTags.map((tag) => (
                  <button className="library__tag-chip is-active" key={tag} type="button" aria-pressed="true" aria-label={t("library.remove_tag_filter", { tag })} onClick={() => toggleTagFilter(tag)}>
                    {tag}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 5 6 6M11 5l-6 6" /></svg>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

      <div className="library__layout">
        <aside className="library__sidebar">
          <section className="library__sidebar-block">
            <div className="library__collection-list">
              <button
                className={`library__collection ${collectionFilter === "all" ? "is-active" : ""}`}
                type="button"
                aria-pressed={collectionFilter === "all"}
                onClick={() => setCollectionFilter("all")}
              >
                <span>{t("library.all_items")}</span>
                <strong>{items.length}</strong>
              </button>
              <button
                className={`library__collection ${collectionFilter === SYSTEM_COLLECTION_ID ? "is-active" : ""}`}
                type="button"
                aria-pressed={collectionFilter === SYSTEM_COLLECTION_ID}
                onClick={() => setCollectionFilter(SYSTEM_COLLECTION_ID)}
              >
                <span>{t("library.uncategorized")}</span>
                <strong>
                  {collectionCounts.get(SYSTEM_COLLECTION_ID) ?? 0}
                </strong>
              </button>
              {collections.map((collection) => (
                <div className="library__collection-row" key={collection.id} onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setManagingCollectionId(null);
                    setPendingDeleteCollectionId(null);
                  }
                }}>
                  {renamingCollectionId === collection.id ? (
                    <div className="library__rename-form">
                      <input
                        autoFocus
                        className="ps-input"
                        aria-label={t("library.rename_collection_prompt")}
                        value={renamingDraft}
                        onChange={(e) => setRenamingDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void handleSaveRename(collection);
                          if (e.key === "Escape") setRenamingCollectionId(null);
                        }}
                      />
                      <div className="library__rename-actions">
                        <button
                          className="ps-button"
                          data-variant="accent"
                          type="button"
                          onClick={() => void handleSaveRename(collection)}
                        >
                          {t("library.save")}
                        </button>
                        <button
                          className="ps-button"
                          type="button"
                          onClick={() => setRenamingCollectionId(null)}
                        >
                          {t("library.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="library__collection-entry">
                      <button
                        className={`library__collection ${collectionFilter === collection.id ? "is-active" : ""}`}
                        type="button"
                        aria-pressed={collectionFilter === collection.id}
                        onClick={() => setCollectionFilter(collection.id)}
                      >
                        <span title={collection.name}>{collection.name}</span>
                        <strong>
                          {collectionCounts.get(collection.id) ?? 0}
                        </strong>
                      </button>
                      <button
                        className="library__collection-more"
                        id={`collection-trigger-${collection.id}`}
                        title={t("library.manage")}
                        type="button"
                        aria-label={t("library.more_for", { title: collection.name })}
                        aria-expanded={managingCollectionId === collection.id || pendingDeleteCollectionId === collection.id}
                        aria-controls={`collection-tools-${collection.id}`}
                        onClick={() => { setPendingDeleteCollectionId(null); setManagingCollectionId((current) => current === collection.id ? null : collection.id); }}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" /></svg>
                      </button>
                    </div>
                  )}

                    <div className="library__collection-tools" popover="manual" id={`collection-tools-${collection.id}`} hidden={managingCollectionId !== collection.id}>
                      <button
                        className="library__tool"
                        type="button"
                        onClick={() => { setManagingCollectionId(null); startRename(collection); }}
                      >
                        {t("library.rename")}
                      </button>
                      <button
                        className="library__tool"
                        type="button"
                        onClick={() => {
                          setRenamingCollectionId(null);
                          setManagingCollectionId(null);
                          setPendingDeleteCollectionId(collection.id);
                        }}
                      >
                        {t("library.delete")}
                      </button>
                    </div>

                </div>
              ))}
            </div>
          </section>

          <details className="library__sidebar-block library__create-collection">
            <summary><span aria-hidden="true">＋ </span>{t("library.new_collection")}</summary>
            <form className="library__sidebar-form" onSubmit={(event) => { event.preventDefault(); void handleCreateCollection(); }}>
              <label className="library__label" htmlFor="create-collection-name">{t("library.collection_name")}</label>
              <input
                className="ps-input"
                id="create-collection-name"
                placeholder={t("library.collection_placeholder")}
                value={draftCollection}
                onChange={(event) => setDraftCollection(event.target.value)}
              />
              <button
                className="ps-button"
                type="submit"
                disabled={!draftCollection.trim()}
              >
                {t("library.create_collection")}
              </button>
            </form>
          </details>
        </aside>

        <main className="library__main">




          {visibleItems.length === 0 ? (
            <section className="ps-empty library__empty">
              <div className="library__empty-head">
                <h2>{t("library.nothing_to_review")}</h2>
                <p className="library__empty-hint">
                  {t("library.empty_open_hint")}
                </p>
              </div>
              <div className="library__empty-modes">
                <div className="library__empty-mode">
                  <div className="library__empty-mode-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="14" rx="2" />
                      <circle cx="9" cy="11" r="2.5" />
                      <path
                        d="M3 15l4-4 4 4 4-5 6 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <strong>{t("capture_mode.page_image")}</strong>
                  <p>{t("library.empty_mode_page_image_note")}</p>
                </div>
                <div className="library__empty-mode">
                  <div className="library__empty-mode-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="14" rx="2" />
                      <path d="M7 21h10M12 17v4" strokeLinecap="round" />
                    </svg>
                  </div>
                  <strong>{t("capture_mode.instant_screenshot")}</strong>
                  <p>{t("library.empty_mode_screenshot_note")}</p>
                </div>
                <div className="library__empty-mode">
                  <div className="library__empty-mode-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"
                        strokeLinecap="round"
                      />
                      <rect
                        x="7"
                        y="7"
                        width="10"
                        height="10"
                        rx="1"
                        strokeDasharray="2 2"
                      />
                    </svg>
                  </div>
                  <strong>{t("capture_mode.region_screenshot")}</strong>
                  <p>{t("library.empty_mode_region_note")}</p>
                </div>
              </div>
            </section>
          ) : viewMode === "list" ? (
            <LibraryTable
              collections={collections}
              editingTagItemId={editingTagItemId}
              highlightedItemId={highlightedItemId}
              knownTags={knownTags}
              pendingDeleteItemId={null}
              selectedIds={selectedIds}
              visibleItems={visibleItems}
              onDeleteItem={handleDeleteItem}
              onEditNotes={(item) => {
                setNotesItem(item);
                setNotesDraft(item.notes);
              }}
              onOpenViewer={openViewer}
              onOrganize={setOrganizerItem}
              onSaveItemTags={handleSaveItemTags}
              onSetEditingTagItemId={setEditingTagItemId}
              onSetPendingDeleteItemId={setPendingDeleteItemId}
              onToggleItemSelection={toggleItemSelection}
            />
          ) : (
            <section className={`library__grid library__grid--${viewMode} library__grid--${gridSize}`}>
              {visibleItems.map((item) => {
                const collectionNames = getCollectionNames(item);
                return (
                  <article
                    className={`library__item library__item--${viewMode} ${highlightedItemId === item.id ? "is-highlighted" : ""} ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                    data-item-id={item.id}
                    key={item.id}
                    onClick={(event) => { if (isSelectionClick(event)) toggleItemSelection(item.id); }}
                  >
                    <div className="library__media">
                      <label
                        className="library__selection"
                        aria-label={t("library.select_item", {
                          title: item.pageTitle,
                        })}
                      >
                        <input
                          aria-label={t("library.select_item", { title: item.pageTitle })}
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                        />
                      </label>
                      <button
                        className="library__image-button"
                        type="button"
                        onClick={() => openViewer(item)}
                      >
                        <img
                          className="library__image"
                          src={item.previewUrl}
                          alt={item.pageTitle}
                        />
                      </button>
                    </div>

                    <div className="library__item-body">
                      <h3>
                        <button className="library__item-title" type="button" title={item.pageTitle} onClick={() => openViewer(item)}>{item.pageTitle}</button>
                      </h3>

                      <ItemActions
                        item={item}
                        sourceLabel={item.siteName}
                        showDetails
                        editingTags={editingTagItemId === item.id}
                        pendingDelete={false}
                        onEditNotes={() => { setNotesItem(item); setNotesDraft(item.notes); }}
                        onEditTags={() => setEditingTagItemId((current) => current === item.id ? null : item.id)}
                        onOrganize={() => setOrganizerItem(item)}
                        onRequestDelete={() => setPendingDeleteItemId(item.id)}
                        onCancelDelete={() => setPendingDeleteItemId(null)}
                        onDelete={() => handleDeleteItem(item.id)}
                      />

                        <div className="library__item-labels">
                          <span className="library__capture-mode">{t(`capture_mode.${item.captureMode}`)}</span>
                          {collectionNames.length > 0 ? <span>{collectionNames.join(" · ")}</span> : null}
                          {item.tags.slice(0, 4).map((tag) => <span className="library__item-tag" key={tag}>{tag}</span>)}
                        </div>
                      {item.notes ? <p className="library__item-note">{summarizeNotes(item.notes)}</p> : null}

                      {editingTagItemId === item.id ? (
                        <InlineTagEditor
                          item={item}
                          knownTags={knownTags}
                          onCancel={() => setEditingTagItemId(null)}
                          onSave={handleSaveItemTags}
                        />
                      ) : null}


                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </main>
      </div>

          {selectedIds.length > 0 ? (
            <footer className="library__selection-bar">
              <div className="library__selection-summary">
                <strong>
                  {t("library.selected_count", { count: selectedIds.length })}
                </strong>
                {selectedIds.some((id) => !visibleItemIds.includes(id)) ? <span>
                  {t("library.visible_in_view", {
                    selected: visibleItemIds.filter((itemId) =>
                      selectedIds.includes(itemId),
                    ).length,
                    total: visibleItemIds.length,
                  })}
                </span> : null}
              </div>

              <div className="library__selection-actions">
                    <button
                      className="ps-button"
                      type="button"
                      onClick={() => setSelectedIds([])}
                    >
                      {t("library.clear_selection")}
                    </button>
                    <button
                      className="ps-button"
                      type="button"
                      onClick={() => {
                        setAddToCollectionPickerOpen(true);
                        setAddToCollectionId(collections[0]?.id ?? "");
                      }}
                    >
                      {t("library.add_to_collection")}
                    </button>
                    <button
                      className="ps-button"
                      data-variant="danger"
                      type="button"
                      onClick={() => setPendingDeleteSelected(true)}
                    >
                      {t("library.delete_selected")}
                    </button>

              </div>
            </footer>
          ) : null}

      {(pendingDeleteItemId || pendingDeleteSelected || pendingDeleteCollectionId) && (
        <Modal title={t("library.delete")} onClose={() => { setPendingDeleteItemId(null); setPendingDeleteSelected(false); setPendingDeleteCollectionId(null); }}>
          <div className="library__delete-message">
            <svg className="library__delete-bin" viewBox="0 0 96 104" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="delete-bin-glass" x2="1" y2="0"><stop stopColor="#f3fcff"/><stop offset=".45" stopColor="#b8dce9"/><stop offset="1" stopColor="#6b9eb9"/></linearGradient>
              </defs>
              <ellipse cx="48" cy="94" rx="30" ry="5" fill="#567080" opacity=".2"/>
              <g className="library__delete-bin-body">
                <ellipse cx="48" cy="36" rx="26" ry="7" fill="#dceef3" stroke="#557e9e" strokeWidth="2"/>
                <ellipse cx="48" cy="36" rx="20" ry="3" fill="#6e96ac"/>
              <g className="library__delete-paper">
                <path d="M33 4h23l10 10v34H33z" fill="#fffef5" stroke="#8198b0" strokeWidth="2"/>
                <path d="M56 4v11h10M39 23h20M39 29h20M39 35h15" fill="none" stroke="#a9b8c5" strokeWidth="2"/>
              </g>
                <path d="M22 36l6 51q20 13 40 0l6-51z" fill="url(#delete-bin-glass)" stroke="#557e9e" strokeWidth="2"/>
                <path d="M30 43l5 39M65 43l-4 39" stroke="#fff" strokeWidth="3" opacity=".65"/>
                <path d="M22 36a26 7 0 0 0 52 0" fill="none" stroke="#557e9e" strokeWidth="2"/>
                <g fill="none" stroke="#348d45" strokeWidth="4" strokeLinejoin="round">
                  <path d="M40 60l7-12 8 13m-9-11 1-2 2 8M58 64l7 12H50m13-5 2 5-6 2M45 78H32l8-14m-2 7 2-7 5 4"/>
                </g>
              </g>
            </svg>
            <div className="library__delete-copy">
          <p>{pendingDeleteCollectionId ? t("library.delete_collection_prompt") : pendingDeleteSelected ? t("library.delete_selected_prompt", { count: selectedIds.length }) : t("library.delete_item_prompt")}</p>
          <strong>{pendingDeleteItemId ? items.find((item) => item.id === pendingDeleteItemId)?.pageTitle : pendingDeleteCollectionId ? collections.find((collection) => collection.id === pendingDeleteCollectionId)?.name : t("library.selected_count", { count: selectedIds.length })}</strong>
            </div>
          </div>
          <div className="ps-modal__actions">
            <button autoFocus className="ps-button" type="button" onClick={() => { setPendingDeleteItemId(null); setPendingDeleteSelected(false); setPendingDeleteCollectionId(null); }}>{t("library.cancel")}</button>
            <button className="ps-button" data-variant="danger" type="button" onClick={() => {
              if (pendingDeleteItemId) void handleDeleteItem(pendingDeleteItemId);
              else if (pendingDeleteSelected) void handleDeleteSelected();
              else { const collection = collections.find((entry) => entry.id === pendingDeleteCollectionId); if (collection) void handleDeleteCollection(collection); }
            }}>{t("library.delete")}</button>
          </div>
        </Modal>
      )}
      {addToCollectionPickerOpen && (
        <Modal title={t("library.add_to_collection")} onClose={() => setAddToCollectionPickerOpen(false)}>
          <p>{t("library.selected_count", { count: selectedIds.length })}</p>
          {collections.length ? <CustomSelect ariaLabel={t("library.add_to_collection_select")} options={collectionOptions} value={addToCollectionId} onChange={setAddToCollectionId} /> : <p>{t("library.no_collections_to_add")}</p>}
          <div className="ps-modal__actions">
            <button autoFocus className="ps-button" type="button" onClick={() => setAddToCollectionPickerOpen(false)}>{t("library.cancel")}</button>
            <button className="ps-button" data-variant="accent" type="button" disabled={!addToCollectionId || !selectedIds.length} onClick={() => void handleAddSelectedToCollection()}>{t("library.add")}</button>
          </div>
        </Modal>
      )}

      {notesItem ? (
        <Modal
          title={t("library.edit_note")}
          onClose={() => setNotesItem(null)}
        >
          <label className="library__label" htmlFor="item-notes">
            {t("library.note_label")}
          </label>
          <textarea
            className="ps-textarea"
            id="item-notes"
            autoFocus
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
          />
          <div className="ps-modal__actions">
            <button
              className="ps-button"
              type="button"
              onClick={() => setNotesItem(null)}
            >
              {t("library.cancel")}
            </button>
            <button
              className="ps-button"
              data-variant="accent"
              type="button"
              onClick={() => void handleSaveNotes()}
            >
              {t("library.save_note")}
            </button>
          </div>
        </Modal>
      ) : null}

      {organizerItem ? (
        <Modal
          title={t("library.organize_stash_title")}
          onClose={() => setOrganizerItem(null)}
        >
          <ItemOrganizer
            actions={
              <button
                className="ps-button"
                type="button"
                onClick={() => setOrganizerItem(null)}
              >
                {t("library.cancel")}
              </button>
            }
            collections={collections}
            item={organizerItem}
            knownTags={knownTags}
            onSave={handleSaveOrganization}
            saveLabel={t("library.save_organizer")}
            saving={organizerSaving}
          />
        </Modal>
      ) : null}

      {viewerIndex !== null ? (
        <ImagePreview
          items={visibleItems}
          initialIndex={viewerIndex}
          selectedIds={selectedIds}
          onToggleSelection={toggleItemSelection}
          onClearSelection={() => setSelectedIds([])}
          onItemAction={(item, action) => {
            if (action === 'delete') {
              setViewerIndex(null);
              setPendingDeleteItemId(item.id);
              return;
            }
            setViewerIndex(null);
            if (action === 'organize') setOrganizerItem(item);
            if (action === 'notes') { setNotesItem(item); setNotesDraft(item.notes); }
          }}
          onBatchAction={(action) => {
            setViewerIndex(null);
            if (action === 'delete') setPendingDeleteSelected(true);
            else {
              setAddToCollectionPickerOpen(true);
              setAddToCollectionId(collections[0]?.id ?? '');
            }
          }}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      {message ? (
        <div className="library__toast" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}
    </div>
  );
}

function summarizeNotes(notes: string) {
  const trimmed = notes.trim();
  if (trimmed.length <= 84) {
    return trimmed;
  }

  return `${trimmed.slice(0, 81).trimEnd()}...`;
}

function readStoredViewMode(): ViewMode {
  if (typeof window === "undefined") {
    return "grid";
  }

  try {
    const stored = window.localStorage.getItem(LIBRARY_VIEW_MODE_KEY);
    return stored === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function storeViewMode(viewMode: ViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LIBRARY_VIEW_MODE_KEY, viewMode);
  } catch {
    return;
  }
}
