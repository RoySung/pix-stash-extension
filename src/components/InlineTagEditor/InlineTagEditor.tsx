import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

import { useTranslation } from 'react-i18next';

import { normalizeTags } from '../../lib/items';
import type { ItemRecord } from '../../lib/types';
import './InlineTagEditor.css';

export interface InlineTagEditorProps {
  item: ItemRecord;
  knownTags: string[];
  onCancel: () => void;
  onSave: (itemId: string, tags: string[]) => Promise<boolean>;
}

export function InlineTagEditor({ item, knownTags, onCancel, onSave }: InlineTagEditorProps) {
  const { t } = useTranslation();
  const [draftTagValue, setDraftTagValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(item.tags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedTags(item.tags);
    setDraftTagValue('');
  }, [item.id, item.tags]);

  const sortedKnownTags = useMemo(() => {
    const selected = new Set(selectedTags);
    const unselected = knownTags.filter((tag) => !selected.has(tag));
    return unselected;
  }, [knownTags, selectedTags]);

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
    setSaving(true);
    const nextTags = normalizeTags([
      ...selectedTags,
      ...draftTagValue.split(',').map((tag) => tag.trim()),
    ]);

    const ok = await onSave(item.id, nextTags);
    setSaving(false);

    if (!ok) {
      return;
    }

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
    <div className="ps-inline-tag-editor">
      <div className="ps-inline-tag-editor__copy">
        <p className="ps-inline-tag-editor__label">{t('library.tags_label')}</p>
      </div>

      {selectedTags.length > 0 ? (
        <div className="ps-inline-tag-editor__selected-tags">
          {selectedTags.map((tag) => (
            <button className="ps-inline-tag-editor__selected-tag" key={tag} type="button" onClick={() => toggleTag(tag)}>
              {tag}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="ps-inline-tag-editor__input-row">
        <input
          className="ps-input"
          aria-label={t('library.tags_label')}
          placeholder={t('library.organizer_tags_placeholder')}
          value={draftTagValue}
          onChange={(event) => setDraftTagValue(event.target.value)}
          onKeyDown={handleTagInputKeyDown}
        />
        <button className="ps-button" data-variant="quiet" type="button" onClick={commitDraftTags} disabled={!draftTagValue.trim() || saving}>
          {t('library.organizer_add_tag')}
        </button>
      </div>

      {sortedKnownTags.length > 0 ? (
        <details className="ps-inline-tag-editor__disclosure">
          <summary>{t('library.choose_tags')}</summary>
          <div className="ps-inline-tag-editor__chips">
            {sortedKnownTags.map((tag) => {
              const active = selectedTags.includes(tag);

              return (
                <button
                  className={`ps-inline-tag-editor__chip ${active ? 'is-active' : ''}`}
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

      <div className="ps-inline-tag-editor__actions">
        <button className="ps-button" data-variant="accent" type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? t('library.saving') : t('library.save')}
        </button>
        <button className="ps-button" type="button" onClick={onCancel} disabled={saving}>{t('library.cancel')}</button>
      </div>
    </div>
  );
}
