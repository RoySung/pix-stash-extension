import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomSelect } from '../../components';
import i18n, { type Language, getStoredLanguage, setStoredLanguage } from '../../lib/i18n';

const LANGUAGE_LABEL_ID = 'options-language-label';
const LANGUAGE_OPTIONS: Array<{ label: string; value: Language }> = [
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English (US)', value: 'en-US' },
];

export function App() {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<Language>(getStoredLanguage);

  function handleLanguageChange(next: Language) {
    setLanguage(next);
    setStoredLanguage(next);
    void i18n.changeLanguage(next);
  }

  return (
    <main className="options ps-shell">
      <header className="options__header">
        <h1>{t('options.title')}</h1>
      </header>

      <section className="options__layout">
        <article className="options__panel options__panel--settings">
          <div className="options__panel-head">
            <h2>{t('options.settings_title')}</h2>
          </div>

          <div className="options__settings">
            <div className="options__setting-row">
              <div className="options__setting-copy">
                <p className="options__setting-label" id={LANGUAGE_LABEL_ID}>
                  {t('options.language_label')}
                </p>
              </div>
              <CustomSelect
                ariaLabel={t('options.language_label')}
                id="language-select"
                labelId={LANGUAGE_LABEL_ID}
                onChange={(nextValue) => handleLanguageChange(nextValue as Language)}
                options={LANGUAGE_OPTIONS}
                value={language}
              />
            </div>
          </div>
        </article>

        <article className="options__panel options__panel--guide">
          <div className="options__panel-head">
            <h2>{t('options.guide_title')}</h2>
          </div>

          <div className="options__guide-section">
            <h3>{t('options.workflow_title')}</h3>
            <ul className="options__list">
              <li>{t('options.workflow_1')}</li>
              <li>{t('options.workflow_2')}</li>
            </ul>
          </div>

          <div className="options__guide-section">
            <h3>{t('options.library_care_title')}</h3>
            <div className="options__note-stack">
              <p>{t('options.library_care_1')}</p>
              <div className="options__warning" role="note" aria-label={t('options.storage_notice_label')}>
                <p className="options__warning-label">{t('options.storage_notice_label')}</p>
                <p className="options__warning-text">{t('options.storage_notice')}</p>
              </div>
            </div>
          </div>

          <div className="options__guide-section">
            <h3>{t('options.permissions_title')}</h3>
            <ul className="options__list options__list--compact">
              <li>{t('options.permissions_1')}</li>
              <li>{t('options.permissions_2')}</li>
              <li>{t('options.permissions_3')}</li>
              <li>{t('options.permissions_4')}</li>
            </ul>
          </div>
        </article>
        <article className="options__about" aria-labelledby="about-title">
          <div className="options__about-titlebar">
            <h2 id="about-title">
              <span className="options__about-info" aria-hidden="true">i</span>
              {t('options.about_title')}
            </h2>
          </div>
          <div className="options__about-body">
            <div className="options__about-portrait">
              <img src="/profile-roysung.png" alt="RoySung" width="112" height="112" />
            </div>
            <div className="options__about-copy">
              <h3>RoySung</h3>
              <p>{t('options.about_role')}</p>
              <a className="options__about-link" href="https://roysung.notion.site/" target="_blank" rel="noopener noreferrer">
                {t('options.about_homepage')} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
