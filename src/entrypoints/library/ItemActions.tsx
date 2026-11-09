import { OriginalImageLink, OriginalSourceLink, sourceActionKey, SourceLink } from "../../components/SourceLink";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ItemRecord } from "../../lib/types";

interface ItemActionsProps {
  item: ItemRecord;
  sourceLabel?: string;
  showDetails?: boolean;
  editingTags: boolean;
  pendingDelete: boolean;
  onEditNotes: () => void;
  onEditTags: () => void;
  onOrganize: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => Promise<void>;
}

export function ItemActions({
  item,
  sourceLabel,
  showDetails = false,
  editingTags,
  pendingDelete,
  onEditNotes,
  onEditTags,
  onOrganize,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: ItemActionsProps) {
  const { t } = useTranslation();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    const menu = menuRef.current;
    const trigger = summaryRef.current;
    if (!open || !menu || !trigger) return;

    // The top layer avoids clipping inside the horizontally scrollable table.
    menu.showPopover();
    function placeMenu() {
      if (!menu || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      const bounds = menu.getBoundingClientRect();
      const gap = 5;
      const edge = 8;
      const below = window.innerHeight - anchor.bottom - gap - edge;
      const above = anchor.top - gap - edge;
      const useAbove = below < bounds.height && above > below;
      const available = Math.max(0, useAbove ? above : below);
      menu.style.maxHeight = `${available}px`;
      menu.style.left = `${Math.max(edge, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - edge))}px`;
      menu.style.top = `${useAbove ? Math.max(edge, anchor.top - Math.min(bounds.height, available) - gap) : anchor.bottom + gap}px`;
    }
    placeMenu();
    function dismissOnScroll(event: Event) {
      if (!menu?.contains(event.target as Node)) close();
    }
    window.addEventListener('resize', close);
    document.addEventListener('scroll', dismissOnScroll, true);
    return () => {
      if (menu.matches(':popover-open')) menu.hidePopover();
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', dismissOnScroll, true);
    };
  }, [open]);

  function run(action: () => void) {
    close();
    summaryRef.current?.focus();
    action();
  }

  return (
    <div className="library__item-actions">
      <SourceLink className="library__inline-action" item={item}>
        {sourceLabel ? <><span className="library__source-label">{t(sourceActionKey(item))}</span>{sourceLabel}</> : t(sourceActionKey(item))}
      </SourceLink>
      <details
        className="library__more"
        ref={detailsRef}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setOpen(nextOpen);
          if (!nextOpen && pendingDelete) onCancelDelete();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
            summaryRef.current?.focus();
          }
        }}
      >
        <summary ref={summaryRef} title={t("library.more")} aria-label={t("library.more_for", { title: item.pageTitle })}>
          <svg className="library__more-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
          </svg>
        </summary>
        <div className="library__more-actions" ref={menuRef} popover="manual">
          {showDetails ? (
            <div className="library__item-details">
              <span>{t(`capture_mode.${item.captureMode}`)}</span>
              <time dateTime={item.captureTime}>{new Date(item.captureTime).toLocaleString()}</time>
            </div>
          ) : null}
          <OriginalSourceLink item={item} />
          <OriginalImageLink item={item} />
          <button type="button" onClick={() => run(onOrganize)}>{t("library.organize")}</button>
          <button type="button" onClick={() => run(onEditNotes)}>
            {item.notes ? t("library.edit_note") : t("library.add_note")}
          </button>
          <button type="button" onClick={() => run(onEditTags)}>
            {editingTags ? t("library.close_tags") : item.tags.length > 0 ? t("library.edit_tags") : t("library.add_tags")}
          </button>
          {pendingDelete ? (
            <div className="library__item-delete-confirm">
              <span>{t("library.delete_item_prompt")}</span>
              <button className="library__danger-link" type="button" onClick={() => void onDelete()}>{t("library.delete")}</button>
              <button type="button" onClick={onCancelDelete}>{t("library.cancel")}</button>
            </div>
          ) : (
            <button className="library__danger-link" type="button" onClick={onRequestDelete}>{t("library.delete")}</button>
          )}
        </div>
      </details>
    </div>
  );
}
