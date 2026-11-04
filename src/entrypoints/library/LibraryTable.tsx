import { Fragment } from "react";
import { isSelectionClick } from "./selection-click";
import { ItemActions } from "./ItemActions";
import { useTranslation } from "react-i18next";

import { InlineTagEditor } from "../../components";
import {
  type CollectionRecord,
  type ItemRecord,
} from "../../lib/types";

interface LibraryTableProps {
  collections: CollectionRecord[];
  editingTagItemId: string | null;
  highlightedItemId: string | null;
  knownTags: string[];
  pendingDeleteItemId: string | null;
  selectedIds: string[];
  visibleItems: ItemRecord[];
  onDeleteItem: (itemId: string) => Promise<void>;
  onEditNotes: (item: ItemRecord) => void;
  onOpenViewer: (item: ItemRecord) => void;
  onOrganize: (item: ItemRecord) => void;
  onSaveItemTags: (itemId: string, tags: string[]) => Promise<boolean>;
  onSetEditingTagItemId: (id: string | null) => void;
  onSetPendingDeleteItemId: (id: string | null) => void;
  onToggleItemSelection: (itemId: string) => void;
}

export function LibraryTable({
  collections,
  editingTagItemId,
  highlightedItemId,
  knownTags,
  pendingDeleteItemId,
  selectedIds,
  visibleItems,
  onDeleteItem,
  onEditNotes,
  onOpenViewer,
  onOrganize,
  onSaveItemTags,
  onSetEditingTagItemId,
  onSetPendingDeleteItemId,
  onToggleItemSelection,
}: LibraryTableProps) {
  const { t } = useTranslation();

  function getCollectionNames(item: ItemRecord) {
    return collections
      .filter((collection) => item.collectionIds.includes(collection.id))
      .map((collection) => collection.name);
  }

  function getSourceDomain(item: ItemRecord) {
    try {
      return new URL(item.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return item.siteName;
    }
  }

  return (
    <section className="library__table-shell ps-card">
      <div className="library__table-scroll">
        <table className="library__table">
          <thead>
            <tr>
              <th scope="col">{t("library.col_select")}</th>
              <th scope="col">{t("library.col_preview")}</th>
              <th scope="col">{t("library.col_website_title")}</th>
              <th scope="col">{t("library.col_source")}</th>
              <th scope="col">{t("library.col_details")}</th>
              <th scope="col">{t("library.col_captured")}</th>
              <th scope="col">{t("library.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const collectionNames = getCollectionNames(item);
              return (
                <Fragment key={item.id}>
                  <tr
                    className={`library__table-row ${highlightedItemId === item.id ? "is-highlighted" : ""} ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                    onClick={(event) => { if (isSelectionClick(event)) onToggleItemSelection(item.id); }}
                    data-item-id={item.id}
                  >
                    <td className="library__table-cell library__table-cell--select">
                      <label
                        className="library__table-selection"
                        aria-label={t("library.select_item", {
                          title: item.pageTitle,
                        })}
                      >
                        <input
                          aria-label={t("library.select_item", { title: item.pageTitle })}
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => onToggleItemSelection(item.id)}
                        />
                      </label>
                    </td>
                    <td className="library__table-cell library__table-cell--preview">
                      <button
                        className="library__table-preview"
                        type="button"
                        onClick={() => onOpenViewer(item)}
                      >
                        <img
                          className="library__table-image"
                          src={item.previewUrl}
                          alt={item.pageTitle}
                        />
                      </button>
                    </td>
                    <td className="library__table-cell library__table-cell--item">
                      <div className="library__table-item">
                        <button
                          className="library__table-title"
                          type="button"
                          onClick={() => onOpenViewer(item)}
                        >
                          {item.pageTitle}
                        </button>
                      </div>
                    </td>
                    <td className="library__table-cell library__table-cell--source">
                      <div className="library__table-source">
                        <span className="library__table-domain">
                          {getSourceDomain(item)}
                        </span>
                      </div>
                    </td>
                    <td className="library__table-cell library__table-cell--details">
                      <div className="library__table-chips">
                        <span className="library__footnote">
                          {t(`capture_mode.${item.captureMode}`)}
                        </span>
                        {collectionNames.length > 0 ? (
                          <span className="library__footnote">
                            {collectionNames.join(" · ")}
                          </span>
                        ) : null}
                        {item.tags.map((tag) => (
                          <span
                            className="library__footnote library__footnote--tag"
                            key={tag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="library__table-cell library__table-cell--captured">
                      <p className="library__timestamp">
                        {new Date(item.captureTime).toLocaleString()}
                      </p>
                    </td>
                    <td className="library__table-cell library__table-cell--actions">
                      <ItemActions
                        item={item}
                        editingTags={editingTagItemId === item.id}
                        pendingDelete={pendingDeleteItemId === item.id}
                        onEditNotes={() => onEditNotes(item)}
                        onEditTags={() => onSetEditingTagItemId(editingTagItemId === item.id ? null : item.id)}
                        onOrganize={() => onOrganize(item)}
                        onRequestDelete={() => onSetPendingDeleteItemId(item.id)}
                        onCancelDelete={() => onSetPendingDeleteItemId(null)}
                        onDelete={() => onDeleteItem(item.id)}
                      />
                    </td>
                  </tr>
                  {editingTagItemId === item.id ? (
                    <tr className="library__table-editor-row">
                      <td
                        className="library__table-editor-cell"
                        colSpan={7}
                      >
                        <InlineTagEditor
                          item={item}
                          knownTags={knownTags}
                          onCancel={() => onSetEditingTagItemId(null)}
                          onSave={onSaveItemTags}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
