import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizeTags } from '../../lib/items';
import type { CollectionRecord, ItemRecord, SaveItemOrganizationInput } from '../../lib/types';
import './ItemOrganizer.css';

export interface ItemOrganizerProps {
  actions?: ReactNode;
  collections: CollectionRecord[];
  item: ItemRecord;
  knownTags: string[];
  onSave: (input: SaveItemOrganizationInput) => Promise<boolean>;
  saveLabel?: string;
  saving?: boolean;
}

export function ItemOrganizer({
  actions,
  collections,
  item,
  knownTags,
  onSave,
  saveLabel,
  saving = false,
}: ItemOrganizerProps) {
  const { t } = useTranslation();
  const resolvedSaveLabel = saveLabel ?? t('library.save_details');
  const [draftCollectionName, setDraftCollectionName] = useState('');
  const [draftTagValue, setDraftTagValue] = useState('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(item.collectionIds);
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags);

  useEffect(() => {
    setSelectedCollectionIds(item.collectionIds);
    setSelectedTags(item.tags);
  }, [item.collectionIds, item.tags]);

  const sortedKnownTags = useMemo(() => {
    const selected = new Set(selectedTags);
    const unselected = knownTags.filter((tag) => !selected.has(tag));
    return unselected;
  }, [knownTags, selectedTags]);

  function toggleCollection(collectionId: string) {
    setSelectedCollectionIds((current) =>
      current.includes(collectionId)
        ? current.filter((entry) => entry !== collectionId)
        : [...current, collectionId],
    );
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((entry) => entry !== tag)
        : normalizeTags([...current, tag]),
    );
  }

  function commitDraftTags() {
    const nextTags = normalizeTags([
      ...selectedTags,
      ...draftTagValue.split(',').map((tag) => tag.trim()),
    ]);

    setSelectedTags(nextTags);
    setDraftTagValue('');
  }

  async function handleSave() {
    const nextTags = normalizeTags([
      ...selectedTags,
      ...draftTagValue.split(',').map((tag) => tag.trim()),
    ]);

    const ok = await onSave({
      itemId: item.id,
      collectionIds: selectedCollectionIds,
      tags: nextTags,
      newCollectionName: draftCollectionName,
    });

    if (!ok) {
      return;
    }

    setDraftCollectionName('');
    setDraftTagValue('');
  }

  function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || !draftTagValue.trim()) {
      return;
    }

    event.preventDefault();
    commitDraftTags();
  }

  return (
    <div className="ps-item-organizer">
      <div className="ps-item-organizer__section">
        <div className="ps-item-organizer__copy">
          <p className="ps-item-organizer__label">{t('library.collections_label')}</p>
        </div>

        {collections.length > 0 ? (
          <div className="ps-item-organizer__chips">
            {collections.map((collection) => {
              const active = selectedCollectionIds.includes(collection.id);
              return (
                <button
                  className={`ps-item-organizer__chip ${active ? 'is-active' : ''}`}
                  key={collection.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleCollection(collection.id)}
                >
                  {collection.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="ps-item-organizer__empty">{t('library.organizer_no_collections')}</p>
        )}

        <details className="ps-item-organizer__disclosure">
          <summary>{t('library.new_collection')}</summary>
          <input
            className="ps-input"
            aria-label={t('library.organizer_collection_placeholder')}
            placeholder={t('library.organizer_collection_placeholder')}
            value={draftCollectionName}
            onChange={(event) => setDraftCollectionName(event.target.value)}
          />
        </details>
      </div>

      <div className="ps-item-organizer__section">
        <div className="ps-item-organizer__copy">
          <p className="ps-item-organizer__label">{t('library.tags_label')}</p>
        </div>

        {selectedTags.length > 0 ? (
          <div className="ps-item-organizer__selected-tags">
            {selectedTags.map((tag) => (
              <button className="ps-item-organizer__selected-tag" key={tag} type="button" onClick={() => toggleTag(tag)}>
                {tag}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="ps-item-organizer__input-row">
          <input
            className="ps-input"
            aria-label={t('library.tags_label')}
            placeholder={t('library.organizer_tags_placeholder')}
            value={draftTagValue}
            onChange={(event) => setDraftTagValue(event.target.value)}
            onKeyDown={handleTagInputKeyDown}
          />
          <button className="ps-button" data-variant="quiet" type="button" onClick={commitDraftTags} disabled={!draftTagValue.trim()}>
            {t('library.organizer_add_tag')}
          </button>
        </div>

        {sortedKnownTags.length > 0 ? (
          <details className="ps-item-organizer__disclosure">
            <summary>{t('library.choose_tags')}</summary>
            <div className="ps-item-organizer__chips">
              {sortedKnownTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    className={`ps-item-organizer__chip ${active ? 'is-active' : ''}`}
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>

      <div className="ps-item-organizer__actions">
        <button className="ps-button" data-variant="accent" type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? t('library.saving') : resolvedSaveLabel}
        </button>
        {actions}
      </div>
    </div>
  );
}