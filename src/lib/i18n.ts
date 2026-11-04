import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US';
import zhTW from './locales/zh-TW';

export type Language = 'zh-TW' | 'en-US';

const LANGUAGE_STORAGE_KEY = 'pixstash.language';

export function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en-US' || stored === 'zh-TW') {
      return stored;
    }
  } catch {
    // ignore
  }
  return 'zh-TW';
}

export function setStoredLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // ignore
  }
  void browser.storage.local.set({ [LANGUAGE_STORAGE_KEY]: language });
}

void i18next.use(initReactI18next).init({
  lng: getStoredLanguage(),
  fallbackLng: 'zh-TW',
  resources: {
    'zh-TW': { translation: zhTW },
    'en-US': { translation: enUS },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
