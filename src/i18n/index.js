import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.js';
import es from './es.js';

export const LANGS = ['en', 'es'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: 'en',
    supportedLngs: LANGS,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    // ?lang=es in the URL wins (and is remembered), then the saved choice, then the browser language.
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'vslab.lang',
      caches: ['localStorage'],
    },
  });

i18n.on('languageChanged', (lng) => (document.documentElement.lang = lng));
document.documentElement.lang = i18n.resolvedLanguage || 'en';

// Drop ?lang= once applied so later in-app language switches survive a reload.
const url = new URL(window.location.href);
if (url.searchParams.has('lang')) {
  url.searchParams.delete('lang');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export default i18n;
