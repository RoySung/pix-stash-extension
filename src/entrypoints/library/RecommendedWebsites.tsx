import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { bookmarkUrlKey } from '../../lib/bookmarks';
import { RECOMMENDED_WEBSITES, type RecommendedWebsite, type WebsiteCategory } from '../../lib/recommended-websites';
import type { BookmarkRecord } from '../../lib/types';
import './RecommendedWebsites.css';
import { WebsiteFavicon } from './WebsiteFavicon';

interface RecommendedWebsitesProps {
  bookmarks: BookmarkRecord[];
  busy: boolean;
  error: string | null;
  onAdd: (website: RecommendedWebsite, onSaved: () => void) => void;
}

const CATEGORIES: WebsiteCategory[] = ['design', 'race'];

export function RecommendedWebsites({ bookmarks, busy, error, onAdd }: RecommendedWebsitesProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<WebsiteCategory>('design');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const savedUrls = new Set(bookmarks.map(bookmark => bookmarkUrlKey(bookmark.url)));

  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % CATEGORIES.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = CATEGORIES.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setCategory(CATEGORIES[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div className="recommended-websites">
      <div className="recommended-websites__tabs" role="tablist" aria-label={t('recommendations.categories')}>
        {CATEGORIES.map((value, index) => (
          <button key={value} id={`recommendations-tab-${value}`} className="recommended-websites__tab" type="button" role="tab"
            aria-selected={category === value} aria-controls={`recommendations-panel-${value}`} tabIndex={category === value ? 0 : -1}
            onClick={() => setCategory(value)} onKeyDown={event => tabKeys(event, index)}>
            {t(`recommendations.${value}`)}
          </button>
        ))}
      </div>
      {CATEGORIES.map(value => (
        <section key={value} className="recommended-websites__panel" id={`recommendations-panel-${value}`} role="tabpanel"
          aria-labelledby={`recommendations-tab-${value}`} hidden={category !== value}>
          {category === value ? (
            <>
              <p className="recommended-websites__intro">{t(`recommendations.${value}_intro`)}</p>
              <ul className="recommended-websites__list" aria-label={t(`recommendations.${value}`)}>
                {RECOMMENDED_WEBSITES.filter(website => website.category === value).map(website => {
                  const added = savedUrls.has(bookmarkUrlKey(website.url));

                  return (
                    <li className="recommended-websites__row" key={website.id}>
                      <div className="recommended-websites__info">
                        <span className="recommended-websites__name website-title"><WebsiteFavicon url={website.url} /><span>{website.name}</span></span>
                        <p className="recommended-websites__description">{t(`recommendations.descriptions.${website.id}`)}</p>
                      </div>
                      <div className="recommended-websites__tools">
                        <a className="ps-button" href={website.url} target="_blank" rel="noopener noreferrer"
                          aria-label={t(value === 'race' ? 'recommendations.find_named' : 'recommendations.open_named', { name: website.name })}>
                          {t(value === 'race' ? 'recommendations.find_photos' : 'recommendations.open')}
                        </a>
                        <button className="ps-button" type="button" data-bookmark-add disabled={busy || added}
                          aria-label={t(added ? 'recommendations.added_named' : 'recommendations.add_named', { name: website.name })}
                          onClick={() => onAdd(website, () => setLastAdded(website.name))}>
                          {t(added ? 'recommendations.added' : 'recommendations.add')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </section>
      ))}
      {error ? <p className="bookmarks-error" role="alert">{t(`bookmarks.${error}`)}</p> : null}
      <div className="recommended-websites__footer">
        <p className="recommended-websites__status" role="status">{lastAdded ? t('recommendations.saved', { name: lastAdded }) : t('recommendations.hint')}</p>
      </div>
    </div>
  );
}
