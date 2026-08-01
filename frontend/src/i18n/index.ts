import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import esCommon from './locales/es/common.json'
import esAuth from './locales/es/auth.json'
import esFarm from './locales/es/farm.json'
import esField from './locales/es/field.json'
import esEditor from './locales/es/editor.json'
import esPages from './locales/es/pages.json'
import esScouting from './locales/es/scouting.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enFarm from './locales/en/farm.json'
import enField from './locales/en/field.json'
import enEditor from './locales/en/editor.json'
import enPages from './locales/en/pages.json'
import enScouting from './locales/en/scouting.json'

// ──────────────────────────────────────────────────────────────────────────
// i18n (SRS: EN+ES). Spanish is the source language — every key exists in
// es/*; missing English falls back to Spanish rather than a bare key. The
// choice persists in localStorage and defaults to the browser language.
// Namespaces mirror the feature areas so dictionary files stay reviewable.
// ──────────────────────────────────────────────────────────────────────────

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon, auth: esAuth, farm: esFarm, field: esField,
        editor: esEditor, pages: esPages, scouting: esScouting,
      },
      en: {
        common: enCommon, auth: enAuth, farm: enFarm, field: enField,
        editor: enEditor, pages: enPages, scouting: enScouting,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'mi-finca-lang',
    },
  })

/** BCP-47 tag for date/number formatting that follows the UI language. */
export function dateLocale(): string {
  return i18n.language?.startsWith('en') ? 'en-US' : 'es-PR'
}

export default i18n
