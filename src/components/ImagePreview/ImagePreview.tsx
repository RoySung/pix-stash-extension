import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Lightbox, { useController, useLightboxState } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/plugins/counter.css';
import 'yet-another-react-lightbox/styles.css';

import type { ItemRecord } from '../../lib/types';
import './ImagePreview.css';

export interface ImagePreviewProps {
  initialIndex: number;
  items: ItemRecord[];
  onClose: () => void;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onClearSelection: () => void;
  onItemAction: (item: ItemRecord, action: 'organize' | 'notes' | 'delete') => void;
  onBatchAction: (action: 'organize' | 'delete') => void;
}

function PreviewThumbnails({ items, selectedIds }: Pick<ImagePreviewProps, "items" | "selectedIds">) {
  const { t } = useTranslation();
  const { currentIndex } = useLightboxState();
  const { prev, next } = useController();

  return (
    <div
      className="image-preview__thumbnails"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => (
        <button
          className="image-preview__thumbnail"
          key={item.id}
          type="button"
          aria-label={`${index + 1} / ${items.length}: ${item.pageTitle}`}
          data-selected={selectedIds.includes(item.id)}
          aria-current={index === currentIndex ? true : undefined}
          onClick={() => {
            const offset = index - currentIndex;
            if (offset > 0) next({ count: offset });
            if (offset < 0) prev({ count: -offset });
          }}
        >
          {selectedIds.includes(item.id) && <span className="image-preview__check" aria-label={t("preview.selected")}>✓</span>}
          <img src={item.previewUrl} alt="" loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  );
}

function PreviewSelection({ items, selectedIds, onToggleSelection }: Pick<ImagePreviewProps, 'items' | 'selectedIds' | 'onToggleSelection'>) {
  const { currentIndex } = useLightboxState();
  const { t } = useTranslation();
  const item = items[currentIndex];
  const selected = !!item && selectedIds.includes(item.id);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
          target.closest('input, textarea, select, summary, a, button:not(.image-preview__select), [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (item) onToggleSelection(item.id);
    }
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [item, onToggleSelection]);

  return <div className="image-preview__selection">
    <button type="button" className="yarl__button image-preview__select" aria-pressed={selected}
      aria-keyshortcuts="Space" title={t(selected ? 'preview.deselect_shortcut' : 'preview.shortcut')} disabled={!item}
      onClick={() => item && onToggleSelection(item.id)}>
      {selected ? '✓ ' : '□ '}{t(selected ? 'preview.selected' : 'preview.select')}
    </button>
  </div>;
}

function PreviewActions({ items, onItemAction }: Pick<ImagePreviewProps, 'items' | 'onItemAction'>) {
  const { currentIndex } = useLightboxState();
  const { t } = useTranslation();
  const item = items[currentIndex];
  if (!item) return null;
  return <details className="image-preview__actions" key={item.id}>
    <summary>{t('preview.item_actions')}</summary>
    <div className="image-preview__action-menu">
      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t('library.source')}</a>
      <button type="button" onClick={() => onItemAction(item, 'organize')}>{t('preview.organize')}</button>
      <button type="button" onClick={() => onItemAction(item, 'notes')}>{t('library.edit_note')}</button>
      <button type="button" className="image-preview__danger" onClick={() => onItemAction(item, 'delete')}>{t('library.delete')}</button>
    </div>
  </details>;
}

function PreviewSummary({ selectedIds, onClearSelection, onBatchAction, multiple }: Pick<ImagePreviewProps, 'selectedIds' | 'onClearSelection' | 'onBatchAction'> & { multiple: boolean }) {
  const { t } = useTranslation();
  return <div className={`image-preview__summary ${multiple ? 'image-preview__summary--multiple' : ''}`}
    onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
    <span className="image-preview__batch-label">{t('preview.batch_actions')}</span>
    <button type="button" className="image-preview__clear" disabled={!selectedIds.length} onClick={() => onBatchAction('organize')}>{t('library.add_to_collection')}</button>
    <button type="button" className="image-preview__clear" disabled={!selectedIds.length} onClick={() => onBatchAction('delete')}>{t('library.delete')}</button>
    <span role="status" aria-live="polite">{t('preview.selection_count', { count: selectedIds.length })}</span>
    <button type="button" className="image-preview__clear" disabled={!selectedIds.length} onClick={onClearSelection}>{t('preview.clear')}</button>
  </div>;
}

export function ImagePreview({ initialIndex, items, onClose, selectedIds, onToggleSelection, onClearSelection, onItemAction, onBatchAction }: ImagePreviewProps) {
  const [open, setOpen] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Selection updates must not replace slides and reset the lightbox position.
  const slides = useMemo(() => items.map((item) => ({
    src: item.imageUrl,
    alt: item.pageTitle,
    title: item.pageTitle,
    description: `${item.siteName} · ${new Date(item.captureTime).toLocaleString()}`,
    // Read natural dimensions: older records may contain preview dimensions.
  })), [items]);

  function handleClose() {
    setOpen(false);
  }

  return (
    <Lightbox
      open={open}
      index={currentIndex}
      close={handleClose}
      on={{ exited: onClose, view: ({ index }) => setCurrentIndex(index) }}
      slides={slides}
      toolbar={{ buttons: [<PreviewSelection key="selection" items={items} selectedIds={selectedIds} onToggleSelection={onToggleSelection} />, <PreviewActions key="actions" items={items} onItemAction={onItemAction} />, 'close'] }}
      plugins={[Captions, Counter, Zoom]}
      styles={{ container: { paddingBottom: items.length > 1 ? '148px' : '44px' } }}
      captions={{
        showToggle: false,
        descriptionMaxLines: 2,
      }}
      counter={{
        container: {
          style: {
            top: 'unset',
            bottom: items.length > 1 ? '9.5rem' : '3.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
          },
        },
      }}
      zoom={{
        maxZoomPixelRatio: 4,
        scrollToZoom: true,
      }}
      render={{
        controls: () => <>
          <PreviewSummary onBatchAction={onBatchAction} selectedIds={selectedIds} onClearSelection={onClearSelection} multiple={items.length > 1} />
          {items.length > 1 && <PreviewThumbnails items={items} selectedIds={selectedIds} />}
        </>,
        ...(items.length <= 1 ? { buttonPrev: () => null, buttonNext: () => null } : {}),
      }}
      animation={{ fade: 200, swipe: 240 }}
    />
  );
}
